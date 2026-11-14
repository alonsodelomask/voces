// Sacar la letra de una grabación: lo que se canta, palabra a palabra y con su tiempo. Lo hace Whisper en un hilo aparte
// (`lyricsWorker.ts`) y en este dispositivo. Aquí se prepara el audio, se escucha solo donde cantan las voces de la
// partitura (en trozos de como mucho 28 s, cortados en sus silencios) y se limpia lo que Whisper se inventa. Todo se
// puede cancelar con una `AbortSignal`: el error es entonces un `AbortError` (`isAbort`).
import { isSung } from '../ai/fusion';
import { decodeMono, getTrack } from '../audio/track';
import type { Note, Song } from '../model';
import type { MensajeLetra, PeticionLetra } from './lyricsWorker';

/** Una palabra oída: segundos del audio que se ha escuchado. */
export interface PalabraOida {
  texto: string;
  a: number;
  b: number;
}

/** Un trozo que escuchar, en segundos. */
export interface Tramo {
  a: number;
  b: number;
  /** El canto sigue después de `b`: una frase larga partida ahí, sin margen; el tramo siguiente empieza en `b`. */
  sigue?: boolean;
}

/** Lo más largo que escucha Whisper de una vez, sin contar el margen (él oye 30 s). */
const MAX_TRAMO = 28;
/** Un silencio de al menos esto separa frases. */
const RESPIRO = 0.4;
/** Lo que se escucha antes y después de cada tramo, si el vecino está lejos. */
const MARGEN = 0.4;
/** Una frase más larga que MAX_TRAMO se parte en estos últimos segundos antes del máximo. */
const VENTANA_CORTE = 10;

/**
 * Dónde se canta, en segundos del audio: las frases (notas separadas por menos de un respiro), juntas en tramos de como
 * mucho 28 s y con un poco de margen, sin que dos tramos se pisen. Una frase más larga se parte donde mejor respira la
 * `melodia` (si no se da, todas las voces). `offset`: segundo del audio que corresponde al 0 de la canción.
 */
export function sungStretches(notes: Note[], offset: number, total: number, melodia?: Note[]): Tramo[] {
  const span = (n: Note): Tramo => ({ a: n.start + offset, b: n.start + n.dur + offset });
  const todas = notes.map(span).sort((x, y) => x.a - y.a);
  const mel = (melodia ?? notes).map(span).sort((x, y) => x.a - y.a);
  const frases: Tramo[] = [];
  for (const n of todas) {
    const ult = frases[frases.length - 1];
    if (ult && n.a - ult.b < RESPIRO) ult.b = Math.max(ult.b, n.b);
    else frases.push({ a: n.a, b: n.b });
  }
  const tramos: Tramo[] = [];
  for (const f of frases) {
    const ult = tramos[tramos.length - 1];
    if (ult && f.b - ult.a <= MAX_TRAMO && f.a - ult.b < 3) {
      ult.b = f.b;
      continue;
    }
    let a = f.a;
    while (f.b - a > MAX_TRAMO) {
      const c = corte(a, f.b, todas, mel);
      tramos.push({ a, b: c, sigue: true });
      a = c;
    }
    tramos.push({ a, b: f.b });
  }
  // El margen, como mucho la mitad del silencio con el vecino (así no se oye nada dos veces); en los cortes, ninguno.
  return tramos
    .map((t, k) => {
      const prev = tramos[k - 1];
      const next = tramos[k + 1];
      const antes = prev?.sigue ? 0 : Math.min(MARGEN, prev ? (t.a - prev.b) / 2 : MARGEN);
      const despues = t.sigue ? 0 : Math.min(MARGEN, next ? (next.a - t.b) / 2 : MARGEN);
      const r: Tramo = { a: Math.max(0, t.a - antes), b: Math.min(total, t.b + despues) };
      if (t.sigue) r.sigue = true;
      return r;
    })
    .filter((t) => t.b - t.a > 0.5);
}

/** Los silencios entre unas notas (ordenadas por su inicio), como tramos. */
function huecos(notas: Tramo[]): Tramo[] {
  const out: Tramo[] = [];
  let fin = -Infinity;
  for (const n of notas) {
    if (n.a > fin && fin > -Infinity) out.push({ a: fin, b: n.a });
    fin = Math.max(fin, n.b);
  }
  return out;
}

