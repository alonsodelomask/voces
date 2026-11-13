// Partitura + grabación: las notas salen de la partitura (que están bien) y el ritmo, de la grabación (como se canta).
// 1) El modelo de Basic Pitch escucha la grabación (qué alturas suenan en cada instante).
// 2) Se busca en qué tono está cantada (puede estar más alta o más baja que la partitura).
// 3) DTW (alineamiento temporal dinámico) empareja cada momento de la partitura con su momento en la grabación.
// 4) Cada nota se mueve a su sitio y se afina el ataque con los ataques que se oyen en la grabación.
import { makeSong, songDuration, uid, type Note, type Song } from '../model';
import { computeChords, transposeSong } from '../music';
import { basicPitchOutputs, decodeAudio } from './audio';

const SR = 22050;
/** Resolución del alineamiento, en segundos. */
const STEP = 0.1;
/** Nota MIDI de la primera fila de Basic Pitch (La0). */
const MIDI0 = 21;
/** Ajustes (se pueden cambiar en las pruebas). */
export const ALIGN = { stall: 0.08, harm: 0.2, refine: true, smooth: 3 };

export interface AlignOptions {
  /** Tramo de la grabación, en segundos (end 0 = hasta el final). */
  start: number;
  end: number;
  /** true: dejar la tonalidad de la partitura; false: pasar a la tonalidad en la que se canta. */
  keepKey: boolean;
  onProgress?: (fase: string, fraccion: number) => void;
}

export interface AlignResult {
  song: Song;
  /** Semitonos entre la partitura y la grabación (−2: se canta un tono más bajo). */
  transpose: number;
  /** Parte de la partitura que se ha encontrado en la grabación, en segundos de la partitura. */
  from: number;
  to: number;
  /** Dónde está ese tramo en la grabación, en segundos del archivo. */
  audioFrom: number;
  audioTo: number;
  /** Segundo de la partitura → segundo del archivo de audio. */
  toAudio: (t: number) => number;
  /** 0..1: cuánto se parecen (1 = perfecto). */
  match: number;
  /** Voces que se cantan una octava por encima (+12) o por debajo (−12) de como están escritas. */
  octaves: { name: string; semis: number }[];
}

type Chroma = Float32Array; // 12 valores normalizados; todo ceros = silencio

function normalize(v: Float32Array): Float32Array {
  const n = Math.hypot(...v);
  if (n > 0) for (let k = 0; k < v.length; k++) v[k] /= n;
  return v;
}

