// El servidor de Render (plan gratuito) se duerme tras un rato sin uso y tarda hasta un minuto en despertar. Mientras
// tanto no contesta, o contesta Render con una página de error que el navegador no deja leer (sin CORS), y eso parecía
// «sin conexión». Aquí se distingue: sin Internet de verdad, o el servidor que se está despertando.
// Sin Supabase ni nada de la app: así se prueba suelto (scripts/iaArreglos.test.mjs).

export const WAKING_MSG = 'El servidor se está despertando, vuelve a intentarlo en unos segundos.';
export const OFFLINE_MSG = 'No hay conexión a Internet. Comprueba la conexión y prueba otra vez.';

/** El servidor no puede atender ahora (sin configurar, dormido o sin conexión). */
export class ApiUnavailable extends Error {}

/** ¿Hay Internet, según el navegador? (Si no lo sabe, se supone que sí.) */
export function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export const SLOW_MSG = 'El servidor está tardando demasiado en contestar. Espera un minuto antes de volver a probar (si era para la IA, pide algo más acotado).';

/** ¿La petición se cortó porque se agotó la espera (`AbortSignal.timeout`)? */
export function isTimeout(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'TimeoutError';
}

/**
 * El mensaje cuando el servidor no ha llegado a contestar. Si falla la conexión, con Internet lo más probable es que
 * esté despertando. Si se agota la espera, no: despierta en un minuto, y una petición larga a la IA (que ya lo ha
 * despertado antes) puede seguir en marcha en el servidor; decir «despertando» invitaría a repetirla enseguida.
 */
export function noAnswerMessage(isOnline = online(), timedOut = false): string {
  if (!isOnline) return OFFLINE_MSG;
  return timedOut ? SLOW_MSG : WAKING_MSG;
}

/**
 * El mensaje para una respuesta 503. La del servidor de Vocify trae su propio mensaje (p. ej. «la IA no está
 * activada»); la de Render mientras despierta no trae ninguno.
 */
export function unavailableMessage(serverMessage: string | undefined): string {
  return serverMessage ?? WAKING_MSG;
}

export interface WakeOptions {
  /** Cuánto se espera la primera respuesta antes de avisar de que está despertando. */
  firstMs?: number;
  /** Cuánto se espera, como mucho, a que despierte. */
  totalMs?: number;
  /** Pausa entre intentos. */
  everyMs?: number;
  fetch?: typeof fetch;
  online?: () => boolean;
}

/**
 * Se asegura de que el servidor está despierto antes de mandarle algo que gasta (una petición a la IA): pregunta por
 * `/health`, que no necesita sesión ni cuenta para el cupo. Si tarda, llama a `onWaking` (para avisar en pantalla) y
 * sigue preguntando hasta que conteste. Así la petición de verdad no se pierde a medias, contada pero sin respuesta.
 */
export async function wakeServer(base: string, onWaking?: () => void, opts: WakeOptions = {}): Promise<void> {
  const { firstMs = 4000, totalMs = 90_000, everyMs = 3000, fetch: f = fetch, online: isOnline = online } = opts;
  if (!isOnline()) throw new ApiUnavailable(OFFLINE_MSG);
  const ping = (ms: number) =>
    f(`${base}/health`, { signal: AbortSignal.timeout(ms) })
      .then((r) => r.ok)
      .catch(() => false);
  if (await ping(firstMs)) return;
  onWaking?.();
  const hasta = Date.now() + totalMs;
  while (Date.now() < hasta) {
    if (!isOnline()) throw new ApiUnavailable(OFFLINE_MSG);
    if (await ping(Math.max(1, Math.min(20_000, hasta - Date.now())))) return;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new ApiUnavailable(WAKING_MSG);
}
