// Audio → notas: graba de un grupo (a cappella o una sola voz) convertida en voces de Voces.
// Basic Pitch (Spotify, Apache-2.0) transcribe varias notas a la vez; después se limpian armónicos y ruido,
// se calcula el tempo, se ajusta a la rejilla y se reparten las notas en voces (de aguda a grave).
// Todo ocurre en el dispositivo: el audio no se envía a ningún servidor.
import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url';
import weightsUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url';
import { makeSong, makeVoice, VOICE_COLORS, type Note, type Song } from '../model';
import { computeChords } from '../music';

export { AUDIO_EXT, isAudioFile } from './index';

const SR = 22050; // frecuencia que espera Basic Pitch

export interface AudioOptions {
  /** Voces que canta el grupo (0 = averiguarlo). */
  voices: number;
  /** Rejilla en pulsos (0 = sin ajustar). */
  grid: number;
  /** Tempo en BPM (0 = averiguarlo). */
  bpm: number;
  /** Tramo a convertir, en segundos (end 0 = hasta el final). */
  start: number;
  end: number;
  /** Sensibilidad 0..1: más alto, más notas (y más ruido). */
  sensitivity: number;
  /** Respetar el tiempo del archivo (sin desplazar al primer pulso): para añadir pistas grabadas por separado. */
  keepTime?: boolean;
  /** Con keepTime: el segundo del archivo en que cae el 0 de la canción a la que se añade (su `audioPhase`). */
  phase?: number;
  /** Con keepTime: semitonos que la grabación suena por encima de la canción (su `audioTranspose`); se restan. */
  transpose?: number;
  onProgress?: (fase: string, fraccion: number) => void;
}

export const defaultAudioOptions: AudioOptions = { voices: 0, grid: 0.5, bpm: 0, start: 0, end: 0, sensitivity: 0.5 };

/** Decodifica cualquier formato que entienda el navegador y lo deja en mono a 22 050 Hz. */
export async function decodeAudio(data: ArrayBuffer): Promise<{ samples: Float32Array; duration: number }> {
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  // decodeAudioData remuestrea a la frecuencia del contexto.
  const ctx = new Ctx(1, SR, SR);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(data.slice(0));
  } catch {
    throw new Error('No se ha podido leer ese audio. Prueba con WAV o MP3.');
  }
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  // Normaliza el volumen (grabaciones flojas).
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0 && peak < 0.5) for (let i = 0; i < out.length; i++) out[i] /= peak * 1.1;
  return { samples: out, duration: buf.duration };
}

export type RawNote = { start: number; dur: number; midi: number; amp: number };

let modelPromise: Promise<unknown> | null = null;

export type BpOutputs = { frames: number[][]; onsets: number[][]; contours: number[][] };

/**
 * Carga el modelo (una vez). Si la descarga falla (sin conexión, un corte), se olvida para reintentarlo la próxima
 * vez: antes se quedaba guardado el fallo y no se podía convertir ni mezclar hasta recargar la página.
 */
async function loadModel(): Promise<import('@tensorflow/tfjs').GraphModel> {
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  if (!modelPromise) {
    const p = (async () => {
      // Sin conexión, un aviso que se entienda (el del navegador sale en inglés: «Failed to fetch»).
      const bajar = async (url: string) => {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        } catch (e) {
          console.warn('[voces] no se pudo descargar el modelo', e);
          throw new Error('No se ha podido descargar el modelo que escucha las voces. Comprueba la conexión y vuelve a intentarlo.');
        }
      };
      const json = await (await bajar(modelJsonUrl)).json();
      const weights = await (await bajar(weightsUrl)).arrayBuffer();
      return tf.loadGraphModel(
        tf.io.fromMemory({
          modelTopology: json.modelTopology,
          weightSpecs: json.weightsManifest[0].weights,
          weightData: weights,
          format: json.format,
          generatedBy: json.generatedBy,
          convertedBy: json.convertedBy,
        }),
      );
    })();
    modelPromise = p;
    p.catch(() => {
      if (modelPromise === p) modelPromise = null;
    });
  }
  return modelPromise as Promise<import('@tensorflow/tfjs').GraphModel>;
}

