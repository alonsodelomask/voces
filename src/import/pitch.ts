// La altura de una sola voz, momento a momento (YIN, de Cheveigné y Kawahara, 2002): cuando en la grabación se oye a
// una persona sola, esto la sigue mucho mejor que Basic Pitch, que busca notas sueltas entre varias voces o
// instrumentos y solo apunta las que ve empezar con claridad (se le escapan las suaves, las ligadas y las que llegan
// con portamento). Con la partitura al lado se corrigen los saltos de octava, que son el fallo típico de YIN.
import type { Note } from '../model';

/** La altura de cada momento: `midi[i]` (con decimales) es la del segundo `t0 + i·hop`; NaN si no se canta. */
export interface PitchTrack {
  t0: number;
  hop: number;
  midi: Float32Array;
}

/** Ajustes (se pueden cambiar en las pruebas). */
export const PITCH = {
  /** Cuánto se busca alrededor de la nota que da la partitura, en semitonos. */
  ventana: 4,
  /** Lo más grave y lo más agudo que se busca, en Hz (de un bajo a una soprano). */
  fmin: 60,
  fmax: 1100,
  /** Un momento es cantado si la diferencia normalizada de YIN baja de esto (0: periódico del todo). */
  umbral: 0.5,
  /** Y si suena a menos de tantos decibelios por debajo de lo fuerte de la toma (respiraciones y ruido, fuera). */
  db: 45,
  /** Hasta dónde se aparta la altura de su nota antes de cambiar de nota, en semitonos (con vibrato no salta). */
  histeresis: 0.9,
  /** Hasta cuánto puede ir alta o baja una nota (en semitonos) y seguir siendo la que da la partitura. */
  tolerancia: 0.7,
  /** Lo más corto que vale como nota (lo demás es el paso de una a otra), y el hueco que se salta dentro de una. */
  minNota: 0.07,
  hueco: 0.12,
};

/**
 * Sigue la altura de `samples` (mono, a `sr` Hz) entre los segundos `desde` y `hasta`, cada 10 ms. Para ir más rápido
 * escucha a menos frecuencia (una voz no pasa de unos 1100 Hz). `esperada`: la nota que da la partitura en cada segundo
 * (con decimales vale igual), o null donde no da ninguna.
 */