/**
 * Dónde partir una frase larga que empieza en `desde` y acaba en `fin` (sin pasar de MAX_TRAMO ni dejar un resto de
 * menos de 1 s). Se mira en los últimos 10 s: mejor donde respira la melodía (cuanto más largo el respiro, mejor, y en
 * su mitad), después donde suenan menos voces y donde la melodía acaba una nota larga (las frases suelen acabar así), y
 * lo más tarde posible.
 */
function corte(desde: number, fin: number, todas: Tramo[], mel: Tramo[]): number {
  const hasta = Math.min(desde + MAX_TRAMO, fin - 1);
  const ini = Math.max(desde + 1, desde + MAX_TRAMO - VENTANA_CORTE);
  const EPS = 0.01;
  const zona = todas.filter((n) => n.b > ini - 1 && n.a < hasta + 1);
  const melZona = mel.filter((n) => n.b > ini - 1 && n.a < hasta + 1);
  // Candidatos: los finales de nota y la mitad de cada silencio (de todas las voces o de la melodía; si el silencio se
  // sale de donde se mira, lo más cerca de su mitad que se pueda).
  const enMedio = (h: Tramo) => Math.min(hasta, Math.max(ini + EPS, (h.a + h.b) / 2));
  const candidatos = [...zona.map((n) => n.b), ...[...huecos(zona), ...huecos(melZona)].map(enMedio)];
  const q = (x: number, paso: number) => Math.round(x / paso);
  let mejor = { t: hasta, clave: [-Infinity] };
  for (const t of candidatos) {
    if (t <= ini || t > hasta) continue;
    const suenan = zona.filter((n) => n.a < t - EPS && n.b > t + EPS).length;
    // El respiro de la melodía en que cae (0 si canta ahí) y lo lejos que queda de sus notas.
    let respiro = 0;
    let aire = 0;
    if (!mel.some((n) => n.a < t - EPS && n.b > t + EPS)) {
      let antes = -Infinity;
      let despues = Infinity;
      for (const n of mel) {
        if (n.b <= t + EPS) antes = Math.max(antes, n.b);
        if (n.a >= t - EPS) despues = Math.min(despues, n.a);
      }
      respiro = Math.min(2, despues - antes);
      aire = Math.min(1, t - antes, despues - t);
      if (respiro < 0.1) respiro = aire = 0;
    }
    // El silencio de todas las voces en que cae (0 si suena alguna).
    let hueco = 0;
    if (!suenan) {
      let antes = -Infinity;
      let despues = Infinity;
      for (const n of zona) {
        if (n.b <= t + EPS) antes = Math.max(antes, n.b);
        if (n.a >= t - EPS) despues = Math.min(despues, n.a);
      }
      hueco = Math.min(2, despues - antes);
    }
    const larga = Math.max(0, ...melZona.filter((n) => Math.abs(n.b - t) <= EPS).map((n) => n.b - n.a));
    const clave = [q(respiro, 0.05), q(aire, 0.05), -suenan, q(hueco, 0.05), q(larga, 0.1), t];
    const i = clave.findIndex((x, k) => x !== mejor.clave[k]);
    if (i >= 0 && (mejor.clave[i] === undefined || clave[i] > mejor.clave[i])) mejor = { t, clave };
  }
  return mejor.t;
}

/**
 * Lo que Whisper se inventa en silencios o con música y nunca es letra: créditos de subtítulos («Subtítulos realizados
 * por la comunidad de Amara.org»), «suscríbete», direcciones web. Si sale, sobra la frase entera en que sale.
 */
const INVENTADA = /amara\.org|subt[ií]tul|suscr[ií]b|www\.|\.com\b/i;
/**
 * La despedida de vídeo cuando es toda la frase («Gracias por ver.»). Dentro de un verso («gracias por ver el mar»)
 * puede ser letra: ahí solo sobra con «el vídeo» detrás (ver RELLENO).
 */
const DESPEDIDA = /^[¡!\s]*(?:muchas\s+)?gracias\s+por\s+(?:ver|vernos|mirar)[\s.!…]*$/iu;
/**
 * Lo que sobra aunque vaya junto a la letra: «gracias por ver el vídeo», «gracias por su atención» y lo que va entre
 * corchetes o paréntesis («[Música]», «(aplausos)»). «música» suelta sí puede ser letra. Se busca en el texto unido de
 * cada tramo.
 */
