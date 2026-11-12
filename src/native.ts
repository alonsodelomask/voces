// Puente con la app nativa (Expo, carpeta movil/). La web corre dentro de un WebView y pide al teléfono lo que el
// navegador no puede hacer: guardar/compartir archivos, «Iniciar sesión con Apple» y abrir enlaces fuera de la app.
// En el navegador normal todo funciona sin puente.

type NativeInfo = { platform: 'ios' | 'android'; apple: boolean; version: string };
type Reply = { id: string; ok: boolean; result?: unknown; error?: string; cancelled?: boolean };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    VocesNative?: NativeInfo;
    __vocesNativeReply?: (reply: Reply) => void;
    __vocesOpenFile?: (file: { name: string; base64: string }) => void;
  }
}

export const isNative = typeof window !== 'undefined' && !!window.ReactNativeWebView;
export const platform: 'ios' | 'android' | 'web' = (isNative && window.VocesNative?.platform) || 'web';
/** «Iniciar sesión con Apple» nativo disponible (iPhone con la app instalada). */
export const appleSignInAvailable = isNative && window.VocesNative?.apple === true;

export class NativeCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'NativeCancelled';
  }
}

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();
if (isNative) {
  window.__vocesNativeReply = (reply) => {
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    clearTimeout(p.timer);
    if (reply.ok) p.resolve(reply.result);
    else p.reject(reply.cancelled ? new NativeCancelled() : new Error(reply.error || 'Error del teléfono'));
  };
}

function callNative<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 180_000): Promise<T> {
  if (!isNative) return Promise.reject(new Error('Solo disponible en la app.'));
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('El teléfono no ha respondido.'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    window.ReactNativeWebView!.postMessage(JSON.stringify({ id, type, ...payload }));
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Guarda un archivo: en el navegador lo descarga; en el móvil abre el menú de compartir (Archivos, WhatsApp, AirDrop…). */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return;
  }
  try {
    await callNative('save', { name: filename, mime: blob.type || 'application/octet-stream', base64: await blobToBase64(blob) });
  } catch (e) {
    if (!(e instanceof NativeCancelled)) throw e;
  }
}

export type AppleCredential = {
  identityToken: string;
  authorizationCode: string | null;
  email: string | null;
  fullName: string | null;
};

/** Pide al iPhone «Iniciar sesión con Apple» con el resumen SHA-256 del nonce. Lanza NativeCancelled si se cancela. */
export function nativeAppleSignIn(hashedNonce: string): Promise<AppleCredential> {
  return callNative<AppleCredential>('apple-sign-in', { nonce: hashedNonce });
}

/** Abre un enlace en el navegador del teléfono (fuera de la app). */
export function openExternal(url: string) {
  if (isNative) void callNative('open-url', { url }, 10_000).catch(() => {});
  else window.open(url, '_blank', 'noopener');
}

/**
 * Partituras que llegan de otra app («Abrir con… Voces» desde WhatsApp, Archivos, Mail…). Al registrarse, la web avisa
 * a la app de que ya escucha y la app le entrega las que estuvieran esperando.
 */
export function onNativeFile(handler: (file: File) => void) {
  if (!isNative) return;
  window.__vocesOpenFile = ({ name, base64 }) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    handler(new File([bytes], name));
  };
  void callNative('ready', {}, 10_000).catch(() => {});
}

/** Ajustes al arrancar dentro de la app nativa. */
export function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native', 'native-' + platform);
  // Los enlaces externos (p. ej. la política de privacidad) se abren fuera de la app.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href^="http"]') as HTMLAnchorElement | null;
    if (a && !a.download) {
      e.preventDefault();
      openExternal(a.href);
    }
  });
}