export function trackPitch(
  samples: Float32Array,
  sr: number,
  desde = 0,
  hasta = samples.length / sr,
  esperada?: (t: number) => number | null,
): PitchTrack {
  const d = sr >= 32000 ? 4 : sr >= 16000 ? 2 : 1;
  const s2 = sr / d;
  const a = Math.max(0, Math.floor(desde * sr));
  const b = Math.min(samples.length, Math.ceil(hasta * sr));
  // Media de cada `d` muestras: quita lo agudo que se doblaría al bajar la frecuencia.
  const x = new Float32Array(Math.max(0, Math.floor((b - a) / d)));
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += samples[a + i * d + k];
    x[i] = s / d;
  }
  const hop = Math.round(s2 * 0.01);
  const tauMin = Math.max(2, Math.floor(s2 / PITCH.fmax));
  const tauMax = Math.ceil(s2 / PITCH.fmin);
  const W = tauMax + 1; // la ventana cubre al menos un periodo del más grave
  const n = Math.max(0, Math.floor((x.length - W - tauMax) / hop) + 1);
  const midi = new Float32Array(n).fill(NaN);
  const rms = new Float32Array(n);
  const dif = new Float64Array(tauMax + 1);
  const hopS = hop / s2;
  const t0 = a / sr + W / 2 / s2;
  // ¿Son el mismo canto dos periodos (uno múltiplo del otro: octava, octava y quinta, dos octavas)?
  const cerca = (p: number, q: number) => [1, 2, 3, 4].some((k) => Math.abs(p - k * q) <= 1 || Math.abs(q - k * p) <= 1);
  for (let f = 0; f < n; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < W; i++) e += x[o + i] * x[o + i];
    rms[f] = Math.sqrt(e / W);
    if (e === 0) continue;
    // Diferencia normalizada (CMNDF): el primer mínimo claro es el periodo.
    let suma = 0;
    for (let t = 1; t <= tauMax; t++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const q = x[o + i] - x[o + i + t];
        s += q * q;
      }
      suma += s;
      dif[t] = suma > 0 ? (s * t) / suma : 1;
    }
    // Sin partitura, el primer mínimo claro (YIN). Con ella, el más hondo cerca de la nota que toca: así no se cuela
    // la octava de abajo ni otros submúltiplos. Solo se aparta de esa nota si allí se oye otra cosa con mucha claridad.
    let tau = primerMinimo(dif, tauMin, tauMax);
    const r = esperada?.(t0 + f * hopS);
    if (r != null) {
      const lo = Math.max(tauMin, Math.floor(s2 / (440 * 2 ** ((r + PITCH.ventana - 69) / 12))));
      const hi = Math.min(tauMax, Math.ceil(s2 / (440 * 2 ** ((r - PITCH.ventana - 69) / 12))));
      let tw = lo;
      for (let t = lo; t <= hi; t++) if (dif[t] < dif[tw]) tw = t;
      const claro = dif[tau] < 0.08 && dif[tw] > 2 * dif[tau] + 0.05;
      if (!claro || cerca(tau, tw)) tau = tw;
    }
    if (dif[tau] > PITCH.umbral) continue;
    // Interpolación parabólica: el periodo con decimales.
    let p = tau;
    if (tau > tauMin && tau < tauMax) {
      const y0 = dif[tau - 1];
      const y1 = dif[tau];
      const y2 = dif[tau + 1];
      const den = y0 - 2 * y1 + y2;
      if (den > 0) p = tau + (0.5 * (y0 - y2)) / den;
    }
    midi[f] = 69 + 12 * Math.log2(s2 / p / 440);
  }
  // Lo muy flojo (respiraciones, ruido de la sala) no es canto.
  const fuertes = Array.from(rms).filter((r, i) => r > 0 && !Number.isNaN(midi[i])).sort((p, q) => p - q);
  if (fuertes.length) {
    const ref = fuertes[Math.floor(fuertes.length * 0.95)];
    const suelo = ref * 10 ** (-PITCH.db / 20);
    for (let f = 0; f < n; f++) if (rms[f] < suelo) midi[f] = NaN;
  }
  return { t0, hop: hopS, midi };
}

/** El periodo de YIN: el primer mínimo que baja de 0,15 (o el más hondo, si ninguno baja). */
function primerMinimo(dif: Float64Array, tauMin: number, tauMax: number): number {
  let mejor = tauMin;
  for (let t = tauMin; t <= tauMax; t++) {
    if (dif[t] < 0.15) {
      while (t + 1 <= tauMax && dif[t + 1] < dif[t]) t++;
      return t;
    }
    if (dif[t] < dif[mejor]) mejor = t;
  }
  return mejor;
}

/**
 * Las notas que se cantan en `track`. Con `esperada` (la altura que da la partitura en cada segundo, o null si allí no
 * hay nada), cada momento se pone en la octava más cercana a ella: YIN a veces oye la de arriba o la de abajo.
 */