/** Pasa el audio por el modelo (lo lento). */
export async function basicPitchOutputs(samples: Float32Array, onProgress?: (f: number) => void): Promise<BpOutputs> {
  // Un fallo al descargar el modelo no es cosa de la tarjeta gráfica: se avisa tal cual, sin pasar al procesador.
  const model = await loadModel();
  try {
    return await basicPitchOnce(model, samples, onProgress);
  } catch (e) {
    // Si la tarjeta gráfica (WebGL) falla al escuchar, se repite en el procesador: más lento, pero funciona en cualquier equipo.
    const tf = await import('@tensorflow/tfjs');
    if (tf.getBackend() === 'cpu') throw e;
    console.warn('[voces] WebGL no disponible para la transcripción; se usa el procesador', e);
    await tf.setBackend('cpu');
    modelPromise = null;
    return basicPitchOnce(await loadModel(), samples, onProgress);
  }
}

// El modelo escucha ventanas de 2 s y da un fotograma cada 256 muestras. De cada ventana se tiran 15 fotogramas por
// cada lado (le falta contexto) y se quedan 142.
const HOP = 256; // muestras por fotograma
/** Fotogramas por segundo de `basicPitchOutputs`: el fotograma f es el segundo f / FRAME_RATE del audio, siempre. */
export const FRAME_RATE = SR / HOP; // 86,13
const WIN = SR * 2 - HOP; // 43 844 muestras por ventana (172 fotogramas)
const EDGE = 15; // fotogramas que se tiran a cada lado
const KEEP = 142; // fotogramas que se quedan de cada ventana
const STEP = KEEP * HOP; // 36 352 muestras de una ventana a la siguiente: justo lo que se queda
const LEAD = EDGE * HOP; // ceros delante del audio, para que la primera ventana empiece en el segundo 0
const OUTPUTS = ['Identity_1', 'Identity_2', 'Identity']; // fotogramas, ataques y contornos

/**
 * Pasa el audio por el modelo ventana a ventana. No se usa `BasicPitch.evaluateModel`:
 * - sube todo el audio de golpe a la tarjeta gráfica y no libera nada; con más de un minuto de grabación cada ventana
 *   tarda unas cuarenta veces más (0,2 s → 7-11 s en una gráfica integrada) y una canción entera se va a horas;
 * - avanza 36 164 muestras por ventana (141,27 fotogramas) pero deja 142: su reloj adelanta un 0,5 % y la librería
 *   lo corrige después a ojo (`modelFrameToTime`, con un «número mágico»). Quien contaba fotogramas a 86 por segundo
 *   colocaba las notas cada vez más tarde: +0,2 s a los 30 s, +1,15 s a los 3 minutos (medido con tonos).
 * Aquí cada ventana avanza exactamente lo que se queda, y el fotograma f cae en la muestra f·256 sin corregir nada.
 */
async function basicPitchOnce(model: import('@tensorflow/tfjs').GraphModel, samples: Float32Array, onProgress?: (f: number) => void): Promise<BpOutputs> {
  const tf = await import('@tensorflow/tfjs');
  const want = Math.ceil(samples.length / HOP); // un fotograma por cada 256 muestras, hasta el final
  const windows = Math.ceil(want / KEEP);
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  const win = new Float32Array(WIN);
  for (let k = 0; k < windows; k++) {
    onProgress?.(k / windows);
    // La ventana k empieza 15 fotogramas antes del primero que se queda (k·142): lo de fuera del audio, ceros.
    const a = k * STEP - LEAD;
    win.fill(0);
    const from = Math.max(0, a);
    const to = Math.min(samples.length, a + WIN);
    if (to > from) win.set(samples.subarray(from, to), from - a);
    const outs = tf.tidy(() =>
      (model.execute(tf.tensor3d(win, [1, WIN, 1]), OUTPUTS) as import('@tensorflow/tfjs').Tensor[]).map((t) =>
        t.slice([0, EDGE, 0], [-1, KEEP, -1]).reshape([KEEP, t.shape[2]!]),
      ),
    );
    try {
      const [f, o, c] = (await Promise.all(outs.map((t) => t.array()))) as number[][][];
      const n = Math.min(KEEP, want - frames.length);
      frames.push(...f.slice(0, n));
      onsets.push(...o.slice(0, n));
      contours.push(...c.slice(0, n));
    } finally {
      outs.forEach((t) => t.dispose());
    }
  }
  onProgress?.(1);
  return { frames, onsets, contours };
}

