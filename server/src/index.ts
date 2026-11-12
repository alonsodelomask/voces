import { serve } from '@hono/node-server';

import { AccountService } from './account.ts';
import { createClaudeProvider, createSimulatedProvider, type AiProvider } from './ai.ts';
import { createAppleClient } from './apple/client.ts';
import { createApp } from './app.ts';
import { createVerifier } from './auth.ts';
import { loadConfig, type Config } from './config.ts';
import { MemoryStore, SupabaseStore, UnconfiguredStore, type Store } from './store.ts';

export function buildServer(config: Config) {
  const store: Store =
    config.data === 'memory'
      ? new MemoryStore()
      : config.supabase.serviceRoleKey
        ? new SupabaseStore(config.supabase.url, config.supabase.serviceRoleKey)
        : new UnconfiguredStore();
  if (config.data === 'supabase' && !config.supabase.serviceRoleKey) {
    console.warn('[voces] MODO ESPERA: falta SUPABASE_SERVICE_ROLE_KEY. /health responde; el resto dice «no configurado» hasta que la pongas.');
  }
  const verify = createVerifier({ supabaseUrl: config.supabase.url, jwtSecret: config.supabase.jwtSecret });

  let ai: AiProvider | null = null;
  if (config.ai === 'simulated') ai = createSimulatedProvider();
  else if (config.anthropicKey) ai = createClaudeProvider(config.anthropicKey);

  const apple = config.apple
    ? {
        client: createAppleClient({ teamId: config.apple.teamId, keyId: config.apple.keyId, privateKey: config.apple.privateKey, clientId: config.apple.clientId }),
        key: config.apple.encryptionKey,
      }
    : null;
  const account = new AccountService({ store, apple });
  const app = createApp({ verify, store, ai, aiDailyLimit: config.aiDailyLimit, account, corsOrigins: config.corsOrigins });

  // Avisos al arrancar: sólo nombres de variables, nunca valores.
  if (!ai) console.warn('[voces] IA desactivada: falta ANTHROPIC_API_KEY (o pon VOCES_AI=simulated para probar).');
  if (!apple) console.warn(`[voces] revocación del token de Apple desactivada: faltan ${config.appleMissing.join(', ')}. Borrar la cuenta funciona igual, sin revocar.`);
  return { app, account, ai };
}

if (import.meta.main) {
  const config = loadConfig();
  const { app, account, ai } = buildServer(config);
  // Revocaciones de Apple pendientes: al arrancar y cada hora.
  const retry = () => account.retryRevocations().catch(() => console.error('[voces] no se han podido reintentar las revocaciones de Apple'));
  void retry();
  setInterval(retry, 3600_000).unref();
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[voces] API en el puerto ${info.port} · datos: ${config.data} · IA: ${ai?.name ?? 'desactivada'} · Apple: ${account.appleEnabled ? 'revocación activa' : 'sin revocación'}`);
  });
}