export function notesFromPitch(track: PitchTrack, esperada?: (t: number) => number | null): Note[] {
  const { midi, t0, hop } = track;
  const n = midi.length;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = midi[i];
    if (!Number.isNaN(v) && esperada) {
      const r = esperada(t0 + i * hop);
      if (r != null) {
        while (v - r > 6) v -= 12;
        while (r - v > 6) v += 12;
        // Cerca de la nota que toca, es esa (afinación, vibrato): así las notas se separan donde cambia la partitura
        // aunque se cante un poco alto o bajo.
        if (Math.abs(v - r) <= PITCH.tolerancia) v = r;
      }
    }
    m[i] = v;
  }
  // Mediana de 5: quita los saltos sueltos (una consonante, un armónico).
  const lisa = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(m[i])) continue;
    const w: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (!Number.isNaN(m[k])) w.push(m[k]);
    w.sort((p, q) => p - q);
    lisa[i] = w[w.length >> 1];
  }
  // Una nota sigue mientras la altura no se aparte de ella más que la histéresis; los huecos cortos no la cortan.
  // La nota es la mediana de lo cantado en ella: la entrada (desde abajo, con portamento) no cuenta más que el resto.
  const notas: Note[] = [];
  let cur: { midi: number; a: number; b: number; vals: number[]; suma: number } | null = null;
  const cierra = () => {
    if (cur && cur.b - cur.a >= PITCH.minNota) {
      const v = [...cur.vals].sort((p, q) => p - q);
      const med = v[v.length >> 1];
      // Un poco alta o baja (hasta `tolerancia`) sigue siendo la nota que toca: es afinación, no otra nota.
      const r = esperada?.((cur.a + cur.b) / 2);
      notas.push({ midi: r != null && Math.abs(med - r) <= PITCH.tolerancia ? r : Math.round(med), start: cur.a, dur: cur.b - cur.a });
    }
    cur = null;
  };
  for (let i = 0; i < n; i++) {
    const t = t0 + i * hop;
    const v = lisa[i];
    if (Number.isNaN(v)) {
      if (cur && t - cur.b > PITCH.hueco) cierra();
      continue;
    }
    if (cur && Math.abs(v - cur.midi) <= PITCH.histeresis && t - cur.b <= PITCH.hueco) {
      cur.b = t + hop;
      cur.vals.push(v);
      // La nota es la media de lo cantado hasta ahora: si empezó en el portamento desde la anterior, se va a su sitio.
      cur.suma += v;
      cur.midi = Math.round(cur.suma / cur.vals.length);
      continue;
    }
    cierra();
    cur = { midi: Math.round(v), a: t, b: t + hop, vals: [v], suma: v };
  }
  cierra();
  // Juntas: la misma nota partida por un hueco corto, y lo cantado de seguido, sin hueco entre una nota y la siguiente.
  const out: Note[] = [];
  for (const x of notas) {
    const prev = out[out.length - 1];
    const gap = prev ? x.start - (prev.start + prev.dur) : Infinity;
    if (prev && prev.midi === x.midi && gap <= PITCH.hueco) {
      prev.dur = x.start + x.dur - prev.start;
      continue;
    }
    if (prev && gap <= PITCH.hueco) prev.dur = x.start - prev.start;
    out.push({ ...x });
  }
  return out.filter((x) => x.dur >= 0.08);
}

/**
 * La nota que da `ref` en cada segundo: la que suena entonces o, si calla, la más cercana (hasta medio segundo antes o
 * después); null si no hay ninguna tan cerca.
 */
export function expectedPitch(ref: Note[]): (t: number) => number | null {
  const notas = [...ref].sort((a, b) => a.start - b.start);
  const fin = notas.map((n) => n.start + n.dur);
  return (t) => {
    // La última que empieza antes de t, y sus vecinas.
    let lo = 0;
    let hi = notas.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (notas[m].start <= t) lo = m;
      else hi = m - 1;
    }
    let best: number | null = null;
    let bestD = 0.5;
    for (let k = Math.max(0, lo - 8); k <= Math.min(notas.length - 1, lo + 1); k++) {
      const d = notas[k].start <= t && fin[k] > t ? 0 : Math.min(Math.abs(notas[k].start - t), Math.abs(fin[k] - t));
      if (d < bestD || (d === 0 && bestD !== 0)) {
        bestD = d;
        best = notas[k].midi;
      }
    }
    return best;
  };
}
