// Escucha la letra de una grabación con Whisper (Transformers.js), en este dispositivo y en un hilo aparte para que la
// app no se quede parada. La primera vez descarga el modelo (unos 80 MB de Hugging Face y el motor de jsDelivr) y queda
// guardado en la caché del navegador; el audio no sale nunca del dispositivo.
import { env, pipeline } from '@huggingface/transformers';

/** Whisper «base» con los tiempos de cada palabra (las variantes «_timestamped» son las que los dan). */
const MODELO = 'onnx-community/whisper-base_timestamped';
/** Versión fija del modelo, para que no cambie sin que lo sepamos. */
const REVISION = '608c49e61301901684bc36cac8f74b95ff6b5a8e';
const SR = 16000;

env.allowLocalModels = false;
// Todas las direcciones con la versión fija, también las de los datos que Transformers.js consulta sin versión («main»):
// así coinciden con lo guardado, y con el modelo ya descargado se puede escuchar sin conexión.
env.remotePathTemplate = `{model}/resolve/${REVISION}/`;
// El motor WASM normal (sin «asyncify»): con aquel falla WebKit 26 (el iPhone).
const onnx = env.backends.onnx;
if (onnx?.wasm && onnx.versions?.web) {
  const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${onnx.versions.web}/dist/`;
  onnx.wasm.wasmPaths = { mjs: `${base}ort-wasm-simd-threaded.mjs`, wasm: `${base}ort-wasm-simd-threaded.wasm` };
}

/** Si se ha pedido algo a la red: entonces se está descargando (si no, todo sale de la caché del navegador). */
let red = false;
const fetchRed = env.fetch;
env.fetch = async (url: string | URL, init?: RequestInit) => {
  red = true;
  const res = (await fetchRed(url, init)) as Response;
  // Una página web en lugar del archivo (la de la app que da un service worker antiguo sin conexión, la de entrada de
  // una wifi…) es que no hay conexión: así no se guarda en la caché del modelo como si fuera él.
  if (res.ok && /text\/html/i.test(res.headers.get('content-type') ?? '')) {
    void res.body?.cancel().catch(() => undefined);
    throw new TypeError('Failed to fetch');
  }
  return res;
};

/**
 * Una versión anterior de la web pudo dejar guardada en la caché del modelo una página (index.html) en lugar de un
 * archivo, y entonces falla siempre igual sin llegar a pedir nada. Si la hay, se borra la caché entera para que el
 * siguiente intento lo baje bien. Devuelve si la ha borrado.
 */
async function curaCache(): Promise<boolean> {
  try {
    const c = await caches.open(env.cacheKey);
    for (const q of await c.keys()) {
      if (!/text\/html/i.test((await c.match(q))?.headers.get('content-type') ?? '')) continue;
      await caches.delete(env.cacheKey);
      return true;
    }
  } catch {
    /* sin caché: nada que curar */
  }
  return false;
}

export interface PeticionLetra {
  /** Audio en mono a 16 kHz. */
  audio: Float32Array;
  /**
   * Trozos que escuchar (segundos del audio), de como mucho 30 s: los sitios donde se canta. `sigue`: el canto sigue
   * después del final (una frase larga cortada ahí).
   */
  tramos: { a: number; b: number; sigue?: boolean }[];
}

export type MensajeLetra =
  /** Preparando el modelo: lo cargado de todos sus archivos; `red`, si se está bajando (si no, sale de la caché). */
  | { tipo: 'descarga'; cargado: number; total: number; red: boolean }
  | { tipo: 'escuchando'; hechos: number; total: number }
  | { tipo: 'hecho'; palabras: { texto: string; a: number; b: number }[] }
  /** `sinConexion`: el fallo es de la red (se arregla volviendo a intentarlo con conexión). */
  | { tipo: 'error'; mensaje: string; sinConexion?: boolean };

type Reconocedor = (audio: Float32Array, opts: Record<string, unknown>) => Promise<unknown>;
let reconocedor: Promise<Reconocedor> | null = null;

const avisa = (m: MensajeLetra) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<PeticionLetra>) => {
  try {
    if (!reconocedor) {
      let ultimo = '';
      const p = pipeline('automatic-speech-recognition', MODELO, {
        device: 'wasm',
        dtype: 'q8',
        revision: REVISION,
        progress_callback: (x: { status: string; loaded?: number; total?: number }) => {
          // El total de todos los archivos, que se calcula antes de empezar: así la barra no va hacia atrás. Se avisa
          // cada 1 % (llegan cientos de eventos).
          if (x.status !== 'progress_total' || !x.total) return;
          const cargado = x.loaded ?? 0;
          const paso = `${Math.floor((100 * cargado) / x.total)}|${red}`;
          if (paso === ultimo) return;
          ultimo = paso;
          avisa({ tipo: 'descarga', cargado, total: x.total, red });
        },
      }) as unknown as Promise<Reconocedor>;
      reconocedor = p;
      // Si falla (sin conexión), se olvida para poder reintentarlo.
      p.catch(() => {
        if (reconocedor === p) reconocedor = null;
      });
    }
    const asr = await reconocedor;
    const { audio, tramos } = e.data;
    const palabras: { texto: string; a: number; b: number }[] = [];
    for (let k = 0; k < tramos.length; k++) {
      avisa({ tipo: 'escuchando', hechos: k, total: tramos.length });
      const t = tramos[k];
      const i0 = Math.max(0, Math.floor(t.a * SR));
      const i1 = Math.min(audio.length, Math.ceil(t.b * SR));
      if (i1 - i0 < SR * 0.5) continue;
      const a = i0 / SR;
      const fin = i1 / SR;
      const r = (await asr(audio.subarray(i0, i1), { language: 'spanish', task: 'transcribe', return_timestamps: 'word' })) as {
        chunks?: { text: string; timestamp: [number, number | null] }[];
      };
      for (const c of r.chunks ?? []) {
        const texto = c.text.trim();
        if (!texto) continue;
        const ini = a + c.timestamp[0];
        // Lo que empieza en el último instante del trozo no se oye entero (o se lo inventa Whisper en el silencio con
        // que rellena hasta 30 s). Si el canto sigue, la palabra entera está al principio del tramo siguiente.
        if (ini >= fin - (t.sigue ? 0.15 : 0.02)) continue;
        // Nada acaba después del trozo: lo que hay detrás es ese silencio de relleno.
        const b = Math.min(fin, a + (c.timestamp[1] ?? c.timestamp[0] + 0.3));
        palabras.push({ texto, a: ini, b: Math.max(b, ini + 0.02) });
      }
    }
    avisa({ tipo: 'hecho', palabras });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    // Un archivo del modelo que no se puede leer (JSON, protobuf o WASM que no lo son): si es una página guardada en su
    // lugar, se cura la caché, y el fallo es de conexión (al reintentarlo con red, se baja bien).
    const curada = /JSON|Unexpected token|protobuf|magic word/i.test(mensaje) && (await curaCache());
    avisa({ tipo: 'error', mensaje, sinConexion: curada || /fetch|network|load failed/i.test(mensaje) });
  }
};
