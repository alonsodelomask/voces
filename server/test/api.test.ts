import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { SignJWT } from 'jose';

import { AccountService } from '../src/account.ts';
import { createSimulatedProvider, type AiProvider } from '../src/ai.ts';
import { AppleCodeRejectedError, AppleUnavailableError, type AppleClient } from '../src/apple/client.ts';
import { decryptToken, encryptToken, parseEncryptionKey } from '../src/apple/crypto.ts';
import { createApp } from '../src/app.ts';
import { createVerifier } from '../src/auth.ts';
import { ApiError } from '../src/errors.ts';
import { loadConfig } from '../src/config.ts';
import { MemoryStore } from '../src/store.ts';

const SUPABASE_URL = 'https://ficticio.supabase.co';
const SECRET = 'secreto-de-pruebas-muy-largo-123456';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

async function token(sub: string, overrides: Record<string, unknown> = {}) {
  return new SignJWT({ role: 'authenticated', ...overrides })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

function fakeApple(options: { subject?: string | null; failRevoke?: boolean; rejectCode?: boolean } = {}) {
  const revoked: string[] = [];
  let failRevoke = options.failRevoke ?? false;
  const client: AppleClient = {
    async exchangeCode(code) {
      if (options.rejectCode) throw new AppleCodeRejectedError();
      return { refreshToken: `refresh-${code}`, subject: options.subject === undefined ? 'apple-sub-alice' : options.subject };
    },
    async revoke(t) {
      if (failRevoke) throw new AppleUnavailableError();
      revoked.push(t);
    },
  };
  return { client, revoked, setFail: (v: boolean) => (failRevoke = v) };
}

function setup(opts: { ai?: AiProvider | null; limit?: number; apple?: ReturnType<typeof fakeApple> | null } = {}) {
  const store = new MemoryStore();
  store.appleIdentities.set(ALICE, 'apple-sub-alice');
  const key = randomBytes(32);
  const apple = opts.apple === undefined ? fakeApple() : opts.apple;
  const account = new AccountService({ store, apple: apple ? { client: apple.client, key } : null });
  const app = createApp({
    verify: createVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: SECRET }),
    store,
    ai: opts.ai === undefined ? createSimulatedProvider() : opts.ai,
    aiDailyLimit: opts.limit ?? 40,
    account,
    corsOrigins: ['https://app.voces.invalid'],
  });
  return { app, store, account, key, apple };
}

async function call(app: ReturnType<typeof createApp>, method: string, path: string, init: { auth?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.auth) headers.Authorization = `Bearer ${init.auth}`;
  if (init.origin) headers.Origin = init.origin;
  const res = await app.request(path, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as any, headers: res.headers };
}

const SONG = 'Título: Prueba\nVoz id=v1 «Soprano»: 0:1:C5 1:1:D5';

