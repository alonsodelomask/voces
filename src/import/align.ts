// Partitura + grabación: las notas salen de la partitura (que están bien) y el ritmo, de la grabación (como se canta).
// 1) El modelo de Basic Pitch escucha la grabación (qué alturas suenan en cada instante).
// 2) Se busca en qué tono está cantada (puede estar más alta o más baja que la partitura).
// 3) DTW (alineamiento temporal dinámico) empareja cada momento de la partitura con su momento en la grabación.
// 4) Cada nota se mueve a su sitio y se afina el ataque con los ataques que se oyen en la grabación.
import { makeSong, makeVoice, songDuration, uid, VOICE_COLORS, type Note, type Song, type Voice } from '../model';
import { computeChords, transposeSong } from '../music';
import { basicPitchOutputs, cleanNotes, decodeAudio, FRAME_RATE, notesFromOutputs, type BpOutputs, type RawNote } from './audio';
import { isSung } from '../ai/fusion';

const SR = 22050;
/** Resolución del alineamiento, en segundos. */
const STEP = 0.1;
/** Nota MIDI de la primera fila de Basic Pitch (La0). */
const MIDI0 = 21;
/** Ajustes (se pueden cambiar en las pruebas). */
export const ALIGN = {
  stall: 0.08,
  harm: 0.2,
  refine: true,
  smooth: 3,
  /** Semitonos que puede apartarse de su línea lo que se oye antes de dar por hecho que es otra voz. */
  sungWindow: 2,
  /** Para que una nota valga de ancla: fuerza del ataque y cuánto se oye esa altura después (medidos con «La vida es una copa de licor»). */
  onset: 0.12,
  heard: 0.1,
  /** La curva de corrección: tamaño del tramo, en segundos de partitura, y anclas mínimas para fiarse de él. */
  bin: 0.5,
  minBin: 3,
  /**
   * «Toda la grabación»: lo que cuesta entrar en la partitura o saltar de compás (repetir o saltarse un trozo), y la
   * pasada más corta que vale. Tiene que ser alto: en una grabación de verdad un compás se parece a otros muchos, y
   * con un salto barato el camino iba de trocito en trocito en vez de seguir la toma entera.
   */
  jump: 10,
  minPass: 1.5,
  /**
   * Coste por fotograma de estar «fuera de la partitura» (charla, diapasón, silencio entre tomas) oyéndose algo: lo
   * que cuesta de media un fotograma cantado de esta misma grabación más `skipMargin`, sin bajar de `skip` ni pasar de
   * `skipMax`. Una grabación limpia se parece mucho a su partitura; una de verdad, bastante menos, y con un coste fijo
   * le salía más barato saltarse media toma. En silencio, `skipSilent`.
   */
  skip: 0.5,
  skipMargin: 0.25,
  skipMax: 0.75,
  skipSilent: 0.05,
  /** Cuánto peor que la pasada principal puede parecerse una pasada a la grabación para darla por buena. */
  passCost: 0.3,
};

