import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';

import type { AccountService } from './account.ts';
import { aiRequest, type AiProvider } from './ai.ts';
import { bearerToken, RateLimiter, type Verifier } from './auth.ts';
import { ApiError, errorClassName } from './errors.ts';
import type { Store } from './store.ts';

/**
 * API HTTP de Voces (versión 1). Todas las rutas salvo `/health` exigen la sesión de Supabase (JWT).
 * Errores: `{ error: { code, message } }`.
 */
type Env = { Variables: { userId: string } };

const appleCode = z.object({ authorizationCode: z.string().min(10).max(2000) }).strict();

export type AppDeps = {
  verify: Verifier;
  store: Store;
  ai: AiProvider | null;
  aiDailyLimit: number;
  account: AccountService;
  corsOrigins: string[];
  now?: () => number;
};

export function createApp(deps: AppDeps) {
  const app = new Hono<Env>();
  const now = deps.now ?? Date.now;
  const burst = new RateLimiter(6, 60_000, now); // como mucho 6 peticiones a la IA por minuto y persona
  const accountLimiter = new RateLimiter(10, 60_000, now);

  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: (origin) => (deps.corsOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use('/v1/*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: { code: 'invalid-request', message: 'La petición es demasiado grande.' } }, 413) }));

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message } }, error.status as 400);
    console.error(`[voces] error interno: ${errorClassName(error)}`);
    return c.json({ error: { code: 'internal', message: 'Algo ha fallado en el servidor. Prueba otra vez.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'invalid-request', message: 'Esa ruta no existe.' } }, 404));

  app.get('/health', (c) => c.json({ ok: true }));

  // Sesión obligatoria en /v1.
  app.use('/v1/*', async (c, next) => {
    const userId = await deps.verify(bearerToken(c.req.header('Authorization')));
    c.set('userId', userId);
    await next();
  });

  async function body<T>(c: Context<Env>, schema: z.ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiError('invalid-request', 'Petición no válida.');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiError('invalid-request', 'Petición no válida.');
    return parsed.data;
  }

  /** Ideas de arreglo con Claude. Límite: unas pocas por minuto y `aiDailyLimit` al día por persona. */
  app.post('/v1/ai', async (c) => {
    if (!deps.ai) throw new ApiError('not-configured', 'La IA todavía no está activada en el servidor.');
    const userId = c.get('userId');
    burst.hit(userId);
    const request = await body(c, aiRequest);
    const since = new Date(now() - 24 * 3600_000).toISOString();
    if ((await deps.store.aiUsageSince(userId, since)) >= deps.aiDailyLimit) {
      throw new ApiError('rate-limited', `Has llegado al límite de ${deps.aiDailyLimit} peticiones a la IA por día.`);
    }
    await deps.store.recordAiUsage(userId);
    return c.json(await deps.ai.arrange(request));
  });

  /** Tras «Iniciar sesión con Apple»: guarda el token para poder revocarlo al borrar la cuenta. */
  app.post('/v1/apple/authorization', async (c) => {
    const userId = c.get('userId');
    accountLimiter.hit(userId);
    const { authorizationCode } = await body(c, appleCode);
    await deps.account.registerAppleCode(userId, authorizationCode);
    return c.json({ ok: true });
  });

  /** Borra la cuenta y sus datos (y revoca el acceso de Apple). */
  app.delete('/v1/account', async (c) => {
    const userId = c.get('userId');
    accountLimiter.hit(userId);
    await deps.account.deleteAccount(userId);
    return c.json({ ok: true });
  });

  return app;
}