describe('API de Voces', () => {
  it('responde a /health sin sesión', async () => {
    const { app } = setup();
    const r = await call(app, 'GET', '/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true });
  });

  it('exige sesión en /v1 y rechaza tokens de otro proyecto o rol', async () => {
    const { app } = setup();
    assert.equal((await call(app, 'POST', '/v1/ai', { body: { prompt: 'hola', song: SONG } })).status, 401);
    const anon = await token(ALICE, { role: 'anon' });
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: anon, body: { prompt: 'hola', song: SONG } })).status, 401);
    const other = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ALICE)
      .setIssuer('https://otro.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: other, body: { prompt: 'hola', song: SONG } })).status, 401);
  });

  it('la IA responde y aplica el límite diario por persona', async () => {
    const { app, store } = setup({ limit: 2 });
    const t = await token(ALICE);
    const first = await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'Crea una segunda voz', song: SONG } });
    assert.equal(first.status, 200);
    assert.ok(first.json.reply.includes('simulada'));
    assert.equal(first.json.voices[0].notes.length, 3);
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'Otra', song: SONG } })).status, 200);
    const third = await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'Y otra', song: SONG } });
    assert.equal(third.status, 429);
    assert.match(third.json.error.message, /límite de 2/);
    assert.equal(store.usage.length, 2);
    // Otra persona tiene su propio límite.
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: await token(BOB), body: { prompt: 'Hola', song: SONG } })).status, 200);
  });

  it('valida la petición de la IA', async () => {
    const { app } = setup();
    const t = await token(ALICE);
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: '', song: SONG } })).status, 400);
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'x', song: SONG, extra: 1 } })).status, 400);
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'x'.repeat(16_001), song: SONG } })).status, 400);
    // «Afinar con IA» de la app 1.0 manda la lista de diferencias en la petición: unos 10.000 caracteres caben.
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'c.12 pulso 3.00: partitura Mi4, se oye Fa4 (+1)\n'.repeat(200), song: SONG } })).status, 200);
  });

  it('un fallo de la IA no gasta el cupo si no llegó a contestar; si contestó (aunque mal), sí', async () => {
    let fallo: ApiError | null = new ApiError('ai-unavailable', 'La IA está saturada; prueba en un minuto.', { free: true });
    const ai: AiProvider = {
      name: 'IA de pruebas',
      async arrange() {
        if (fallo) throw fallo;
        return { reply: 'Hecho.', chords: [], voices: [] };
      },
    };
    const { app, store } = setup({ ai });
    const t = await token(ALICE);
    const r = await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'hola', song: SONG } });
    assert.equal(r.status, 503);
    assert.equal(store.usage.length, 0);
    fallo = new ApiError('ai-failed', 'La respuesta era demasiado larga.');
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'hola', song: SONG } })).status, 502);
    assert.equal(store.usage.length, 1);
    fallo = null;
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'hola', song: SONG } })).status, 200);
    assert.equal(store.usage.length, 2);
  });

  it('dos peticiones a la vez cuando queda una en el cupo: solo pasa una', async () => {
    // La IA tarda (como OpenAI): mientras la primera está esperando, la segunda ya debe ver el cupo gastado.
    let soltar: () => void = () => {};
    const espera = new Promise<void>((r) => (soltar = r));
    const ai: AiProvider = {
      name: 'IA lenta de pruebas',
      async arrange() {
        await espera;
        return { reply: 'Hecho.', chords: [], voices: [] };
      },
    };
    const { app, store } = setup({ ai, limit: 2 });
    store.usage.push({ userId: ALICE, at: new Date().toISOString() });
    // Y contar en la base tarda (como Supabase): sin turnos, las dos contarían a la vez y verían el mismo número.
    const contar = store.aiUsageSince.bind(store);
    store.aiUsageSince = async (...args) => {
      const n = await contar(...args);
      await new Promise((r) => setTimeout(r, 10));
      return n;
    };
    const t = await token(ALICE);
    const a = call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'una', song: SONG } });
    const b = call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'otra', song: SONG } });
    setTimeout(soltar, 20);
    const estados = (await Promise.all([a, b])).map((r) => r.status).sort();
    assert.deepEqual(estados, [200, 429]);
    assert.equal(store.usage.length, 2);
  });

  it('sin IA configurada responde 503 sin gastar el cupo', async () => {
    const { app, store } = setup({ ai: null });
    const r = await call(app, 'POST', '/v1/ai', { auth: await token(ALICE), body: { prompt: 'hola', song: SONG } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'not-configured');
    assert.equal(store.usage.length, 0);
  });

  it('CORS sólo para los orígenes de la app', async () => {
    const { app } = setup();
    const ok = await call(app, 'GET', '/health', { origin: 'https://app.voces.invalid' });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.voces.invalid');
    const bad = await call(app, 'GET', '/health', { origin: 'https://malicioso.example' });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });
});

describe('Cuenta y Apple', () => {
  it('guarda el token de Apple cifrado si es de la misma identidad', async () => {
    const { app, store, key } = setup();
    const r = await call(app, 'POST', '/v1/apple/authorization', { auth: await token(ALICE), body: { authorizationCode: 'codigo-de-apple-1' } });
    assert.equal(r.status, 200);
    const sealed = store.appleTokens.get(ALICE)!;
    assert.ok(sealed.startsWith('v1.'));
    assert.ok(!sealed.includes('refresh-'));
    assert.equal(decryptToken(key, sealed), 'refresh-codigo-de-apple-1');
  });

  it('rechaza un código de otra identidad y revoca su token', async () => {
    const apple = fakeApple({ subject: 'apple-sub-de-otra' });
    const { app, store } = setup({ apple });
    const r = await call(app, 'POST', '/v1/apple/authorization', { auth: await token(ALICE), body: { authorizationCode: 'codigo-de-apple-2' } });
    assert.equal(r.status, 400);
    assert.equal(store.appleTokens.size, 0);
    assert.deepEqual(apple.revoked, ['refresh-codigo-de-apple-2']);
  });

  it('un código caducado da un error claro', async () => {
    const { app } = setup({ apple: fakeApple({ rejectCode: true }) });
    const r = await call(app, 'POST', '/v1/apple/authorization', { auth: await token(ALICE), body: { authorizationCode: 'codigo-caducado-x' } });
    assert.equal(r.status, 400);
    assert.match(r.json.error.message, /caducado/);
  });

  it('borrar la cuenta revoca el token de Apple y borra los datos', async () => {
    const { app, store, apple } = setup();
    const t = await token(ALICE);
    await call(app, 'POST', '/v1/apple/authorization', { auth: t, body: { authorizationCode: 'codigo-de-apple-3' } });
    const r = await call(app, 'DELETE', '/v1/account', { auth: t });
    assert.equal(r.status, 200);
    assert.deepEqual(apple!.revoked, ['refresh-codigo-de-apple-3']);
    assert.deepEqual(store.deleted, [ALICE]);
    assert.equal(store.appleTokens.size, 0);
  });

  it('si Apple no responde, borra igual y reintenta la revocación después', async () => {
    const apple = fakeApple();
    const { app, store, account } = setup({ apple });
    const t = await token(ALICE);
    await call(app, 'POST', '/v1/apple/authorization', { auth: t, body: { authorizationCode: 'codigo-de-apple-4' } });
    apple.setFail(true);
    assert.equal((await call(app, 'DELETE', '/v1/account', { auth: t })).status, 200);
    assert.deepEqual(store.deleted, [ALICE]);
    assert.equal(store.revocations.length, 1);
    apple.setFail(false);
    assert.equal(await account.retryRevocations(), 1);
    assert.equal(store.revocations.length, 0);
    assert.deepEqual(apple.revoked, ['refresh-codigo-de-apple-4']);
  });

  it('sin credenciales de Apple, borrar la cuenta funciona igual', async () => {
    const { app, store } = setup({ apple: null });
    assert.equal((await call(app, 'DELETE', '/v1/account', { auth: await token(BOB) })).status, 200);
    assert.deepEqual(store.deleted, [BOB]);
  });
});