const RELLENO =
  /gracias\s+por\s+(?:(?:ver|vernos|mirar)\s+(?:el|este)\s+v[ií]deo|(?:su|vuestra)\s+atenci[oó]n)(?!\p{L})[.!]?|[[(][^\])]{0,60}[\])]/giu;

/** Quita de lo que oye Whisper lo inventado (ver INVENTADA y RELLENO), tramo a tramo y frase a frase. */
function limpia(palabras: PalabraOida[], tramos: Tramo[]): PalabraOida[] {
  // Las palabras de cada tramo: Whisper escucha cada uno por separado.
  const grupos: PalabraOida[][] = [];
  let k0 = NaN;
  for (const p of [...palabras].sort((x, y) => x.a - y.a)) {
    let k = tramos.findIndex((t) => p.a >= t.a && p.a < t.b);
    if (k < 0) k = tramos.findIndex((t) => p.a >= t.a - 0.05 && p.a < t.b + 0.05);
    if (k !== k0 || !grupos.length) grupos.push([]);
    grupos[grupos.length - 1].push(p);
    k0 = k;
  }
  const quedan: PalabraOida[] = [];
  for (const g of grupos) {
    // Frases: las separa un respiro largo o un punto. La que trae algo inventado, o es solo una despedida, sobra entera.
    const vivas: PalabraOida[] = [];
    let frase: PalabraOida[] = [];
    const cierra = () => {
      const texto = frase.map((p) => p.texto).join(' ');
      if (!INVENTADA.test(texto) && !DESPEDIDA.test(texto)) vivas.push(...frase);
      frase = [];
    };
    g.forEach((p, i) => {
      if (i && (p.a - g[i - 1].b > 0.6 || /[.!?…]$/.test(g[i - 1].texto))) cierra();
      frase.push(p);
    });
    cierra();
    // El relleno, en el texto unido: sobra cada palabra que toca una coincidencia.
    let texto = '';
    const pos: [number, number][] = [];
    for (const p of vivas) {
      if (texto) texto += ' ';
      pos.push([texto.length, texto.length + p.texto.length]);
      texto += p.texto;
    }
    const fuera = [...texto.matchAll(RELLENO)].map((m) => [m.index, m.index + m[0].length]);
    vivas.forEach((p, i) => {
      const toca = fuera.some(([a, b]) => pos[i][0] < b && pos[i][1] > a);
      // Sin ninguna letra (o con un corchete suelto) no es una palabra cantada: «♪», «-», «[Música».
      if (!toca && /[\p{L}\p{N}]/u.test(p.texto) && !/^[[(]|[\])]$/.test(p.texto)) quedan.push(p);
    });
  }
  return quedan;
}

/** ¿Es el error de haber cancelado la escucha? */
export function isAbort(e: unknown): boolean {
  return (e as { name?: unknown } | null | undefined)?.name === 'AbortError';
}

const cancelada = () => new DOMException('Se ha dejado de escuchar la letra.', 'AbortError');
const sinConexion = () =>
  Object.assign(new Error('No se ha podido descargar el modelo que escucha la letra. Comprueba la conexión y vuelve a intentarlo.'), {
    name: 'NetworkError',
  });

let worker: Worker | null = null;
// Whisper escucha una cosa cada vez: las peticiones esperan su turno.
let cola: Promise<unknown> = Promise.resolve();

/**
 * Escucha la letra en `audio16k` (mono a 16 kHz), solo en los `tramos` dados. La primera vez descarga el modelo (unos
 * 80 MB); `onProgress` dice qué está haciendo y cuánto lleva (0..1). Con `signal` se cancela: si la petición espera su
 * turno, no se llega a lanzar; si ya está escuchando, se para el hilo (y con él la descarga y Whisper).
 */