export interface AlignOptions {
  /** Tramo de la grabación, en segundos (end 0 = hasta el final). */
  start: number;
  end: number;
  /** true: dejar la tonalidad de la partitura; false: pasar a la tonalidad en la que se canta. */
  keepKey: boolean;
  /**
   * Qué abarca la canción que sale:
   * - `match` (lo normal): solo el trozo de partitura que se encuentra en la grabación;
   * - `score`: toda la partitura, estirando el ritmo también en lo que no se llegó a cantar;
   * - `audio`: toda la grabación, dejando las notas en el segundo del archivo en que suenan.
   */
  span?: 'match' | 'score' | 'audio';
  /** Añadir una voz con las notas que de verdad se cantan (sacadas del audio). */
  addSung?: boolean;
  onProgress?: (fase: string, fraccion: number) => void;
  /**
   * Solo para las pruebas: lo que oye el modelo en todo el archivo, ya calculado con `basicPitchOutputs` (se salta el
   * paso lento). `seconds` es la duración del archivo (solo informativa: el reloj es `FRAME_RATE`).
   */
  outputs?: { out: BpOutputs; seconds?: number };
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
  /** Voces que se cantan una octava por encima (+12) o por debajo (−12) de como están escritas (`index`: su posición). */
  octaves: { name: string; index: number; semis: number }[];
  /** Segundo del archivo de audio que corresponde al instante 0 de la canción (para oír la grabación encima). */
  audioOffset: number;
  /** Si se pidió: la voz con lo que se canta de verdad, y a qué línea de la partitura corresponde. */
  sung?: { voice: Voice; matches: string; agreement: number };
  /**
   * Golpes (momentos de la partitura en que empieza alguna nota, en cada pasada) que se han podido clavar en un ataque
   * de la grabación; los demás van con la curva de corrección. Todas las voces de un golpe se mueven juntas.
   */
  anchors: number;
  /** Cada tramo de la grabación en que se recorre la partitura de seguido (con «toda la grabación» puede haber varios). */
  passes: { from: number; to: number; audioFrom: number; audioTo: number }[];
  /** Vueltas enteras a la partitura (o tomas): los trozos repetidos o saltados dentro de una vuelta no cuentan. */
  laps: number;
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

/**
 * DTW con saltos («toda la grabación»): la grabación entera (eje j) recorre la partitura (eje i) una o varias veces.
 * Además de los pasos normales:
 * - al acabar un compás (`ends`) se puede saltar a cualquier sitio donde se pueda entrar (`starts`: principios de
 *   compás y ataques, para las anacrusas) pagando `ALIGN.jump`: repeticiones que no están escritas, un trozo que
 *   se salta, otra toma seguida;
 * - en cualquier momento se puede salir **fuera de la partitura** (charla, diapasón, silencio entre tomas, una
 *   introducción…) pagando `skip` por fotograma, y volver a entrar por un `starts` pagando el salto. Sin este
 *   estado, al DTW le salía más barato «cantar» encima un trozo de partitura que esperar, y se inventaba notas.
 * Entrar en la partitura cuesta lo mismo al principio de la grabación que después: si al principio fuera gratis,
 * con charla antes de cantar le salía más barato quedarse en la primera nota que salir y volver a entrar.
 * Devuelve el camino solo con los puntos dentro de la partitura.
 */
function dtwJumps(S: Chroma[], A: Chroma[], starts: Uint8Array, endsSet: Uint8Array, skip: number): [number, number][] {
  const n = S.length;
  const m = A.length;
  const ends: number[] = [];
  for (let i = 0; i < n; i++) if (endsSet[i] || i === n - 1) ends.push(i);
  let prev = new Float32Array(n);
  let cur = new Float32Array(n);
  // 0 diagonal, 1 avanza la partitura, 2 avanza la grabación, 3 inicio, 4 salto, 5 vuelve de «fuera».
  const dir = new Uint8Array(n * m);
  const jumpFrom = new Int32Array(m); // por columna: el final de compás desde el que se salta
  // skipFrom[j]: -2 empieza fuera, -1 seguía fuera, i ≥ 0 sale de la partitura desde el fotograma i (columna j - 1).
  const skipFrom = new Int32Array(m);
  let skipPrev = Infinity;
  for (let j = 0; j < m; j++) {
    const ks = A[j].some((x) => x > 0) ? skip : ALIGN.skipSilent;
    let bestEnd = Infinity;
    let bestK = -1;
    let skipCur: number;
    if (j > 0) {
      for (const k of ends) {
        if (prev[k] < bestEnd) {
          bestEnd = prev[k];
          bestK = k;
        }
      }
      // Se puede dejar la partitura en cualquier sitio: a veces se paran a mitad de compás.
      let b = skipPrev;
      let from = -1;
      for (let i = 0; i < n; i++) {
        if (prev[i] < b) {
          b = prev[i];
          from = i;
        }
      }
      skipCur = b + ks;
      skipFrom[j] = from;
    } else {
      skipCur = ks;
      skipFrom[j] = -2;
    }
    jumpFrom[j] = bestK;
    for (let i = 0; i < n; i++) {
      const c = cost(S[i], A[j]);
      let best: number;
      let d: number;
      if (j === 0) {
        best = c + ALIGN.jump;
        d = 3;
        if (i > 0 && cur[i - 1] + c + ALIGN.stall < best) {
          best = cur[i - 1] + c + ALIGN.stall;
          d = 1;
        }
      } else {
        best = prev[i] + c + ALIGN.stall;
        d = 2;
        if (i > 0) {
          const diag = prev[i - 1] + c;
          if (diag <= best) {
            best = diag;
            d = 0;
          }
          const up = cur[i - 1] + c + ALIGN.stall;
          if (up < best) {
            best = up;
            d = 1;
          }
        }
        if (starts[i]) {
          if (bestK >= 0) {
            const salto = bestEnd + c + ALIGN.jump;
            if (salto < best) {
              best = salto;
              d = 4;
            }
          }
          const vuelve = skipPrev + c + ALIGN.jump;
          if (vuelve < best) {
            best = vuelve;
            d = 5;
          }
        }
      }
      cur[i] = best;
      dir[i * m + j] = d;
    }
    [prev, cur] = [cur, prev];
    skipPrev = skipCur;
  }
  // Se acaba donde menos cuesta: en la partitura (a mitad, si la grabación se corta) o fuera de ella.
  let i = 0;
  for (let k = 1; k < n; k++) if (prev[k] < prev[i]) i = k;
  let fuera = skipPrev < prev[i];
  let j = m - 1;
  const path: [number, number][] = [];
  for (;;) {
    if (fuera) {
      const f = skipFrom[j];
      if (f === -2) break;
      j--;
      if (j < 0) break;
      if (f >= 0) {
        fuera = false;
        i = f;
      }
      continue;
    }
    path.push([i, j]);
    const d = dir[i * m + j];
    if (d === 3) break;
    if (d === 0) {
      i--;
      j--;
    } else if (d === 1) i--;
    else if (d === 2) j--;
    else if (d === 4) {
      i = jumpFrom[j];
      j--;
    } else {
      fuera = true;
      j--;
    }
    if (i < 0 || j < 0) break;
  }
  return path.reverse();
}

/** Parte un camino con saltos en pasadas: tramos en los que la partitura avanza de seguido. */
function splitPasses(path: [number, number][]): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of path) {
    const last = cur[cur.length - 1];
    // También se corta donde la grabación da un salto (lo de en medio quedó fuera de la partitura).
    if (last && (p[0] < last[0] || p[0] > last[0] + 1 || p[1] > last[1] + 1)) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

type Warp = { f: (t: number) => number; from: number; to: number };

/** Función creciente partitura (s) → grabación (s) a partir del camino, suavizada. */
function warpFromPath(path: [number, number][]): Warp {
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
    // Ventana simétrica que se estrecha en los extremos: cortada por un lado, la media se iría hacia dentro y cada
    // pasada empezaría unas décimas tarde y acabaría antes de tiempo.
    const w = Math.min(W, k, ys.length - 1 - k);
    let s = 0;
    for (let d = -w; d <= w; d++) s += ys[k + d];
    return s / (2 * w + 1);
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

/** Una nota de la partitura colocada en la grabación: `p` es su pasada y `ts`, el segundo de partitura en que empieza. */
type Placed = { n: Note; s: number; e: number; p: number; ts: number };

/** Fuerza del ataque de esa altura (contando las octavas, que el modelo confunde a menudo). */
function onsetAt(t: number, midi: number, out: BpOutputs, fps: number): number {
  const f = Math.round(t * fps);
  if (f < 0 || f >= out.onsets.length) return 0;
  const row = (m: number) => (m - MIDI0 >= 0 && m - MIDI0 < 88 ? out.onsets[f][m - MIDI0] : 0);
  return row(midi) + 0.6 * row(midi + 12) + 0.6 * row(midi - 12);
}

/** Cuánto se oye esa altura justo después de `t`: un ataque de otra voz no sirve de ancla. */
function heardAfter(t: number, midi: number, out: BpOutputs, fps: number): number {
  const row = midi - MIDI0;
  if (row < 0 || row >= 88) return 0;
  let s = 0;
  let c = 0;
  for (let d = 0.05; d < 0.3; d += 0.05) {
    const f = Math.round((t + d) * fps);
    if (f < 0 || f >= out.frames.length) continue;
    c++;
    s += out.frames[f][row];
  }
  return c ? s / c : 0;
}

/** Un sitio de la partitura donde se ha reconocido el ataque en la grabación: `r` es lo que falla el DTW. */
type Anchor = { x: number; r: number };

/**
 * Anclas de una voz: notas con un ataque claro de esa misma altura y que además se oyen después (un ataque de
 * otra voz no vale). El DTW coloca por tramos de una décima de segundo y suavizados, así que nota a nota se
 * queda corto; estas anclas dicen cuánto se desvía.
 */
function anchorsOf(placed: Placed[], out: BpOutputs, fps: number, tr: number): ({ t: number; w: number } | null)[] {
  const step = 1 / fps;
  return placed.map((p, k) => {
    // Nunca más de medio hueco hasta las notas vecinas: si no, dos notas iguales seguidas se quedarían con el
    // mismo ataque (en la segunda no hay ninguno que detectar).
    const antes = k > 0 ? (p.s - placed[k - 1].s) / 2 : 0.3;
    const despues = k + 1 < placed.length ? (placed[k + 1].s - p.s) / 2 : 0.3;
    const W = Math.max(0.05, Math.min(0.3, antes, despues));
    let best = { t: p.s, x: 0 };
    for (let d = -W; d <= W; d += step) {
      const t = p.s + d;
      // Cuanto más lejos del sitio que dice el DTW, menos se fía.
      const x = onsetAt(t, p.n.midi + tr, out, fps) * Math.exp(-(d * d) / (2 * 0.22 ** 2));
      if (x > best.x) best = { t, x };
    }
    if (best.x <= ALIGN.onset) return null;
    const oido = heardAfter(best.t, p.n.midi + tr, out, fps);
    // `w`: cuánto se fía (ataque claro y la nota se oye después). Sirve para elegir entre voces del mismo golpe.
    return oido > ALIGN.heard ? { t: best.t, w: best.x * oido } : null;
  });
}

/**
 * La curva de corrección: por cada segundo de partitura, la desviación típica (la mediana) de sus anclas, y entre
 * medias se interpola. Con la mediana, un ancla equivocada no estropea el tramo. Sale `null` si hay pocas.
 */
function buildCorrection(anchors: Anchor[]): ((x: number) => number) | null {
  if (anchors.length < 8) return null;
  const orden = [...anchors].sort((a, b) => a.x - b.x);
  const x0 = orden[0].x;
  const x1 = orden[orden.length - 1].x;
  const PASO = 0.25;
  const xs: number[] = [];
  const rs: number[] = [];
  for (let x = x0; x <= x1 + PASO; x += PASO) {
    // Ventana que se ensancha hasta reunir anclas suficientes: así vale igual con muchas notas que con pocas.
    let vals: number[] = [];
    for (let w = ALIGN.bin; w <= 4 && vals.length < ALIGN.minBin; w *= 2) {
      vals = orden.filter((a) => Math.abs(a.x - x) <= w).map((a) => a.r);
    }
    if (vals.length < ALIGN.minBin) continue;
    vals.sort((a, b) => a - b);
    xs.push(x);
    rs.push(vals[Math.floor(vals.length / 2)]);
  }
  if (xs.length < 4) return null;
  return (x: number) => {
    const L = xs.length - 1;
    if (x <= xs[0]) return rs[0];
    if (x >= xs[L]) return rs[L];
    let lo = 0;
    let hi = L;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m;
      else hi = m;
    }
    const d = xs[hi] - xs[lo];
    return d > 0 ? rs[lo] + ((x - xs[lo]) / d) * (rs[hi] - rs[lo]) : rs[lo];
  };
}

/** Sube o baja una voz entera (de octava en octava), con sus nombres de nota. */
function moveOctave(v: Voice, semis: number) {
  for (const n of v.notes) {
    n.midi += semis;
    if (n.name) n.name = n.name.replace(/-?\d+$/, (d) => String(Number(d) + semis / 12));
  }
}

/**
 * Como `heard`, pero sin contar los instantes en que otra voz canta esa misma nota: eso no dice nada de esta voz
 * (sin esto, una voz que dobla a otra parecería oírse en cualquier octava).
 */
function heardOwn(v: Voice, voices: Voice[], semis: number, tr: number, frames: number[][], fps: number): number {
  const BIN = 0.05;
  const ocupado = new Set<number>();
  for (const o of voices) {
    if (o === v) continue;
    for (const n of o.notes) for (let t = n.start; t < n.start + n.dur; t += BIN) ocupado.add(Math.floor(t / BIN) * 128 + n.midi);
  }
  let on = 0;
  let tot = 0;
  for (const n of v.notes) {
    const midi = n.midi + semis;
    const row = midi + tr - MIDI0;
    if (row < 0 || row >= 88) continue;
    for (let t = n.start + 0.05; t < n.start + n.dur - 0.05; t += 0.05) {
      if (ocupado.has(Math.floor(t / BIN) * 128 + midi)) continue;
      const f = Math.round(t * fps);
      if (f < 0 || f >= frames.length) continue;
      tot++;
      on += frames[f][row];
    }
  }
  return tot >= 20 ? on / tot : 0;
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

/** La nota de `ref` que suena en `t` (o la más cercana, si no hay ninguna justo ahí). */
function refPitchAt(ref: Note[], t: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const n of ref) {
    const d = n.start <= t && n.start + n.dur > t ? 0 : Math.min(Math.abs(n.start - t), Math.abs(n.start + n.dur - t));
    if (d < bestD) {
      bestD = d;
      best = n.midi;
    }
  }
  return bestD <= 0.5 ? best : null;
}

/**
 * Una sola línea con lo que se oye: en cada ataque se queda con una nota, la más cercana a `ref` (la voz de la
 * partitura que le corresponde) o, si no hay referencia, la más fuerte.
 */
function sungLine(clean: RawNote[], ref: Note[] | null): Note[] {
  const ev = [...clean].sort((a, b) => a.start - b.start || b.amp - a.amp);
  const out: Note[] = [];
  let i = 0;
  while (i < ev.length) {
    const group: RawNote[] = [ev[i]];
    let j = i + 1;
    while (j < ev.length && ev[j].start - ev[i].start < 0.06) group.push(ev[j++]);
    i = j;
    const t = group[0].start;
    let pick = group.reduce((a, b) => (b.amp > a.amp ? b : a));
    if (ref) {
      // Con una línea de referencia, solo vale lo que esté cerca de ella: si no, se estaría copiando otra voz.
      const r = refPitchAt(ref, t);
      const near = r == null ? [] : group.filter((g) => Math.abs(g.midi - r) <= ALIGN.sungWindow);
      if (!near.length) continue;
      pick = near.reduce((a, b) => (Math.abs(a.midi - r!) <= Math.abs(b.midi - r!) ? a : b));
    }
    const prev = out[out.length - 1];
    if (prev) {
      if (t <= prev.start + 0.02) continue;
      // Misma nota partida por la respiración del detector: se une.
      if (prev.midi === pick.midi && t - (prev.start + prev.dur) < 0.09) {
        prev.dur = Math.max(prev.dur, t + pick.dur - prev.start);
        continue;
      }
      if (prev.start + prev.dur > t) prev.dur = t - prev.start;
    }
    out.push({ midi: pick.midi, start: t, dur: Math.max(0.08, pick.dur) });
  }
  return out;
}

/** Fracción del tiempo de `ref` en que `line` canta esa misma nota. */
function agreement(line: Note[], ref: Note[]): number {
  let ok = 0;
  let tot = 0;
  for (const n of ref) {
    for (let t = n.start + 0.03; t < n.start + n.dur - 0.03; t += 0.05) {
      tot++;
      const m = line.find((x) => x.start <= t && x.start + x.dur > t);
      if (m && m.midi === n.midi) ok++;
    }
  }
  return tot ? ok / tot : 0;
}

/** Coloca las notas de `score` donde suenan en la grabación `data`. */
export async function alignScoreToAudio(scoreIn: Song, data: ArrayBuffer, title: string, opts: AlignOptions): Promise<AlignResult> {
  const progress = opts.onProgress ?? (() => {});
  // Las voces «🎙» (sacadas de una grabación en una mezcla anterior) no son líneas de la partitura: fuera. Si se pide,
  // se vuelven a sacar de esta grabación. Si no, al volver a mezclar una mezcla entrarían como una voz escrita más.
  const score: Song = { ...scoreIn, voices: scoreIn.voices.filter((v) => !isSung(v)) };
  const all = score.voices.flatMap((v) => v.notes);
  if (!all.length) throw new Error('La partitura no tiene notas.');
  let out: BpOutputs;
  if (opts.outputs) {
    out = opts.outputs.out;
  } else {
    progress('Leyendo el audio…', 0);
    const { samples } = await decodeAudio(data);
    const a = Math.max(0, Math.floor(opts.start * SR));
    const b = opts.end > opts.start ? Math.min(samples.length, Math.floor(opts.end * SR)) : samples.length;
    if (b - a < SR * 2) throw new Error('El tramo elegido es demasiado corto.');
    progress('Escuchando la grabación…', 0.02);
    out = await basicPitchOutputs(samples.subarray(a, b), (p) => progress('Escuchando la grabación…', 0.02 + p * 0.85));
  }
  // El fotograma f es el segundo f / FRAME_RATE del tramo. No vale contar fotogramas y dividir por la duración: con
  // las ventanas de la librería, el reloj del modelo adelantaba y las notas quedaban cada vez más tarde.
  const fps = FRAME_RATE;

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
  const offset = j0 * STEP; // segundos recortados al principio de la grabación

  // Compases de la partitura: los de verdad si se saben (MusicXML y MIDI los traen: anacrusa, cambios de compás o
  // de tempo, 7/8…) o, si no, una rejilla regular desde el principio.
  const barLen = (score.beatsPerBar * 60) / score.bpm;
  const barTimes = (score.barStarts ?? []).filter((t) => t < scoreEnd);
  if (!barTimes.length) for (let t = 0; t < scoreEnd; t += barLen) barTimes.push(t);
  /** Compás (desde 1) en que cae un segundo de la partitura. */
  const barOf = (t: number) => {
    let lo = 0;
    let hi = barTimes.length - 1;
    if (t < barTimes[0]) return 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (barTimes[mid] <= t + 1e-6) lo = mid;
      else hi = mid;
    }
    return (barTimes[hi] <= t + 1e-6 ? hi : lo) + 1;
  };
  // Donde puede empezar o acabar de verdad una pasada: rayas de compás y ataques (las frases que entran en anacrusa).
  const puntos = [...new Set([...barTimes, ...all.map((n) => n.start)])].sort((x, y) => x - y);
  // El camino va de décima en décima: cada borde se lleva a la raya o al ataque que le toca.
  // - Principio: el más cercano entre medio fotograma antes y el final del primer fotograma.
  // - Final: el primero que caiga en el último fotograma o justo después. Si una nota empieza dentro del último
  //   fotograma, es que ahí se paró: si se hubiera cantado, el camino seguiría unos fotogramas más.
  const entre = (a: number, b: number) => puntos.filter((t) => t >= a - 1e-6 && t <= b + 1e-6);
  const inicio = (from: number) => entre(from - STEP / 2, from + STEP).sort((x, y) => Math.abs(x - from) - Math.abs(y - from))[0];
  const fin = (to: number) => entre(to - STEP, to + STEP / 2)[0];
  /** Una pasada: su warp, y las notas que empiezan en [lo, hi) van con ella. */
  type Pasada = { w: Warp; lo: number; hi: number };
  const pasadaDe = (w: Warp): Pasada => {
    const lo = inicio(w.from);
    const hi = fin(w.to);
    // Si el borde no cae en una raya ni en un ataque, lo que vio el DTW: el centro del fotograma.
    return { w, lo: lo ?? w.from - STEP / 2, hi: hi ?? w.to - STEP / 2 };
  };

  // Pasadas por la partitura. Lo normal es una. Con «toda la grabación», la partitura puede cantarse más veces
  // (repeticiones que no están escritas, otra toma…): se busca con saltos y cada pasada coloca su copia de las notas.
  let pasadas: Pasada[] = [{ w: warpFromPath(path), lo: -Infinity, hi: Infinity }];
  if (opts.span === 'audio') {
    const n = S.length;
    const frame = (t: number) => Math.round(t / STEP) - s0;
    const starts = new Uint8Array(n);
    const ends = new Uint8Array(n);
    starts[0] = 1;
    for (const t of barTimes) {
      const b = frame(t);
      if (b > 0 && b < n) {
        starts[b] = 1;
        ends[b - 1] = 1;
      }
    }
    for (const nt of all) {
      const a = frame(nt.start);
      if (a >= 0 && a < n) starts[a] = 1;
    }
    // Lo que cuesta de media un fotograma cantado de esta grabación, con el mejor emparejamiento de la partitura entera.
    const cantados = path.filter(([, j]) => A[j].some((x) => x > 0));
    const tipico = cantados.length ? cantados.reduce((acc, [i, j]) => acc + cost(S[i - s0], A[j]), 0) / cantados.length : 0;
    const fuera = Math.min(ALIGN.skipMax, Math.max(ALIGN.skip, tipico + ALIGN.skipMargin));
    const conSaltos = dtwJumps(S, A, starts, ends, fuera).map(([i, j]) => [i + s0, j] as [number, number]);
    // Cada pasada se recorta por los extremos donde la partitura calla (el silencio entre tomas) y donde el camino
    // sube recto (la partitura avanza sin que avance la grabación: lo que no se llegó a cantar al cortar).
    const suena = (i: number) => S[i - s0]?.some((x) => x > 0) ?? false;
    const recorta = (p: [number, number][]) => {
      let a = 0;
      let b = p.length - 1;
      while (a < b && !suena(p[a][0])) a++;
      while (b > a && !suena(p[b][0])) b--;
      // Al principio, un solo paso recto es que la toma va más deprisa que la partitura (el camino va de décima en
      // décima) y la primera nota sí se canta; si se quitara, la pasada empezaría una décima tarde y la perdería.
      let r = a;
      while (r < b && p[r + 1][1] === p[r][1]) r++;
      if (r - a > 1) a = r;
      while (b > a && p[b - 1][1] === p[b][1]) b--;
      return p.slice(a, b + 1);
    };
    const media = (p: [number, number][]) => p.reduce((acc, [i, j]) => acc + cost(S[i - s0], A[j]), 0) / p.length;
    const largo = (p: [number, number][]) => (p[p.length - 1][0] - p[0][0] + 1) * STEP; // segundos de partitura
    const tramos = splitPasses(conSaltos)
      .map(recorta)
      .filter((p) => p.length > 1);
    if (tramos.length) {
      const principal = media(tramos.reduce((x, p) => (largo(p) > largo(x) ? p : x)));
      // Solo valen las que abarcan casi un compás de partitura y se parecen casi tanto como la principal: lo demás
      // era el diapasón, charla o una introducción que no está escrita.
      const buenas = tramos.filter((p) => largo(p) >= Math.min(barLen * 0.9, 4) && media(p) <= principal + ALIGN.passCost);
      if (buenas.length) pasadas = buenas.map((p) => pasadaDe(warpFromPath(p)));
    }
  }
  pasadas.sort((x, y) => x.w.f(x.w.from) - y.w.f(y.w.from));
  const multi = pasadas.length > 1;
  // La anacrusa del principio: si una pasada entra en la partitura menos de un compás después de su primera nota, esas
  // primeras notas sí se cantan, pero el DTW no las ha reconocido (van flojas, arrastradas o algo desafinadas: en «La
  // vida es una copa de licor», «A cer-» se oye como Fa♯ y Sol, y la mezcla empezaba en «-quen»). Se añaden con el
  // tempo de la pasada si caben antes de ella sin pisar la anterior y si ahí suena algo (no en un silencio).
  const primera = Math.min(...all.map((n) => n.start));
  pasadas = pasadas.map((p, k) => {
    const ini = Math.max(p.lo, p.w.from);
    if (!(ini - primera > 1e-3 && ini - primera <= barLen + 1e-6)) return p;
    const a = p.w.f(primera) + offset;
    const b = p.w.f(ini) + offset;
    const prev = pasadas[k - 1];
    const libre = prev ? prev.w.f(Math.min(prev.hi, prev.w.to)) + offset + 0.1 : 0;
    if (a < libre) return p;
    let suena = false;
    for (let q = Math.max(0, Math.floor(a / STEP)); q <= Math.floor(b / STEP) && !suena; q++) suena = (energy[q] ?? 0) >= 0.3;
    return suena ? { w: { ...p.w, from: primera }, lo: Number.isFinite(p.lo) ? primera : p.lo, hi: p.hi } : p;
  });
  const larga = pasadas.reduce((a, p) => (p.w.to - p.w.from > a.w.to - a.w.from ? p : a)); // la más larga
  const warp = larga.w;
  const toAudio = (t: number) => warp.f(t) + offset;

  progress('Colocando las notas…', 0.96);
  // Qué notas van con cada pasada: con una sola, las que caen en el tramo emparejado (con `score`, todas); con
  // varias, las que empiezan en su [lo, hi), y además las que siguen sonando al empezarla (ligadas sobre la barra).
  const whole = opts.span === 'score';
  // La raya de compás por la que se entra en una pasada: la primera desde su principio (si se entra en anacrusa,
  // la del compás siguiente). Una nota que empezó antes solo se canta en la pasada si la cruza (ligada).
  const rayaDeEntrada = (lo: number) => barTimes.find((t) => t >= lo - 1e-6) ?? Infinity;
  const dentro = (n: Note, p: Pasada) =>
    whole ||
    (multi
      ? (n.start >= p.lo - 1e-3 || n.start + n.dur > rayaDeEntrada(p.lo) + 0.1) && n.start < p.hi - 1e-3
      : n.start + n.dur > p.w.from - 0.05 && n.start < p.w.to + 0.05);
  const song: Song = makeSong({
    title,
    beatsPerBar: score.beatsPerBar,
    keyFifths: score.keyFifths,
    chordsAuto: score.chordsAuto,
  });
  let first = Infinity;
  let anclas = 0;
  const lanes = score.voices.map((v) => ({
    v,
    placed: pasadas
      .flatMap((p, pi) =>
        v.notes
          .filter((n) => dentro(n, p))
          .map((n): Placed => {
            const ts = multi ? Math.max(n.start, p.lo) : n.start;
            return { n, s: p.w.f(ts) + offset, e: p.w.f(n.start + n.dur) + offset, p: pi, ts };
          }),
      )
      .sort((x, y) => x.s - y.s),
  }));
  // Afinar con los ataques que se oyen, sin romper la partitura: cada momento en que empieza alguna nota (en cada
  // pasada) es un «golpe», y todas las voces que atacan en él se mueven juntas. Si el ataque se reconoce en alguna
  // (casi siempre la melodía, que es lo que el modelo oye mejor), el golpe va ahí; si no, con la curva de corrección,
  // que es una sola para toda la canción porque el grupo canta junto. Antes se clavaba cada nota en su propio ataque,
  // voz por voz, y las que en la partitura empiezan a la vez quedaban desperdigadas.
  /** Cuánto se ha movido al afinar un segundo cualquiera de la partitura en la pasada `pi` (0 si no se afina). */
  let mueve: (pi: number, ts: number) => number = () => 0;
  if (ALIGN.refine) {
    const candidatos = lanes.map((l) => anchorsOf(l.placed, out, fps, best.tr));
    // Un golpe son las notas de una pasada que en la partitura empiezan a la vez o casi (a menos de 25 ms: un MIDI
    // tocado a mano, un tresillo redondeado a la rejilla del archivo). Se mueven todas lo mismo.
    type Golpe = { p: number; ts: number; s: number; rs: { r: number; w: number }[]; d: number };
    const notas = lanes.flatMap((l, i) => l.placed.map((q, k) => ({ q, c: candidatos[i][k] })));
    notas.sort((a, b) => a.q.p - b.q.p || a.q.ts - b.q.ts);
    const lista: Golpe[] = [];
    const golpeDe = new Map<Placed, Golpe>();
    for (const { q, c } of notas) {
      let g = lista[lista.length - 1];
      if (!g || g.p !== q.p || q.ts - g.ts > 0.025) lista.push((g = { p: q.p, ts: q.ts, s: q.s, rs: [], d: 0 }));
      golpeDe.set(q, g);
      if (c) g.rs.push({ r: c.t - q.s, w: c.w });
    }
    // Si varias voces del golpe dan su ataque, manda el que más claro se oye (la mediana pesada por lo que se fía):
    // la melodía, normalmente. Con la mediana a secas, las voces que apenas se oyen la apartaban de su ataque.
    const pesada = (xs: { r: number; w: number }[]) => {
      const s = [...xs].sort((a, b) => a.r - b.r);
      const total = s.reduce((acc, x) => acc + x.w, 0);
      let acc = 0;
      for (let k = 0; k < s.length; k++) {
        acc += s[k].w;
        if (Math.abs(acc - total / 2) < 1e-9 && k + 1 < s.length) return (s[k].r + s[k + 1].r) / 2;
        if (acc > total / 2) return s[k].r;
      }
      return s[s.length - 1].r;
    };
    // Por el segundo de la grabación (no de la partitura): con varias pasadas, el mismo compás suena varias veces.
    const todas: Anchor[] = lista.filter((g) => g.rs.length).map((g) => ({ x: g.s, r: pesada(g.rs) }));
    anclas = todas.length;
    const corr = buildCorrection(todas);
    const fuerza = (g: Golpe) => g.rs.reduce((acc, x) => acc + x.w, 0);
    const clavado = new Set<Golpe>();
    for (const g of lista) {
      const suave = corr ? corr(g.s) : 0;
      const r = g.rs.length ? pesada(g.rs) : null;
      // Un ataque que se aparta mucho de lo que hace el resto de la canción en ese momento no es de fiar.
      if (r !== null && (!corr || Math.abs(r - suave) < 0.2)) {
        g.d = r;
        clavado.add(g);
      } else g.d = suave;
    }
    // Dos golpes seguidos que se acercan a menos del 40 % de lo que los separa la partitura se están disputando el
    // mismo ataque (uno desde cada lado): se lo queda el que más claro se oye y el otro va con la curva.
    for (let k = 1; k < lista.length; k++) {
      const a = lista[k - 1];
      const b = lista[k];
      if (a.p !== b.p || b.s + b.d - (a.s + a.d) >= 0.4 * (b.s - a.s)) continue;
      const cede = !clavado.has(b) || (clavado.has(a) && fuerza(a) < fuerza(b)) ? a : b;
      if (!clavado.has(cede)) continue;
      cede.d = corr ? corr(cede.s) : 0;
      clavado.delete(cede);
    }
    // Que no se crucen: cada golpe, al menos 30 ms después del anterior de su pasada (o lo que ya los separaba, si era
    // menos: no se separa lo que en la partitura va casi junto).
    for (let k = 1; k < lista.length; k++) {
      const a = lista[k - 1];
      const b = lista[k];
      const hueco = Math.min(0.03, Math.max(0, b.s - a.s));
      if (a.p === b.p && b.s + b.d < a.s + a.d + hueco) b.d = a.s + a.d + hueco - b.s;
    }
    const porPasada = pasadas.map((_, pi) => lista.filter((g) => g.p === pi));
    // Tramos apretados: con notas repetidas el sonido no cambia y el camino las atraviesa de golpe (en «La vida», las
    // cuatro Re del compás 23 quedaban a 50 ms). Si entre golpes queda menos del 40 % de lo que les toca por la
    // partitura, se busca alrededor un tramo con tiempo suficiente y sus golpes se reparten como en la partitura.
    porPasada.forEach((gs, pi) => {
      const w = pasadas[pi].w;
      const ritmo = (w.f(w.to) - w.f(w.from)) / Math.max(1e-6, w.to - w.from); // segundos de grabación por segundo de partitura
      const T = (g: Golpe) => g.s + g.d;
      const toca = (a: Golpe, b: Golpe) => (b.ts - a.ts) * ritmo;
      for (let k = 0; k + 1 < gs.length; k++) {
        if (T(gs[k + 1]) - T(gs[k]) >= 0.4 * toca(gs[k], gs[k + 1])) continue;
        let a = k;
        let b = k + 1;
        while (b + 1 < gs.length && T(gs[b + 1]) - T(gs[b]) < 0.4 * toca(gs[b], gs[b + 1])) b++;
        // Se ensancha hasta que el tramo tiene al menos el 60 % de lo que pide la partitura (como mucho 6 golpes por
        // lado). Un golpe clavado en su ataque hace de borde fijo: se ensancha por el otro lado.
        for (let n = 0; n < 12 && T(gs[b]) - T(gs[a]) < 0.6 * toca(gs[a], gs[b]); n++) {
          const fijoA = a === 0 || clavado.has(gs[a]);
          const fijoB = b + 1 >= gs.length || clavado.has(gs[b]);
          if (fijoA && fijoB && (a === 0 || b + 1 >= gs.length)) break;
          if ((!fijoA || fijoB) && a > 0 && k - a < 6) a--;
          if ((!fijoB || fijoA) && b + 1 < gs.length && b - k < 7) b++;
        }
        if (T(gs[b]) - T(gs[a]) >= 0.6 * toca(gs[a], gs[b])) {
          const ta = T(gs[a]);
          const tb = T(gs[b]);
          for (let q = a + 1; q < b; q++) gs[q].d = ta + ((gs[q].ts - gs[a].ts) / (gs[b].ts - gs[a].ts)) * (tb - ta) - gs[q].s;
        }
        k = b - 1;
      }
    });
    // Cuánto se mueve cualquier segundo de la partitura: lo de su golpe, o entre los dos de alrededor (para los
    // finales de nota que no coinciden con ningún ataque, y para los cifrados).
    mueve = (pi: number, ts: number) => {
      const gs = porPasada[pi];
      if (!gs.length) return 0;
      if (ts <= gs[0].ts) return gs[0].d;
      const L = gs.length - 1;
      if (ts >= gs[L].ts) return gs[L].d;
      let lo = 0;
      let hi = L;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (gs[m].ts <= ts) lo = m;
        else hi = m;
      }
      return gs[lo].d + ((ts - gs[lo].ts) / (gs[hi].ts - gs[lo].ts)) * (gs[hi].d - gs[lo].d);
    };
    for (const l of lanes) {
      for (const q of l.placed) {
        q.s += golpeDe.get(q)!.d;
        q.e += mueve(q.p, q.n.start + q.n.dur);
      }
    }
  }
  song.voices = lanes.map(({ v, placed }) => {
    const notes: Note[] = placed.map((p, k) => {
      const next = placed[k + 1];
      // Si en la partitura la nota enlaza con la siguiente, aquí también; pero no de una pasada a otra: si se paran y
      // siguen, la nota acaba donde se paró, no tapando el silencio hasta que se vuelve a cantar.
      const legato = next && next.p === p.p && Math.abs(p.n.start + p.n.dur - next.n.start) < 1e-3;
      let e = legato ? next.s : p.e;
      if (next && e > next.s) e = next.s;
      const note: Note = { midi: p.n.midi, start: p.s, dur: Math.max(0.06, e - p.s), bar: barOf(p.n.start) };
      if (p.n.name) note.name = p.n.name;
      first = Math.min(first, p.s);
      return note;
    });
    return { ...v, id: uid(), notes };
  });

  // Octava de cada voz: un grupo de voces graves canta a menudo una octava por debajo de lo escrito en clave de sol.
  const mediana = (notes: Note[]) => {
    const m = notes.map((n) => n.midi).sort((a, b) => a - b);
    return m.length ? m[Math.floor(m.length / 2)] : null;
  };
  // El orden de lo colocado tal como está escrito (antes de mover nada).
  const escrito = song.voices.map((v) => mediana(v.notes)).filter((m): m is number => m !== null);
  const descendente = escrito.every((m, k) => k === 0 || m <= escrito[k - 1] + 2);
  const movida = new Map<Voice, number>(); // semitonos que se ha movido cada voz
  for (const v of song.voices) {
    const base = heard(v.notes, best.tr, out.frames, fps);
    let semis = 0;
    for (const o of [-12, 12]) {
      const h = heard(v.notes, best.tr + o, out.frames, fps);
      if (h > 0.2 && h > base * 2 && h > heard(v.notes, best.tr + semis, out.frames, fps)) semis = o;
    }
    if (semis) {
      moveOctave(v, semis);
      movida.set(v, semis);
    }
  }
  // Las partes de la partitura van de aguda a grave. Si al bajar una voz las de debajo se quedan por encima de ella,
  // probablemente también se cantan una octava abajo (p. ej. voces de hombre escritas en clave de sol, de las que
  // solo se distingue bien la melodía). Se bajan, salvo que se oigan claramente donde están: a veces las voces se
  // cruzan de verdad (una contralto por encima de una melodía que canta un hombre).
  if (descendente && [...movida.values()].some((s) => s < 0)) {
    let arriba: number | null = null;
    for (const v of song.voices) {
      const m = mediana(v.notes);
      if (m === null) continue;
      if (arriba !== null && m > arriba + 2 && !movida.has(v)) {
        const aqui = heardOwn(v, song.voices, 0, best.tr, out.frames, fps);
        const abajo = heardOwn(v, song.voices, -12, best.tr, out.frames, fps);
        if (!(aqui > 0.2 && aqui > 2 * abajo)) {
          moveOctave(v, -12);
          movida.set(v, -12);
          arriba = m - 12;
          continue;
        }
      }
      arriba = m;
    }
  }
  const octaves = song.voices.flatMap((v, index) => {
    const semis = movida.get(v) ?? 0;
    return semis ? [{ name: v.name, index, semis }] : [];
  });

  // Tempo: el de la pasada más larga. Y el 0 de la canción: con una pasada, la primera nota (como en la partitura si
  // empezaba con silencio, a escala); con «toda la grabación», una raya de compás de la primera pasada, para que la
  // rejilla, el metrónomo y el ensayo caigan en su sitio sin perder el principio de la grabación (como mucho un compás).
  const span = Math.max(0.5, warp.f(warp.to) - warp.f(warp.from));
  const ratio = (warp.to - warp.from) / span; // > 1: se canta más rápido que la partitura
  song.bpm = Math.max(30, Math.min(260, Math.round(score.bpm * ratio)));
  let shift: number;
  if (opts.span === 'audio') {
    const p0 = pasadas[0];
    const desde = Math.max(p0.lo, p0.w.from);
    const raya = barTimes[barOf(desde) - 1] ?? desde;
    const t0 = p0.w.f(raya) + offset;
    const compas = (song.beatsPerBar * 60) / song.bpm;
    shift = ((t0 % compas) + compas) % compas;
    // Si esa raya cae antes de empezar la grabación (una anacrusa al principio del archivo), el 0 va un compás antes:
    // si no, las primeras notas se quedarían aplastadas en el 0. La grabación espera ese rato antes de sonar.
    if (shift > first + 1e-6) shift -= compas;
  } else {
    const firstScore = Math.min(...score.voices.flatMap((v) => v.notes.filter((n) => dentro(n, pasadas[0])).map((n) => n.start)));
    const lead = Math.max(0, (firstScore - warp.from) / ratio);
    shift = first - lead;
  }
  for (const v of song.voices) for (const n of v.notes) n.start = Math.max(0, n.start - shift);
  song.chords = score.chordsAuto
    ? []
    : pasadas
        .flatMap((p, pi) =>
          score.chords
            .filter((c) => (multi ? c.time >= p.lo - 1e-3 && c.time < p.hi - 1e-3 : c.time >= p.w.from - 0.05 && c.time <= p.w.to + 0.05))
            // Con el mismo afinado que las notas: el cifrado va con las voces que atacan con él.
            .map((c) => ({ ...c, time: Math.max(0, p.w.f(c.time) + offset + mueve(pi, c.time) - shift) })),
        )
        .sort((x, y) => x.time - y.time);
  if (!opts.keepKey && best.tr) transposeSong(song, best.tr);

  // Una voz más con lo que de verdad se canta, y a qué línea de la partitura corresponde.
  let sung: AlignResult['sung'];
  if (opts.addSung) {
    progress('Oyendo cómo se canta…', 0.98);
    await new Promise((r) => setTimeout(r));
    const a0 = Math.min(...pasadas.map((p) => p.w.f(p.w.from))) + offset - 0.3;
    const a1 = Math.max(...pasadas.map((p) => p.w.f(p.w.to))) + offset + 0.3;
    const heardNotes = cleanNotes(await notesFromOutputs(out, 0.5)).filter((n) => n.start + n.dur > a0 && n.start < a1);
    // Las voces de la canción ya están en su tonalidad final: para comparar con el audio hay que
    // devolverlas a la tonalidad en que se canta si se ha dejado la de la partitura.
    const cmp = opts.keepKey ? best.tr : 0;
    const inAudio = (v: Voice) => v.notes.map((n) => ({ midi: n.midi + cmp, start: n.start + shift, dur: n.dur }));
    const rough = sungLine(heardNotes, null);
    let pick: { v: Voice; a: number } | null = null;
    for (const v of song.voices) {
      if (!v.notes.length) continue;
      const a = agreement(rough, inAudio(v));
      if (!pick || a > pick.a) pick = { v, a };
    }
    const ref = pick && pick.a > 0.12 ? inAudio(pick.v) : null;
    const line = ref ? sungLine(heardNotes, ref) : rough;
    if (line.length >= 4) {
      const notes = line.map((n) => ({ midi: n.midi - cmp, start: Math.max(0, n.start - shift), dur: n.dur }));
      // «🎙 Tenor»: la voz Tenor tal como se oye en la grabación (el micro es el mismo que el de la pista).
      const name = ref ? `🎙 ${pick!.v.name}` : '🎙 Grabación';
      const voice = makeVoice(name, song.voices.length, notes);
      voice.sungOf = ref ? pick!.v.id : '';
      const used = new Set(song.voices.map((v) => v.color));
      voice.color = VOICE_COLORS.find((c) => !used.has(c)) ?? '#ffffff';
      const at = ref ? song.voices.indexOf(pick!.v) + 1 : song.voices.length;
      song.voices.splice(at, 0, voice);
      sung = { voice, matches: ref ? pick!.v.name : '', agreement: ref ? agreement(line, ref) : 0 };
    }
  }

  // Vueltas enteras (o tomas): una pasada empieza otra si arranca en el mismo sitio de la partitura que la anterior
  // o antes. Los trozos que se repiten o se saltan dentro de una vuelta no cuentan como otra.
  const laps = pasadas.reduce((k, p, i) => k + (i > 0 && p.lo <= pasadas[i - 1].lo + 0.05 ? 1 : 0), 1);

  if (song.chordsAuto) song.chords = computeChords(song);
  progress('Listo', 1);
  return {
    song,
    transpose: best.tr,
    from: Math.max(0, Math.min(...pasadas.map((p) => Math.max(p.lo, p.w.from)))),
    to: Math.max(...pasadas.map((p) => Math.min(p.hi, p.w.to))),
    audioFrom: opts.start + Math.min(...pasadas.map((p) => p.w.f(p.w.from))) + offset,
    audioTo: opts.start + Math.max(...pasadas.map((p) => p.w.f(p.w.to))) + offset,
    toAudio: (t) => opts.start + toAudio(t),
    passes: pasadas.map((p) => ({
      from: Math.max(p.lo, p.w.from),
      to: Math.min(p.hi, p.w.to),
      audioFrom: opts.start + p.w.f(p.w.from) + offset,
      audioTo: opts.start + p.w.f(p.w.to) + offset,
    })),
    laps,
    audioOffset: opts.start + shift,
    match,
    octaves,
    sung,
    anchors: anclas,
  };
}