/** Cromas de la partitura cada STEP segundos (con un poco del armónico de quinta, que la voz también tiene). */
function scoreChroma(notes: Note[], end: number, tr: number): Chroma[] {
  const out: Chroma[] = [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (let t = 0; t < end; t += STEP) {
    const v = new Float32Array(12);
    const mid = t + STEP / 2;
    for (const n of sorted) {
      if (n.start > mid) break;
      if (n.start + n.dur <= mid) continue;
      const pc = (((n.midi + tr) % 12) + 12) % 12;
      v[pc] += 1;
      v[(pc + 7) % 12] += ALIGN.harm;
    }
    out.push(normalize(v));
  }
  return out;
}

/** Cromas de la grabación cada STEP segundos a partir de la «probabilidad de nota» de cada fila del modelo. */
function audioChroma(frames: number[][], fps: number): { chroma: Chroma[]; energy: number[] } {
  const chroma: Chroma[] = [];
  const energy: number[] = [];
  const per = fps * STEP;
  const count = Math.floor(frames.length / per);
  for (let k = 0; k < count; k++) {
    const v = new Float32Array(12);
    let e = 0;
    const a = Math.round(k * per);
    const b = Math.min(frames.length, Math.round((k + 1) * per));
    for (let f = a; f < b; f++) {
      const row = frames[f];
      for (let i = 0; i < row.length; i++) {
        const x = row[i];
        if (x < 0.15) continue;
        v[(MIDI0 + i) % 12] += x * x;
        e = Math.max(e, x);
      }
    }
    energy.push(e);
    chroma.push(e < 0.3 ? new Float32Array(12) : normalize(v));
  }
  return { chroma, energy };
}

function cost(a: Chroma, b: Chroma): number {
  let s = 0;
  let ea = 0;
  let eb = 0;
  for (let k = 0; k < 12; k++) {
    s += a[k] * b[k];
    ea += a[k];
    eb += b[k];
  }
  if (!ea && !eb) return 0;
  if (!ea || !eb) return 0.7;
  return 1 - s;
}


/**
 * DTW de subsecuencia: B (eje j, entera) se empareja con un tramo seguido de S (eje i). Se usa en los dos sentidos:
 * grabación entera dentro de la partitura (se ha grabado un trozo) o partitura entera dentro de la grabación
 * (varias tomas, charla antes de empezar…).
 * Con `path` devuelve también el camino; sin él, solo el coste (para probar tonalidades rápido).
 */
function dtw(S: Chroma[], A: Chroma[], path: boolean): { cost: number; path?: [number, number][] } {
  const n = S.length;
  const m = A.length;
  // Columnas por j (grabación): prev = j-1, cur = j.
  let prev = new Float32Array(n);
  let cur = new Float32Array(n);
  let prevLen = new Float32Array(n);
  let curLen = new Float32Array(n);
  const dir = path ? new Uint8Array(n * m) : null; // 0 diagonal, 1 avanza la partitura, 2 avanza la grabación, 3 inicio
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const c = cost(S[i], A[j]);
      let best: number;
      let len: number;
      let d: number;
      if (j === 0) {
        // Se puede empezar en cualquier punto de la partitura.
        best = c;
        len = 1;
        d = 3;
        if (i > 0 && cur[i - 1] + c + ALIGN.stall < best) {
          best = cur[i - 1] + c + ALIGN.stall;
          len = curLen[i - 1] + 1;
          d = 1;
        }
      } else {
        best = prev[i] + c + ALIGN.stall; // avanza solo la grabación
        len = prevLen[i] + 1;
        d = 2;
        if (i > 0) {
          const diag = prev[i - 1] + c;
          if (diag <= best) {
            best = diag;
            len = prevLen[i - 1] + 1;
            d = 0;
          }
          const up = cur[i - 1] + c + ALIGN.stall;
          if (up < best) {
            best = up;
            len = curLen[i - 1] + 1;
            d = 1;
          }
        }
      }
      cur[i] = best;
      curLen[i] = len;
      if (dir) dir[i * m + j] = d;
    }
    [prev, cur] = [cur, prev];
    [prevLen, curLen] = [curLen, prevLen];
  }
  // Se puede terminar en cualquier punto de S: el menor coste total (el medio premiaría alargar el final con
  // trozos que se parecen, como el principio de otra toma). Para comparar, el coste medio por paso.
  let endI = 0;
  for (let i = 1; i < n; i++) if (prev[i] < prev[endI]) endI = i;
  const bestAvg = prev[endI] / prevLen[endI];
  if (!dir) return { cost: bestAvg };
  const p: [number, number][] = [];
  let i = endI;
  let j = m - 1;
  for (;;) {
    p.push([i, j]);
    const d = dir[i * m + j];
    if (d === 3) break;
    if (d === 0) {
      i--;
      j--;
    } else if (d === 1) i--;
    else j--;
    if (i < 0 || j < 0) break;
  }
  p.reverse();
  return { cost: bestAvg, path: p };
}