/** De la salida del modelo a notas (rápido; se puede repetir con otra sensibilidad). */
export async function notesFromOutputs(out: BpOutputs, sensitivity: number, minNoteFrames = 11): Promise<RawNote[]> {
  const bp = await import('@spotify/basic-pitch');
  // Umbrales: con más sensibilidad se aceptan notas más débiles.
  const onsetThresh = 0.6 - sensitivity * 0.4;
  const frameThresh = 0.4 - sensitivity * 0.25;
  // Fotogramas → segundos con el reloj de `basicPitchOutputs` (no con `noteFramesToTime`, que corrige el de la librería).
  const notes = bp.outputToNotesPoly(out.frames, out.onsets, onsetThresh, frameThresh, minNoteFrames, true, null, null, true);
  return notes.map((n) => ({ start: n.startFrame / FRAME_RATE, dur: n.durationFrames / FRAME_RATE, midi: n.pitchMidi, amp: n.amplitude }));
}

/** Quita notas fantasma: armónicos (octava, quinta+octava) de otra nota más fuerte y notas muy débiles o cortas. */
/** Un armónico suena más flojo que su nota; si suena casi igual de fuerte, es otra voz cantando a la octava. */
let HARMONIC_RATIO = 0.8;
export const setHarmonicRatio = (r: number) => (HARMONIC_RATIO = r);

export function cleanNotes(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].filter((n) => n.dur >= 0.08 && n.midi >= 33 && n.midi <= 88).sort((a, b) => a.start - b.start);
  if (!sorted.length) return [];
  const amps = sorted.map((n) => n.amp).sort((a, b) => a - b);
  const floor = amps[Math.floor(amps.length * 0.15)] * 0.8;
  const overlap = (a: RawNote, b: RawNote) => Math.max(0, Math.min(a.start + a.dur, b.start + b.dur) - Math.max(a.start, b.start));
  return sorted.filter((n) => {
    if (n.amp < floor) return false;
    for (const m of sorted) {
      if (m === n || m.start > n.start + n.dur) continue;
      const d = n.midi - m.midi;
      // n es armónico de m si está 12, 19 o 24 semitonos por encima, suena a la vez y es más débil.
      if ((d === 12 || d === 19 || d === 24) && overlap(n, m) > 0.6 * n.dur && n.amp < m.amp * HARMONIC_RATIO) return false;
    }
    return true;
  });
}

/** Cuántas voces suenan normalmente a la vez (percentil 90 de notas simultáneas). */
export function estimateVoices(notes: RawNote[]): number {
  if (!notes.length) return 1;
  const end = Math.max(...notes.map((n) => n.start + n.dur));
  const counts: number[] = [];
  for (let t = 0; t < end; t += 0.05) {
    const c = notes.filter((n) => n.start <= t && n.start + n.dur > t).length;
    if (c) counts.push(c);
  }
  counts.sort((a, b) => a - b);
  return Math.max(1, Math.min(6, counts[Math.floor(counts.length * 0.9)] ?? 1));
}

/** Tempo a partir de los ataques (autocorrelación del tren de ataques, 60-180 BPM, preferencia hacia 80-140). */
export function estimateTempo(notes: RawNote[]): { bpm: number; phase: number } {
  if (notes.length < 8) return { bpm: 100, phase: 0 };
  const hop = 0.01;
  const end = Math.max(...notes.map((n) => n.start)) + 1;
  const env = new Float32Array(Math.ceil(end / hop));
  for (const n of notes) {
    const i = Math.round(n.start / hop);
    if (i < env.length) env[i] += Math.min(1, n.amp + 0.3);
  }
  // Suaviza un poco (los ataques de varias voces no caen exactamente a la vez).
  const sm = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) for (let k = -3; k <= 3; k++) if (env[i + k]) sm[i] += env[i + k] * (1 - Math.abs(k) / 4);
  let best = { bpm: 100, score: -Infinity };
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = 60 / bpm / hop;
    let s = 0;
    for (let i = 0; i + lag * 2 < sm.length; i++) {
      const a = sm[i];
      if (!a) continue;
      s += a * (interp(sm, i + lag) + 0.5 * interp(sm, i + lag * 2));
    }
    // Ligera preferencia por tempos centrales (evita el doble o la mitad).
    const pref = Math.exp(-Math.pow(Math.log2(bpm / 110), 2) * 1.2);
    if (s * pref > best.score) best = { bpm, score: s * pref };
  }
  const period = 60 / best.bpm;
  // Fase: el desfase que más ataques deja sobre los pulsos.
  let bestPhase = 0;
  let bestHit = -1;
  for (let ph = 0; ph < period; ph += 0.01) {
    let hit = 0;
    for (const n of notes) {
      const d = ((n.start - ph) / period) % 1;
      const dist = Math.min(d, 1 - d) * period;
      hit += Math.exp(-(dist * dist) / 0.002) * (n.amp + 0.3);
    }
    if (hit > bestHit) {
      bestHit = hit;
      bestPhase = ph;
    }
  }
  return { bpm: Math.round(best.bpm), phase: bestPhase };
}