export function transcribeLyrics(
  audio16k: Float32Array,
  tramos: Tramo[],
  onProgress?: (fase: string, fraccion: number) => void,
  signal?: AbortSignal,
): Promise<PalabraOida[]> {
  // Solo para las pruebas: lo que «oiría» Whisper, sin descargar nada.
  const falsa = (globalThis as { __vocesLetraOida?: PalabraOida[] }).__vocesLetraOida;
  if (falsa) return signal?.aborted ? Promise.reject(cancelada()) : Promise.resolve(falsa.map((p) => ({ ...p })));
  if (signal?.aborted) return Promise.reject(cancelada());
  // Sin nada que escuchar no hace falta el modelo.
  if (!tramos.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    let lanzada = false;
    const alCancelar = () => {
      if (!lanzada) reject(cancelada());
    };
    signal?.addEventListener('abort', alCancelar, { once: true });
    cola = cola.then(async () => {
      signal?.removeEventListener('abort', alCancelar);
      // Cancelada mientras esperaba: ya se ha rechazado.
      if (signal?.aborted) return;
      lanzada = true;
      try {
        resolve(limpia(await escucha(audio16k, tramos, onProgress, signal), tramos));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function escucha(
  audio16k: Float32Array,
  tramos: Tramo[],
  onProgress: ((fase: string, fraccion: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<PalabraOida[]> {
  // El hilo (con Whisper y su motor) solo se carga la primera vez que hace falta. En la web, sin conexión y sin
  // haberlo usado antes, ni siquiera llega su código.
  if (!worker) {
    let LyricsWorker: new () => Worker;
    try {
      LyricsWorker = (await import('./lyricsWorker?worker&inline')).default;
    } catch (e) {
      console.warn('[voces] no se ha podido cargar el hilo que escucha la letra', e);
      throw sinConexion();
    }
    worker ??= new LyricsWorker();
  }
  if (signal?.aborted) throw cancelada();
  const w = worker;
  return new Promise((resolve, reject) => {
    // La barra no va nunca hacia atrás. Preparar el modelo ocupa la primera mitad si se descarga, y poco si sale de la
    // caché del navegador; escuchar, el resto.
    let hasta = 0;
    let base = 0;
    const avanza = (fase: string, f: number) => {
      hasta = Math.max(hasta, Math.min(1, f));
      onProgress?.(fase, hasta);
    };
    const suelta = () => {
      signal?.removeEventListener('abort', alCancelar);
      w.onmessage = null;
      w.onerror = null;
    };
    // Se para el hilo: así paran la descarga y Whisper (lo ya guardado en la caché se queda). La próxima vez, otro.
    const para = () => {
      w.terminate();
      if (worker === w) worker = null;
    };
    const alCancelar = () => {
      suelta();
      para();
      reject(cancelada());
    };
    signal?.addEventListener('abort', alCancelar, { once: true });
    w.onmessage = (e: MessageEvent<MensajeLetra>) => {
      const m = e.data;
      if (m.tipo === 'descarga') {
        const f = m.total ? m.cargado / m.total : 0;
        if (m.red) {
          base = 0.5;
          const mb = (x: number) => Math.round(x / 1e6);
          avanza(`Descargando el modelo que escucha la letra (${mb(m.cargado)} de ${mb(m.total) || 80} MB; solo la primera vez)…`, base * f);
        } else {
          base = Math.max(base, 0.1);
          avanza('Preparando el modelo que escucha la letra…', base * f);
        }
      } else if (m.tipo === 'escuchando') {
        avanza(`Escuchando la letra (${m.hechos + 1} de ${m.total})…`, base + ((1 - base) * m.hechos) / Math.max(1, m.total));
      } else if (m.tipo === 'hecho') {
        suelta();
        resolve(m.palabras);
      } else {
        // Si el hilo falla, se crea otro la próxima vez. Si es de conexión lo dice él («load» a secas no lo es: un
        // modelo que no se puede cargar no se arregla con más conexión).
        suelta();
        para();
        const red = m.sinConexion ?? /fetch|network|load failed/i.test(m.mensaje);
        reject(red ? sinConexion() : new Error(`No se ha podido sacar la letra: ${m.mensaje}`));
      }
    };
    w.onerror = (e) => {
      suelta();
      para();
      reject(new Error(`No se ha podido sacar la letra: ${e.message || 'el proceso que escucha se ha parado'}`));
    };
    const copia = audio16k.slice();
    const peticion: PeticionLetra = { audio: copia, tramos };
    w.postMessage(peticion, [copia.buffer]);
  });
}

/** Une las palabras oídas en un texto, con un salto de línea en cada respiro largo (las frases). */
export function lyricsFromWords(palabras: PalabraOida[]): string {
  let s = '';
  palabras.forEach((p, k) => {
    if (k > 0) s += p.a - palabras[k - 1].b > 0.6 ? '\n' : ' ';
    s += p.texto;
  });
  return s;
}

/** Lo que oye Whisper: audio mono a esta frecuencia. */
export const SR_LETRA = 16000;

/** Las partes de la canción en que canta alguna voz de la partitura (las de la grabación no cuentan). */
export function scoreNotes(song: Song): Note[] {
  return song.voices.filter((v) => !isSung(v)).flatMap((v) => v.notes);
}

/** La melodía: la voz de la partitura que se oye en la grabación (la que sigue la voz «🎙»); si no, la primera. */
function melodyNotes(song: Song): Note[] {
  const partitura = song.voices.filter((v) => !isSung(v) && v.notes.length);
  const oida = song.voices.find((v) => isSung(v) && v.sungOf)?.sungOf;
  return (partitura.find((v) => v.id === oida) ?? partitura[0])?.notes ?? [];
}

/** Los tramos (en segundos de la canción) en que se ha escuchado cada lista de palabras devuelta. */
const cubre = new WeakMap<PalabraOida[], Tramo[]>();

/**
 * Lo oído en una grabación, pasado a segundos de la canción: `offset` es el segundo del audio en que cae el 0 de la
 * canción. Se escucha donde cantan las voces de la partitura, y los tramos se cortan por los respiros de la melodía.
 */
export async function hearSong(
  song: Song,
  audio16k: Float32Array,
  offset: number,
  onProgress?: (fase: string, fraccion: number) => void,
  signal?: AbortSignal,
): Promise<PalabraOida[]> {
  const tramos = sungStretches(scoreNotes(song), offset, audio16k.length / SR_LETRA, melodyNotes(song));
  const oidas = await transcribeLyrics(audio16k, tramos, onProgress, signal);
  const palabras = oidas.map((p) => ({ texto: p.texto, a: p.a - offset, b: p.b - offset }));
  cubre.set(
    palabras,
    tramos.map((t) => ({ a: t.a - offset, b: t.b - offset })),
  );
  return palabras;
}

// Lo ya oído en la grabación de cada canción mientras la app está abierta (escucharla tarda: unos 45 s por 3 minutos),
// con los tramos que se escucharon: si después hay notas donde no se escuchó, falta eso.
const oido = new Map<string, { tramos: Tramo[]; palabras: PalabraOida[] }>();
const clave = (song: Song) => {
  const t = song.audioTrack;
  return t ? `${song.id}|${t.name}|${t.offset.toFixed(3)}|${t.duration.toFixed(2)}` : '';
};

/** Dónde hay que escuchar ahora la grabación de la canción, en segundos de la canción. */
function tramosDe(song: Song): Tramo[] {
  const t = song.audioTrack;
  if (!t) return [];
  return sungStretches(scoreNotes(song), t.offset, t.duration, melodyNotes(song)).map((x) => ({ a: x.a - t.offset, b: x.b - t.offset, ...(x.sigue ? { sigue: true } : {}) }));
}

/** ¿Cabe [a, b] en lo ya escuchado (`hechos`, ordenados por su inicio)? */
function cabe(a: number, b: number, hechos: Tramo[]): boolean {
  for (const h of hechos) {
    if (h.b < a) continue;
    if (h.a > a + 1e-6) return false;
    a = Math.max(a, h.b);
    if (a >= b) return true;
  }
  return false;
}

/** Los tramos que no caben en lo ya escuchado (con un poco de holgura en los bordes: los márgenes cambian). */
function faltan(tramos: Tramo[], hechos: Tramo[]): Tramo[] {
  const H = 0.25;
  const ord = [...hechos].sort((x, y) => x.a - y.a);
  return tramos.filter((t) => {
    const m = (t.a + t.b) / 2;
    return !cabe(Math.min(m, t.a + H), Math.max(m, t.b - H), ord);
  });
}

/** Lo que ya se ha oído en la grabación de la canción (null si todavía no se ha escuchado, o si falta algún trozo con notas). */
export function heardBefore(song: Song): PalabraOida[] | null {
  const o = oido.get(clave(song));
  return o && !faltan(tramosDe(song), o.tramos).length ? o.palabras : null;
}

/** Guarda lo oído en la grabación de la canción (p. ej. al mezclar), para no volver a escucharla. */
export function rememberHeard(song: Song, palabras: PalabraOida[]): void {
  if (!song.audioTrack) return;
  // Los tramos en que se oyó; si no se saben, los de ahora.
  const tramos = cubre.get(palabras) ?? tramosDe(song);
  oido.set(clave(song), { tramos, palabras });
  cubre.set(palabras, tramos);
}

type Oyente = (fase: string, fraccion: number) => void;
// Lo que se está escuchando ahora, por canción: si se pide otra vez (se cierra el diálogo y se vuelve a abrir), se
// espera a lo mismo. Cancelar solo para el trabajo si ya no lo espera nadie.
const enCurso = new Map<string, { promesa: Promise<PalabraOida[]>; oyentes: Map<object, Oyente | undefined>; corta: AbortController }>();

/**
 * Lo que se canta en la grabación que suena con la canción (la guardada en este dispositivo), palabra a palabra y en
 * segundos de la canción. Si ya se había escuchado, solo se escuchan los trozos con notas que faltan. La primera vez
 * descarga el modelo (unos 80 MB). Con `signal`, se deja de esperar (y si no espera nadie más, se para).
 */
export function hearTrack(song: Song, onProgress?: (fase: string, fraccion: number) => void, signal?: AbortSignal): Promise<PalabraOida[]> {
  if (signal?.aborted) return Promise.reject(cancelada());
  const ya = heardBefore(song);
  if (ya) return Promise.resolve(ya);
  const k = clave(song);
  let tarea = enCurso.get(k);
  if (!tarea) {
    const oyentes = new Map<object, Oyente | undefined>();
    const corta = new AbortController();
    const avisa: Oyente = (fase, f) => oyentes.forEach((o) => o?.(fase, f));
    const promesa = (async () => {
      const t = song.audioTrack;
      if (!t) throw new Error('Esta canción no tiene grabación.');
      const antes = oido.get(k);
      const tramos = tramosDe(song);
      const pendientes = antes ? faltan(tramos, antes.tramos) : tramos;
      let nuevas: PalabraOida[] = [];
      if (pendientes.length) {
        const wav = await getTrack(song.id);
        if (!wav) throw new Error('La grabación de esta canción no está guardada en este dispositivo.');
        if (corta.signal.aborted) throw cancelada();
        avisa('Preparando la grabación…', 0);
        const audio = await decodeMono(wav, SR_LETRA);
        const enAudio = pendientes.map((x) => ({ ...x, a: x.a + t.offset, b: x.b + t.offset }));
        const oidas = await transcribeLyrics(audio, enAudio, avisa, corta.signal);
        nuevas = oidas.map((p) => ({ texto: p.texto, a: p.a - t.offset, b: p.b - t.offset }));
      }
      // Se junta con lo de antes: en los tramos escuchados ahora, vale lo nuevo.
      const en = (p: PalabraOida, ts: Tramo[]) => ts.some((x) => (p.a + p.b) / 2 >= x.a && (p.a + p.b) / 2 <= x.b);
      const palabras = antes
        ? [...antes.palabras.filter((p) => !en(p, pendientes)), ...nuevas.filter((p) => en(p, pendientes))].sort((x, y) => x.a - y.a)
        : nuevas;
      const hechos = [...(antes?.tramos ?? []), ...pendientes.map((x) => ({ a: x.a, b: x.b }))];
      oido.set(k, { tramos: hechos, palabras });
      cubre.set(palabras, hechos);
      return palabras;
    })();
    const nueva = { promesa, oyentes, corta };
    tarea = nueva;
    enCurso.set(k, nueva);
    void promesa.then(
      () => enCurso.get(k) === nueva && enCurso.delete(k),
      () => enCurso.get(k) === nueva && enCurso.delete(k),
    );
  }
  const t = tarea;
  const yo = {};
  t.oyentes.set(yo, onProgress);
  return new Promise((resolve, reject) => {
    let fuera = false;
    const sal = () => {
      fuera = true;
      t.oyentes.delete(yo);
      signal?.removeEventListener('abort', alCancelar);
    };
    const alCancelar = () => {
      if (fuera) return;
      sal();
      reject(cancelada());
      // Si ya no lo espera nadie, se para (y la próxima vez se empieza otra vez).
      if (!t.oyentes.size) {
        if (enCurso.get(k) === t) enCurso.delete(k);
        t.corta.abort();
      }
    };
    signal?.addEventListener('abort', alCancelar, { once: true });
    t.promesa.then(
      (p) => {
        if (fuera) return;
        sal();
        resolve(p);
      },
      (e) => {
        if (fuera) return;
        sal();
        reject(e);
      },
    );
  });
}
