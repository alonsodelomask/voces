import { z } from 'zod';

import { parseEncryptionKey } from './apple/crypto.ts';

/**
 * Configuración desde las variables de entorno (Render › Environment, o `server/.env` en el PC).
 * Los errores sólo nombran la variable, nunca su valor.
 */
const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(10000),
  VOCES_DATA: z.enum(['supabase', 'memory']).default('supabase'),
  VOCES_AI: z.enum(['real', 'simulated']).default('real'),
  VOCES_AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(10_000).default(40),
  VOCES_CORS_ORIGINS: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  APPLE_TEAM_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  APPLE_KEY_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  APPLE_PRIVATE_KEY: z.string().min(100).optional(),
  APPLE_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  APPLE_CLIENT_ID: z.string().default('es.vocify.app'),
});

export type Config = {
  port: number;
  data: 'supabase' | 'memory';
  ai: 'real' | 'simulated';
  aiDailyLimit: number;
  corsOrigins: string[];
  supabase: { url: string; serviceRoleKey: string | null; jwtSecret: string | null };
  anthropicKey: string | null;
  apple: { teamId: string; keyId: string; privateKey: string; clientId: string; encryptionKey: Buffer } | null;
  appleMissing: string[];
};

/** Orígenes de la app que siempre pueden llamar a la API: la app de iPhone/Android y el servidor local de desarrollo. */
export const APP_ORIGINS = ['https://app.voces.invalid', 'http://localhost:5173'];

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  // Variables vacías en Render = sin valor.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = env.safeParse(cleaned);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Configuración no válida en: ${names.join(', ')}`);
  }
  const v = parsed.data;
  if (!v.SUPABASE_URL) throw new Error('Falta SUPABASE_URL (para verificar las sesiones).');
  // Sin SUPABASE_SERVICE_ROLE_KEY el servidor arranca igual (modo espera): /health responde y el resto dice «no configurado».

  const appleNames = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_TOKEN_ENCRYPTION_KEY'] as const;
  const appleMissing = appleNames.filter((n) => !v[n]);
  const key = v.APPLE_TOKEN_ENCRYPTION_KEY ? parseEncryptionKey(v.APPLE_TOKEN_ENCRYPTION_KEY) : null;
  if (v.APPLE_TOKEN_ENCRYPTION_KEY && !key) throw new Error('Configuración no válida en: APPLE_TOKEN_ENCRYPTION_KEY');

  return {
    port: v.PORT,
    data: v.VOCES_DATA,
    ai: v.VOCES_AI,
    aiDailyLimit: v.VOCES_AI_DAILY_LIMIT,
    corsOrigins: [...APP_ORIGINS, ...(v.VOCES_CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)],
    supabase: { url: v.SUPABASE_URL, serviceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY ?? null, jwtSecret: v.SUPABASE_JWT_SECRET ?? null },
    anthropicKey: v.ANTHROPIC_API_KEY ?? null,
    apple:
      appleMissing.length === 0 && key
        ? { teamId: v.APPLE_TEAM_ID!, keyId: v.APPLE_KEY_ID!, privateKey: v.APPLE_PRIVATE_KEY!, clientId: v.APPLE_CLIENT_ID, encryptionKey: key }
        : null,
    appleMissing: [...appleMissing],
  };
}