function interp(a: Float32Array, x: number) {
  const i = Math.floor(x);
  const f = x - i;
  return (a[i] ?? 0) * (1 - f) + (a[i + 1] ?? 0) * f;
}

/**
 * Reparte las notas en `n` voces de aguda a grave: en cada instante, las notas que suenan se ordenan por altura y se
 * asignan a las voces que mejor continúan su línea (sin cruzarlas si se puede). Si suenan más notas que voces,
 * se quedan las más fuertes.
 */
export function assignVoices(notes: RawNote[], n: number): Note[][] {
  const lanes: Note[][] = Array.from({ length: n }, () => []);
  const last: (number | null)[] = new Array(n).fill(null);
  const events = [...notes].sort((a, b) => a.start - b.start || b.midi - a.midi);
  // Para la primera nota de cada voz: a qué voz "tocaría" por su altura dentro de todo el registro.
  const sortedMidi = notes.map((x) => x.midi).sort((a, b) => a - b);
  const hi = sortedMidi[Math.floor(sortedMidi.length * 0.95)] ?? 72;
  const lo = sortedMidi[Math.floor(sortedMidi.length * 0.05)] ?? 48;
  const laneFor = (m: number) => (n === 1 ? 0 : Math.max(0, Math.min(n - 1, ((hi - m) / Math.max(1, hi - lo)) * (n - 1))));
  let i = 0;
  while (i < events.length) {
    // Ataques casi simultáneos (60 ms) se reparten juntos.
    const group: RawNote[] = [events[i]];
    let j = i + 1;
    while (j < events.length && events[j].start - events[i].start < 0.06) group.push(events[j++]);
    i = j;
    const t = group[0].start;
    // Voces libres en este instante (su última nota ya terminó).
    const free = lanes.map((l, k) => k).filter((k) => {
      const l = lanes[k];
      const lastNote = l[l.length - 1];
      return !lastNote || lastNote.start + lastNote.dur <= t + 0.05;
    });
    // Si hay más notas que voces libres, se quedan las más fuertes.
    const chosen = [...group].sort((a, b) => b.amp - a.amp).slice(0, free.length).sort((a, b) => b.midi - a.midi);
    if (!chosen.length) continue;
    // Mejor asignación ordenada: probar a qué voces libres (en orden) van las notas (en orden de altura).
    const combos = combinations(free, chosen.length);
    let bestCombo = combos[0];
    let bestCost = Infinity;
    for (const c of combos) {
      let cost = 0;
      c.forEach((k, idx) => {
        const prev = last[k];
        cost += prev === null ? 4 + 6 * Math.abs(k - laneFor(chosen[idx].midi)) : Math.abs(prev - chosen[idx].midi);
      });
      if (cost < bestCost) {
        bestCost = cost;
        bestCombo = c;
      }
    }
    bestCombo.forEach((k, idx) => {
      const note = chosen[idx];
      const lane = lanes[k];
      const prev = lane[lane.length - 1];
      if (prev && prev.start + prev.dur > note.start) prev.dur = Math.max(0.05, note.start - prev.start);
      lane.push({ midi: note.midi, start: note.start, dur: note.dur });
      last[k] = note.midi;
    });
  }
  return lanes;
}

function combinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

