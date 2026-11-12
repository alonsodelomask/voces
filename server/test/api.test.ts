import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { SignJWT } from 'jose';

import { AccountService } from '../src/account.ts';
import { createSimulatedProvider, type AiProvider } from '../src/ai.ts';
import { AppleCodeRejectedError, AppleUnavailableError, type AppleClient } from '../src/apple/client.ts';
import { decryptToken } from '../src/apple/crypto.ts';
import { createApp } from '../src/app.ts';
import { createVerifier } from '../src/auth.ts';
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
    assert.equal((await call(app, 'POST', '/v1/ai', { auth: t, body: { prompt: 'x'.repeat(2001), song: SONG } })).status, 400);
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

describe('Configuración', () => {
  it('nombra la variable que falla, nunca su valor', () => {
    assert.throws(() => loadConfig({ SUPABASE_URL: 'no-es-una-url', SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(30) }), (e: Error) => {
      assert.match(e.message, /SUPABASE_URL/);
      assert.ok(!e.message.includes('no-es-una-url'));
      return true;
    });
  });

  it('las variables vacías cuentan como no puestas y Apple queda desactivado sin sus cuatro claves', () => {
    const c = loadConfig({ SUPABASE_URL: SUPABASE_URL, VOCES_DATA: 'memory', ANTHROPIC_API_KEY: '', APPLE_TEAM_ID: 'ABCDE12345' });
    assert.equal(c.anthropicKey, null);
    assert.equal(c.apple, null);
    assert.deepEqual(c.appleMissing, ['APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_TOKEN_ENCRYPTION_KEY']);
    assert.ok(c.corsOrigins.includes('https://app.voces.invalid'));
  });
});