/** Función creciente partitura (s) → grabación (s) a partir del camino, suavizada. */
function warpFromPath(path: [number, number][]): { f: (t: number) => number; from: number; to: number } {
  // Para cada paso de la partitura, el punto medio de la grabación que le corresponde.
  const byI = new Map<number, number[]>();
  for (const [i, j] of path) {
    const l = byI.get(i);
    if (l) l.push(j);
    else byI.set(i, [j]);
  }
  const is = [...byI.keys()].sort((a, b) => a - b);
  let xs = is.map((i) => (i + 0.5) * STEP);
  // En los extremos, el DTW puede quedarse «parado» en la primera o la última nota mientras la grabación sigue (otra toma,
  // aplausos): la primera se toma donde acaba ese tramo y la última, donde empieza.
  let ys = is.map((i, k) => {
    const l = byI.get(i)!;
    const j = k === 0 ? l[l.length - 1] : k === is.length - 1 ? l[0] : (l[0] + l[l.length - 1]) / 2;
    return (j + 0.5) * STEP;
  });
  // Suaviza los dientes de sierra del DTW (media móvil de ±3 pasos) y garantiza que siempre avanza.
  const W = ALIGN.smooth;
  ys = ys.map((_, k) => {
    let s = 0;
    let c = 0;
    for (let d = -W; d <= W; d++) {
      const y = ys[k + d];
      if (y !== undefined) {
        s += y;
        c++;
      }
    }
    return s / c;
  });
  for (let k = 1; k < ys.length; k++) if (ys[k] < ys[k - 1] + 0.001) ys[k] = ys[k - 1] + 0.001;
  if (xs.length === 1) {
    xs = [xs[0], xs[0] + STEP];
    ys = [ys[0], ys[0] + STEP];
  }
  const f = (t: number) => {
    // Fuera del tramo: se prolonga con la pendiente de los extremos.
    if (t <= xs[0]) return ys[0] + (t - xs[0]) * slope(0, Math.min(10, xs.length - 1));
    const L = xs.length - 1;
    if (t >= xs[L]) return ys[L] + (t - xs[L]) * slope(Math.max(0, L - 10), L);
    let lo = 0;
    let hi = L;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= t) lo = mid;
      else hi = mid;
    }
    const u = (t - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + u * (ys[hi] - ys[lo]);
  };
  const slope = (a: number, b: number) => (b > a ? (ys[b] - ys[a]) / (xs[b] - xs[a]) : 1);
  return { f, from: xs[0] - STEP / 2, to: xs[xs.length - 1] + STEP / 2 };
}

/** Afina el ataque de una nota buscando, cerca de donde la pone el DTW, el ataque de esa altura en la grabación. */
function refineOnset(t: number, midi: number, onsets: number[][], fps: number): number {
  const WIN = 0.25;
  const a = Math.max(0, Math.floor((t - WIN) * fps));
  const b = Math.min(onsets.length - 1, Math.ceil((t + WIN) * fps));
  let best = t;
  let bestScore = 0.25; // por debajo de esto no se fía y deja el del DTW
  for (const m of [midi, midi - 12, midi + 12]) {
    const row = m - MIDI0;
    if (row < 0 || row >= 88) continue;
    for (let f = a; f <= b; f++) {
      const x = onsets[f][row];
      if (!x) continue;
      const tf = f / fps;
      const score = x * Math.exp(-((tf - t) ** 2) / (2 * 0.2 ** 2)) * (m === midi ? 1 : 0.7);
      if (score > bestScore) {
        bestScore = score;
        best = tf;
      }
    }
  }
  return best;
}

/** Cuánto se oye una voz (media de la «probabilidad de nota» del modelo durante sus notas), subida o bajada `semis`. */
function heard(notes: Note[], semis: number, frames: number[][], fps: number): number {
  let on = 0;
  let tot = 0;
  for (const n of notes) {
    const row = n.midi + semis - MIDI0;
    if (row < 0 || row >= 88) continue;
    for (let t = n.start + 0.05; t < n.start + n.dur - 0.05; t += 0.05) {
      const f = Math.round(t * fps);
      if (f < 0 || f >= frames.length) continue;
      tot++;
      on += frames[f][row];
    }
  }
  return tot >= 20 ? on / tot : 0;
}

