import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { ApiError } from './errors.ts';

/**
 * Verificación del JWT de Supabase Auth (igual que en Baulify). Dos modos:
 * - claves de firma asimétricas del proyecto (JWKS público en `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), el actual;
 * - el secreto JWT heredado (HS256), si se configura `SUPABASE_JWT_SECRET`.
 * Se exige el emisor del proyecto, la audiencia y el rol `authenticated` y un `sub` con forma de UUID.
 */
export type Verifier = (token: string) => Promise<string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVerifier(options: { supabaseUrl: string; jwtSecret?: string | null; jwks?: JWTVerifyGetKey }): Verifier {
  const issuer = `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  const secret = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : null;
  const jwks = options.jwks ?? (secret ? null : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));
  return async (token: string) => {
    try {
      const { payload } = secret
        ? await jwtVerify(token, secret, { issuer, audience: 'authenticated', algorithms: ['HS256'] })
        : await jwtVerify(token, jwks!, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256', 'EdDSA'] });
      if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new Error('claims');
      return payload.sub.toLowerCase();
    } catch {
      throw new ApiError('unauthorized', 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
    }
  };
}

export function bearerToken(header: string | undefined): string {
  const match = header?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/);
  if (!match || match[1].length > 8192) throw new ApiError('unauthorized', 'Inicia sesión para continuar.');
  return match[1];
}

/** Límite sencillo por persona (protección contra abusos): ventana fija en memoria del proceso. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }
  hit(key: string): void {
    const now = this.now();
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      if (this.windows.size > 50_000) this.windows.clear();
      this.windows.set(key, { start: now, count: 1 });
      return;
    }
    window.count += 1;
    if (window.count > this.limit) throw new ApiError('rate-limited', 'Demasiadas peticiones seguidas. Espera un momento.');
  }
}