describe('Modo espera', () => {
  it('sin la clave secreta de Supabase arranca y responde «no configurado»', async () => {
    const { UnconfiguredStore } = await import('../src/store.ts');
    const c = loadConfig({ SUPABASE_URL: SUPABASE_URL, VOCES_DATA: 'supabase', SUPABASE_JWT_SECRET: SECRET, VOCES_AI: 'simulated' });
    assert.equal(c.supabase.serviceRoleKey, null);
    const store = new UnconfiguredStore();
    const app = createApp({ verify: createVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: SECRET }), store, ai: createSimulatedProvider(), aiDailyLimit: 40, account: new AccountService({ store, apple: null }), corsOrigins: [] });
    assert.equal((await call(app, 'GET', '/health')).status, 200);
    const r = await call(app, 'POST', '/v1/ai', { auth: await token(ALICE), body: { prompt: 'hola', song: SONG } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'not-configured');
    assert.equal((await call(app, 'DELETE', '/v1/account', { auth: await token(ALICE) })).status, 503);
  });
});

describe('Limpieza', () => {
  it('el registro de uso de la IA se borra a los 30 días', async () => {
    const store = new MemoryStore();
    store.usage.push({ userId: ALICE, at: new Date(Date.now() - 40 * 86400_000).toISOString() }, { userId: ALICE, at: new Date().toISOString() });
    assert.equal(await store.purgeAiUsage(new Date(Date.now() - 30 * 86400_000).toISOString()), 1);
    assert.equal(store.usage.length, 1);
  });
});

describe('Configuración', () => {
  it('nombra la variable que falla, nunca su valor', () => {
    assert.throws(() => loadConfig({ SUPABASE_URL: 'no-es-una-url', SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(30) }), (e: Error) => {
      assert.match(e.message, /SUPABASE_URL/);
      assert.ok(!e.message.includes('no-es-una-url'));
      return true;
    });
  });

  it('la clave de cifrado vale en base64, en hexadecimal y como la crea «Generate» de Render; otra cosa, no', () => {
    const b64 = randomBytes(32).toString('base64');
    assert.equal(parseEncryptionKey(b64)?.length, 32);
    assert.equal(parseEncryptionKey(randomBytes(32).toString('hex'))?.length, 32);
    const render = randomBytes(16).toString('hex');
    const k = parseEncryptionKey(render);
    assert.equal(k?.length, 32);
    assert.deepEqual(parseEncryptionKey(render.toUpperCase()), k);
    assert.notDeepEqual(parseEncryptionKey(randomBytes(16).toString('hex')), k);
    assert.equal(decryptToken(k!, encryptToken(k!, 'token-de-prueba')), 'token-de-prueba');
    for (const mala of ['corta', randomBytes(16).toString('base64'), randomBytes(24).toString('hex'), 'z'.repeat(32)]) assert.equal(parseEncryptionKey(mala), null);
  });

  it('las variables vacías cuentan como no puestas y Apple queda desactivado sin sus cuatro claves', () => {
    const c = loadConfig({ SUPABASE_URL: SUPABASE_URL, VOCES_DATA: 'memory', OPENAI_API_KEY: '', APPLE_TEAM_ID: 'ABCDE12345' });
    assert.equal(c.openai, null);
    assert.equal(c.apple, null);
    assert.deepEqual(c.appleMissing, ['APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_TOKEN_ENCRYPTION_KEY']);
    assert.ok(c.corsOrigins.includes('https://app.voces.invalid'));
  });
});