/** Coloca las notas de `score` donde suenan en la grabación `data`. */
export async function alignScoreToAudio(score: Song, data: ArrayBuffer, title: string, opts: AlignOptions): Promise<AlignResult> {
  const progress = opts.onProgress ?? (() => {});
  const all = score.voices.flatMap((v) => v.notes);
  if (!all.length) throw new Error('La partitura no tiene notas.');
  progress('Leyendo el audio…', 0);
  const { samples } = await decodeAudio(data);
  const a = Math.max(0, Math.floor(opts.start * SR));
  const b = opts.end > opts.start ? Math.min(samples.length, Math.floor(opts.end * SR)) : samples.length;
  if (b - a < SR * 2) throw new Error('El tramo elegido es demasiado corto.');
  progress('Escuchando la grabación…', 0.02);
  const out = await basicPitchOutputs(samples.subarray(a, b), (p) => progress('Escuchando la grabación…', 0.02 + p * 0.85));
  const fps = out.frames.length / ((b - a) / SR);

  progress('Buscando cada compás en la grabación…', 0.88);
  await new Promise((r) => setTimeout(r));
  const { chroma: A0, energy } = audioChroma(out.frames, fps);
  // Silencio del principio y del final fuera (aplausos o ruido flojo no cuentan).
  let j0 = 0;
  let j1 = A0.length - 1;
  while (j0 < j1 && energy[j0] < 0.3) j0++;
  while (j1 > j0 && energy[j1] < 0.3) j1--;
  const A = A0.slice(j0, j1 + 1);
  if (A.length < 10) throw new Error('No he oído voces en esa grabación.');

  // Tonalidad: se prueban todas con el perfil de alturas global y las tres mejores, con el DTW completo (solo coste).
  const scoreEnd = songDuration(score) + STEP;
  const prof = (cs: Chroma[]) => normalize(cs.reduce((acc, c) => (c.forEach((x, k) => (acc[k] += x)), acc), new Float32Array(12)));
  const pa = prof(A);
  const ps = prof(scoreChroma(all, scoreEnd, 0));
  const cands = Array.from({ length: 12 }, (_, tr) => {
    let s = 0;
    for (let k = 0; k < 12; k++) s += ps[k] * pa[(k + tr) % 12];
    return { tr: tr > 6 ? tr - 12 : tr, s };
  })
    .sort((x, y) => y.s - x.s)
    .slice(0, 3);
  // La partitura empieza en su primera nota (los silencios del principio no ayudan a encontrarla).
  const s0 = Math.floor(Math.min(...all.map((n) => n.start)) / STEP);
  const chromaFor = (tr: number) => scoreChroma(all, scoreEnd, tr).slice(s0);
  let best = { tr: 0, cost: Infinity, scoreInAudio: false };
  for (const c of cands) {
    const S = chromaFor(c.tr);
    for (const scoreInAudio of [false, true]) {
      const r = scoreInAudio ? dtw(A, S, false) : dtw(S, A, false);
      if (r.cost < best.cost) best = { tr: c.tr, cost: r.cost, scoreInAudio };
      await new Promise((r) => setTimeout(r));
    }
  }
  const S = chromaFor(best.tr);
  const raw = best.scoreInAudio ? dtw(A, S, true).path?.map(([j, i]) => [i, j] as [number, number]) : dtw(S, A, true).path;
  const path = raw?.map(([i, j]) => [i + s0, j] as [number, number]);
  if (!path || path.length < 10) throw new Error('No he conseguido emparejar la grabación con la partitura.');
  const match = Math.max(0, Math.min(1, 1 - best.cost / 0.7));
  if (match < 0.35) throw new Error('La grabación y la partitura no se parecen lo suficiente. ¿Son la misma canción? Prueba a elegir el tramo que se canta.');
  const warp = warpFromPath(path);
  const offset = j0 * STEP; // segundos recortados al principio de la grabación
  const toAudio = (t: number) => warp.f(t) + offset;

  progress('Colocando las notas…', 0.97);
  // Notas que caen dentro del tramo emparejado (con un poco de margen).
  const inRange = (n: Note) => n.start + n.dur > warp.from - 0.05 && n.start < warp.to + 0.05;
  const song: Song = makeSong({
    title,
    beatsPerBar: score.beatsPerBar,
    keyFifths: score.keyFifths,
    chordsAuto: score.chordsAuto,
  });
  let first = Infinity;
  song.voices = score.voices.map((v) => {
    const src = v.notes.filter(inRange).sort((x, y) => x.start - y.start);
    const placed = src.map((n) => ({ n, s: toAudio(n.start), e: toAudio(n.start + n.dur) }));
    // Afina ataques, sin desordenar la voz.
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k];
      const r = !ALIGN.refine ? p.s : refineOnset(p.s, p.n.midi + best.tr, out.onsets, fps);
      const prevS = k ? placed[k - 1].s : -Infinity;
      const nextS = k + 1 < placed.length ? placed[k + 1].s : Infinity;
      if (r > prevS + 0.06 && r < nextS - 0.06) p.s = r;
    }
    const notes: Note[] = placed.map((p, k) => {
      const next = placed[k + 1];
      // Si en la partitura la nota enlaza con la siguiente, aquí también.
      const legato = next && Math.abs(p.n.start + p.n.dur - next.n.start) < 1e-3;
      let e = legato ? next.s : p.e;
      if (next && e > next.s) e = next.s;
      const note: Note = { midi: p.n.midi, start: p.s, dur: Math.max(0.06, e - p.s) };
      if (p.n.name) note.name = p.n.name;
      first = Math.min(first, p.s);
      return note;
    });
    return { ...v, id: uid(), notes };
  });
  // Octava de cada voz: un grupo de voces graves canta a menudo una octava por debajo de lo escrito en clave de sol.
  const octaves: { name: string; semis: number }[] = [];
  for (const v of song.voices) {
    const base = heard(v.notes, best.tr, out.frames, fps);
    let semis = 0;
    for (const o of [-12, 12]) {
      const h = heard(v.notes, best.tr + o, out.frames, fps);
      if (h > 0.2 && h > base * 2 && h > heard(v.notes, best.tr + semis, out.frames, fps)) semis = o;
    }
    if (semis) {
      for (const n of v.notes) {
        n.midi += semis;
        if (n.name) n.name = n.name.replace(/-?\d+$/, (d) => String(Number(d) + semis / 12));
      }
      octaves.push({ name: v.name, semis });
    }
  }
  // El tiempo de la canción empieza con la primera nota (como en la partitura si empezaba con silencio, a escala).
  const span = Math.max(0.5, toAudio(warp.to) - toAudio(warp.from));
  const ratio = (warp.to - warp.from) / span; // > 1: se canta más rápido que la partitura
  const firstScore = Math.min(...score.voices.flatMap((v) => v.notes.filter(inRange).map((n) => n.start)));
  const lead = Math.max(0, (firstScore - warp.from) / ratio);
  const shift = first - lead;
  for (const v of song.voices) for (const n of v.notes) n.start = Math.max(0, n.start - shift);
  song.bpm = Math.max(30, Math.min(260, Math.round(score.bpm * ratio)));
  song.chords = score.chordsAuto
    ? []
    : score.chords.filter((c) => c.time >= warp.from - 0.05 && c.time <= warp.to + 0.05).map((c) => ({ ...c, time: Math.max(0, toAudio(c.time) - shift) }));
  if (!opts.keepKey && best.tr) transposeSong(song, best.tr);
  if (song.chordsAuto) song.chords = computeChords(song);
  progress('Listo', 1);
  return { song, transpose: best.tr, from: Math.max(0, warp.from), to: warp.to, audioFrom: opts.start + toAudio(warp.from), audioTo: opts.start + toAudio(warp.to), toAudio: (t) => opts.start + toAudio(t), match, octaves };
}
