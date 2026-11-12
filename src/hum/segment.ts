import type { Note } from '../model';

/** Una lectura de tono: tiempo de canción (s) y altura en MIDI fraccionario (null = silencio). */
export interface PitchFrame {
  t: number;
  midi: number | null;
}

export interface SegmentOptions {
  /** Duración mínima de una nota, en segundos. */
  minNote?: number;
  /** Silencio que corta una nota, en segundos. */
  gap?: number;
  /** Cambio de altura (semitonos) que separa dos notas. */
  jump?: number;
  /** Rejilla en segundos (0 = sin ajustar). */
  grid?: number;
  /** Transposición de octavas para cantantes graves/agudos (lo decide quien llama). */
  octaveShift?: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Convierte la curva de tono de un tarareo en notas: suaviza, corta por silencios
 * o saltos de altura estables, redondea al semitono y ajusta a la rejilla.
 */
export function segmentPitch(frames: PitchFrame[], opts: SegmentOptions = {}): Note[] {
  const minNote = opts.minNote ?? 0.09;
  const gap = opts.gap ?? 0.07;
  const jump = opts.jump ?? 0.75;
  if (frames.length < 3) return [];

  // Filtro de mediana (5) para quitar saltos de octava sueltos y ruido.
  const sm: PitchFrame[] = frames.map((f, i) => {
    if (f.midi === null) return f;
    const win: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(frames.length - 1, i + 2); k++) {
      const m = frames[k].midi;
      if (m !== null) win.push(m);
    }
    return { t: f.t, midi: win.length >= 3 ? median(win) : f.midi };
  });

  interface Seg {
    start: number;
    end: number;
    pitches: number[];
  }
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  let lastVoiced = -Infinity;
  let deviate: { start: number; pitches: number[] } | null = null;
  const frameDt = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 0.015;

  const close = (end: number) => {
    if (cur) {
      cur.end = end;
      segs.push(cur);
    }
    cur = null;
    deviate = null;
  };

  for (const f of sm) {
    if (f.midi === null) {
      if (cur && f.t - lastVoiced > gap) close(lastVoiced + frameDt);
      continue;
    }
    lastVoiced = f.t;
    if (!cur) {
      cur = { start: f.t, end: f.t, pitches: [f.midi] };
      continue;
    }
    const c: Seg = cur;
    const ref = median(c.pitches.slice(-8));
    if (Math.abs(f.midi - ref) > jump) {
      // Solo se corta si la nueva altura se mantiene unos fotogramas (evita vibrato y glissandi).
      if (!deviate) deviate = { start: f.t, pitches: [] };
      deviate.pitches.push(f.midi);
      const stable = deviate.pitches.length >= 4 && Math.max(...deviate.pitches.slice(-4)) - Math.min(...deviate.pitches.slice(-4)) < jump;
      if (stable) {
        const d = deviate;
        c.end = d.start;
        segs.push(c);
        cur = { start: d.start, end: f.t, pitches: [...d.pitches] };
        deviate = null;
      }
    } else {
      deviate = null;
      c.pitches.push(f.midi);
    }
  }
  close(lastVoiced + frameDt);

  const shift = (opts.octaveShift ?? 0) * 12;
  let notes: Note[] = segs
    .filter((s) => s.end - s.start >= minNote && s.pitches.length >= 3)
    .map((s) => {
      // Ignora el primer 25 % (ataque/portamento) para decidir la altura.
      const body = s.pitches.slice(Math.floor(s.pitches.length * 0.25));
      return { midi: Math.round(median(body)) + shift, start: s.start, dur: s.end - s.start };
    });

  // Une notas consecutivas iguales separadas por un hueco mínimo (respiraciones del detector).
  const merged: Note[] = [];
  for (const n of notes) {
    const p = merged[merged.length - 1];
    if (p && p.midi === n.midi && n.start - (p.start + p.dur) < 0.05) p.dur = n.start + n.dur - p.start;
    else merged.push({ ...n });
  }
  notes = merged;

  if (opts.grid && opts.grid > 0) notes = quantize(notes, opts.grid);
  return notes;
}

/** Ajusta inicio y final a la rejilla y evita solapes. */
export function quantize(notes: Note[], grid: number): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    const s = Math.max(0, Math.round(n.start / grid) * grid);
    let e = Math.round((n.start + n.dur) / grid) * grid;
    if (e <= s) e = s + grid;
    const prev = out[out.length - 1];
    if (prev) {
      if (s < prev.start + prev.dur) {
        if (s <= prev.start) {
          // Cae en la misma casilla: se queda la más larga.
          if (e - s > prev.dur) out[out.length - 1] = { midi: n.midi, start: prev.start, dur: e - prev.start };
          continue;
        }
        prev.dur = s - prev.start;
      }
    }
    out.push({ midi: n.midi, start: s, dur: e - s });
  }
  return out;
}