/** Ajusta a la rejilla (en pulsos) desplazando el tiempo para que el primer pulso caiga en 0. */
function quantizeLane(notes: Note[], spb: number, grid: number, phase: number): Note[] {
  const g = grid * spb;
  const out: Note[] = [];
  for (const n of notes) {
    const s = Math.max(0, Math.round((n.start - phase) / g) * g);
    let e = Math.round((n.start + n.dur - phase) / g) * g;
    if (e <= s) e = s + g;
    const prev = out[out.length - 1];
    if (prev && s < prev.start + prev.dur) {
      if (s <= prev.start) continue;
      prev.dur = s - prev.start;
    }
    // Une notas iguales seguidas (una nota larga partida por la respiración del detector).
    if (prev && prev.midi === n.midi && Math.abs(prev.start + prev.dur - s) < 1e-6 && n.dur < spb * 0.6) {
      prev.dur = e - prev.start;
      continue;
    }
    out.push({ midi: n.midi, start: s, dur: e - s });
  }
  return out;
}

/** Convierte un archivo de audio en una canción con sus voces. */
export async function audioToSong(data: ArrayBuffer, title: string, opts: AudioOptions): Promise<Song> {
  opts.onProgress?.('Leyendo el audio…', 0);
  const { samples, duration } = await decodeAudio(data);
  const a = Math.max(0, Math.floor(opts.start * SR));
  const b = opts.end > opts.start ? Math.min(samples.length, Math.floor(opts.end * SR)) : samples.length;
  if (b - a < SR) throw new Error('El tramo elegido es demasiado corto.');
  // Las notas salen contadas desde el principio del tramo; `audioPhase` se guarda en segundos del archivo (dónde cae el
  // 0 de la canción), y así otra pista grabada a la vez cae en su sitio aunque se convierta desde otro segundo.
  const t0 = a / SR;
  opts.onProgress?.('Escuchando las voces…', 0.02);
  const out = await basicPitchOutputs(samples.subarray(a, b), (p) => opts.onProgress?.('Escuchando las voces…', 0.02 + p * 0.9));
  const raw = await notesFromOutputs(out, opts.sensitivity);
  opts.onProgress?.('Ordenando las notas…', 0.95);
  const clean = cleanNotes(raw);
  if (!clean.length) throw new Error('No he encontrado notas en ese audio. ¿Tiene voces cantando?');
  const nVoices = opts.voices || estimateVoices(clean);
  // Con keepTime, el 0 de la canción abierta está en el segundo `opts.phase` del archivo: desde el tramo, en phase − t0.
  const tempo = opts.bpm
    ? { bpm: opts.bpm, phase: opts.keepTime ? (opts.phase ?? 0) - t0 : estimateTempo(clean).phase }
    : estimateTempo(clean);
  const spb = 60 / tempo.bpm;
  // Al añadir a una canción, lo que suena antes de su 0 (el diapasón, la cuenta) no es de ella: fuera, y lo que lo cruza
  // se recorta. Si no, todo eso se amontonaba en el 0 y tapaba la primera nota.
  const notas = opts.keepTime
    ? clean
        .filter((n) => n.start + n.dur > tempo.phase + 0.02)
        .map((n) => (n.start < tempo.phase ? { ...n, start: tempo.phase, dur: n.start + n.dur - tempo.phase } : n))
    : clean;
  const lanes = assignVoices(notas, nVoices)
    .map((l) => (opts.grid ? quantizeLane(l, spb, opts.grid, tempo.phase) : l.map((x) => ({ ...x, start: Math.max(0, x.start - tempo.phase) }))))
    .map((l) => (opts.keepTime && opts.transpose ? l.map((x) => ({ ...x, midi: x.midi - opts.transpose! })) : l))
    .filter((l) => l.length >= 3);
  const names = lanes.length === 1 ? ['Voz'] : lanes.map((_, k) => `Voz ${k + 1}`);
  const voices = lanes.map((notes, k) => {
    const v = makeVoice(names[k], k, notes);
    v.color = VOICE_COLORS[k % VOICE_COLORS.length];
    return v;
  });
  const song = makeSong({ title, bpm: tempo.bpm, beatsPerBar: 4, voices });
  song.chords = computeChords(song);
  song.audioPhase = t0 + tempo.phase;
  opts.onProgress?.('Listo', 1);
  void duration;
  return song;
}
