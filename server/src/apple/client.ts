import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type CryptoKey, type JWTVerifyGetKey } from 'jose';

/**
 * Cliente de «Sign in with Apple» REST (sólo lo que hace falta para revocar al borrar la cuenta, norma 5.1.1(v)):
 *
 * - `exchangeCode`: canjea el `authorizationCode` del inicio de sesión nativo en `/auth/token` y devuelve el refresh
 *   token y el `sub` (identidad de Apple) del `id_token` de la respuesta, VERIFICADO: firma con las claves públicas de
 *   Apple (`/auth/keys`), emisor https://appleid.apple.com y audiencia el client_id. El de acceso se descarta.
 * - `revoke`: `/auth/revoke` con el refresh token (`token_type_hint=refresh_token`).
 *
 * El `client_secret` es un JWT ES256 firmado con la clave .p8 («Sign in with Apple» de developer.apple.com): `iss` el
 * Team ID, `sub` el client_id (el bundle de la app, porque el inicio es nativo), `aud` https://appleid.apple.com,
 * `kid` el Key ID y 5 minutos de vida. Nada de lo que se envía o se recibe se escribe en los registros: los errores
 * sólo llevan un código propio.
 */
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const SECRET_SECONDS = 300;
const TIMEOUT_MS = 10_000;

export type AppleCredentials = { teamId: string; keyId: string; privateKey: string; clientId: string };

/** `subject`: el `sub` del `id_token` verificado, o null si no llegó o no se pudo verificar (no se atribuye a nadie). */
export type AppleExchange = { refreshToken: string; subject: string | null };

export interface AppleClient {
  /** Canjea el código. `AppleCodeRejectedError` si Apple lo rechaza (caducado, usado o de otra app). */
  exchangeCode(authorizationCode: string): Promise<AppleExchange>;
  /** Revoca el refresh token. Un token que Apple ya no reconoce cuenta como revocado. */
  revoke(refreshToken: string): Promise<void>;
}

/** Apple rechaza el código (caduca a los 5 minutos y sólo vale una vez). */
export class AppleCodeRejectedError extends Error {
  constructor() {
    super('apple-code-rejected');
    this.name = 'AppleCodeRejectedError';
  }
}

/** Apple no responde, responde con error o rechaza nuestras credenciales: se puede reintentar más tarde. */
export class AppleUnavailableError extends Error {
  constructor(code = 'apple-unavailable') {
    super(code);
    this.name = 'AppleUnavailableError';
  }
}

/** Render guarda bien una clave de varias líneas, pero por si se pegó en una sola con «\n» escritos. */
export function normalizePrivateKey(raw: string): string {
  return raw.trim().replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

/** Cuerpo JSON acotado (la respuesta de Apple es pequeña); null si no es JSON. */
async function readSmallJson(response: Response, maxBytes = 64_000): Promise<Record<string, unknown> | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `jwks`: claves públicas de Apple (por defecto, las de `/auth/keys`, guardadas en memoria; en las pruebas, unas ficticias). */
export function createAppleClient(options: AppleCredentials & { fetcher?: typeof fetch; now?: () => number; jwks?: JWTVerifyGetKey }): AppleClient {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let key: Promise<CryptoKey> | null = null;
  let jwks = options.jwks ?? null;

  /** El `sub` del `id_token` si la firma, el emisor, la audiencia y la caducidad son buenos; si no, null. */
  async function verifiedSubject(idToken: unknown): Promise<string | null> {
    if (typeof idToken !== 'string' || !idToken || idToken.length > 8000) return null;
    jwks ??= createRemoteJWKSet(new URL(APPLE_KEYS_URL), { timeoutDuration: TIMEOUT_MS });
    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: APPLE_ISSUER,
        audience: options.clientId,
        algorithms: ['RS256', 'ES256'],
        currentDate: new Date(now()),
        clockTolerance: 60,
      });
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async function clientSecret(): Promise<string> {
    key ??= importPKCS8(normalizePrivateKey(options.privateKey), 'ES256');
    let signingKey: CryptoKey;
    try {
      signingKey = await key;
    } catch {
      key = null;
      throw new AppleUnavailableError('apple-key-invalid');
    }
    const issuedAt = Math.floor(now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: options.keyId })
      .setIssuer(options.teamId)
      .setSubject(options.clientId)
      .setAudience(APPLE_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + SECRET_SECONDS)
      .sign(signingKey);
  }

  async function post(url: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const secret = await clientSecret();
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: options.clientId, client_secret: secret, ...form }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      throw new AppleUnavailableError();
    }
    return { status: response.status, body: await readSmallJson(response).catch(() => null) };
  }

  return {
    async exchangeCode(authorizationCode) {
      const { status, body } = await post(APPLE_TOKEN_URL, { grant_type: 'authorization_code', code: authorizationCode });
      if (status === 200) {
        const refresh = body?.refresh_token;
        if (typeof refresh !== 'string' || !refresh || refresh.length > 2000) throw new AppleUnavailableError('apple-invalid-response');
        return { refreshToken: refresh, subject: await verifiedSubject(body?.id_token) };
      }
      if (status === 400 && body?.error === 'invalid_grant') throw new AppleCodeRejectedError();
      throw new AppleUnavailableError(status === 400 || status === 401 ? `apple-${String(body?.error ?? 'rejected').replace(/[^a-z_]/g, '').slice(0, 40)}` : 'apple-unavailable');
    },

    async revoke(refreshToken) {
      const { status, body } = await post(APPLE_REVOKE_URL, { token: refreshToken, token_type_hint: 'refresh_token' });
      if (status === 200) return;
      // Ya revocado por la persona (Ajustes del iPhone › Iniciar sesión con Apple) o caducado: no queda nada que revocar.
      if (status === 400 && body?.error === 'invalid_grant') return;
      throw new AppleUnavailableError(status === 400 || status === 401 ? `apple-${String(body?.error ?? 'rejected').replace(/[^a-z_]/g, '').slice(0, 40)}` : 'apple-unavailable');
    },
  };
}
