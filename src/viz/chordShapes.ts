// Posiciones de acordes para guitarra y ukelele (calculadas, no de una tabla) y voicing para piano.
import { parseChord, type ParsedChord } from '../ai/harmony';

export type Instrument = 'none' | 'guitar' | 'ukulele' | 'piano';

export const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'guitar', label: 'Guitarra' },
  { id: 'ukulele', label: 'Ukelele' },
  { id: 'piano', label: 'Piano' },
];

/** Cuerdas al aire en MIDI, de la más grave a la más aguda (como se dibujan de izquierda a derecha). */
const TUNINGS: Record<'guitar' | 'ukulele', number[]> = {
  guitar: [40, 45, 50, 55, 59, 64], // Mi La Re Sol Si Mi
  ukulele: [67, 60, 64, 69], // Sol (reentrante) Do Mi La
};

export interface FretShape {
  /** Por cuerda: -1 = no se toca, 0 = al aire, n = traste. */
  frets: number[];
  /** Traste desde el que se dibuja la rejilla (1 = primera posición). */
  base: number;
  /** Traste de la cejilla, si la hay. */
  barre: number | null;
  /** Nota que suena en cada cuerda (MIDI) o null. */
  midi: (number | null)[];
}

const pc = (m: number) => ((m % 12) + 12) % 12;
const cache = new Map<string, FretShape | null>();

/** Busca la posición más cómoda: cubre las notas del acorde, el bajo abajo (en guitarra) y pocos dedos. */
export function fretShape(name: string, instrument: 'guitar' | 'ukulele'): FretShape | null {
  const key = instrument + ':' + name;
  if (cache.has(key)) return cache.get(key)!;
  const ch = parseChord(name);
  const shape = ch ? solve(ch, TUNINGS[instrument], instrument === 'guitar') : null;
  cache.set(key, shape);
  return shape;
}

function solve(ch: ParsedChord, tuning: number[], bassMatters: boolean): FretShape | null {
  const n = tuning.length;
  const required = new Set(ch.pcs);
  // En acordes de 4 notas o más, la quinta se puede omitir.
  const optional = ch.pcs.length >= 4 && ch.fifth !== null ? ch.fifth : -1;
  let best: { frets: number[]; score: number } | null = null;

  for (let base = 0; base <= 9; base++) {
    // Opciones por cuerda: no tocarla, al aire o un traste entre base y base+3 cuya nota sea del acorde.
    const options = tuning.map((open) => {
      const o: number[] = [-1];
      if (required.has(pc(open))) o.push(0);
      for (let f = Math.max(1, base); f <= base + 3; f++) if (required.has(pc(open + f))) o.push(f);
      return o;
    });
    const cur: number[] = new Array(n).fill(-1);
    const rec = (s: number) => {
      if (s === n) {
        const score = evaluate(cur, ch, tuning, bassMatters, required, optional);
        if (score !== null && (!best || score < best.score)) best = { frets: [...cur], score };
        return;
      }
      for (const f of options[s]) {
        cur[s] = f;
        rec(s + 1);
      }
    };
    rec(0);
  }
  if (!best) return null;
  const frets = (best as { frets: number[] }).frets;
  const fretted = frets.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const base = maxF <= 4 ? 1 : minF;
  // Cejilla: el traste más bajo pisado en 3 cuerdas o más, sin cuerdas al aire por medio.
  let barre: number | null = null;
  if (minF > 0 && frets.filter((f) => f === minF).length >= 3) {
    const first = frets.findIndex((f) => f === minF);
    const span = frets.slice(first);
    if (span.every((f) => f === -1 || f >= minF) && !span.includes(0)) barre = minF;
  }
  return { frets, base, barre, midi: frets.map((f, i) => (f < 0 ? null : tuning[i] + f)) };
}

function evaluate(
  frets: number[],
  ch: ParsedChord,
  tuning: number[],
  bassMatters: boolean,
  required: Set<number>,
  optional: number,
): number | null {
  const played = frets.map((f, i) => (f < 0 ? null : tuning[i] + f));
  const sounding = played.filter((m): m is number => m !== null);
  // En guitarra, al menos 4 cuerdas (un acorde de 3 suena pobre); en ukelele, 3.
  if (sounding.length < (bassMatters ? 4 : 3)) return null;
  const covered = new Set(sounding.map(pc));
  for (const p of required) if (p !== optional && !covered.has(p)) return null;
  // Las cuerdas que no se tocan, solo por el lado grave (no en medio).
  const firstPlayed = frets.findIndex((f) => f >= 0);
  if (frets.slice(firstPlayed).some((f) => f < 0)) return null;
  if (bassMatters && pc(sounding[0]) !== ch.bass) return null;
  const fretted = frets.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;
  // Dedos: con cejilla en el traste más bajo cuenta como uno, pero una cejilla no puede dejar cuerdas al aire debajo.
  const firstBarre = frets.findIndex((f) => f === minF);
  const barrePossible =
    minF > 0 && frets.filter((f) => f === minF).length >= 2 && !frets.slice(firstBarre).some((f) => f === 0);
  const fingers = barrePossible ? 1 + fretted.filter((f) => f !== minF).length : fretted.length;
  if (fingers > 4) return null;
  const opens = frets.filter((f) => f === 0).length;
  let score = 0;
  // Cuerdas sin tocar: en guitarra es normal no tocar las graves; en ukelele se rasguean las cuatro.
  score += frets.filter((f) => f < 0).length * (bassMatters ? 1.0 : 4);
  score += fingers * 0.8;
  score += (maxF - minF) * 1.2; // estiramiento de la mano
  score += minF * 0.5; // posiciones altas
  score -= opens * 0.4; // cuerdas al aire, más fácil…
  // …pero no mezcladas con trastes altos (en ukelele, al aire con el traste 4 es lo normal).
  if (opens && maxF > 4) score += 3;
  else if (opens && maxF === 4 && bassMatters) score += 1.5;
  // Cuerda al aire entre dos pisadas: algo menos natural cuanto más altas son.
  for (let i = 1; i < frets.length - 1; i++) {
    if (frets[i] !== 0) continue;
    const before = frets.slice(0, i).some((f) => f > 0);
    const after = frets.slice(i + 1).some((f) => f > 0);
    if (before && after) score += maxF >= 4 ? 1.5 : maxF >= 3 ? 0.6 : 0;
  }
  if (!covered.has(optional) && optional >= 0) score += 1;
  return score;
}

/** Notas del acorde para el teclado: posición fundamental a partir de Do4 (o el bajo indicado debajo). */
export function pianoVoicing(name: string): number[] | null {
  const ch = parseChord(name);
  if (!ch) return null;
  const rootMidi = 60 + ch.root;
  const notes: number[] = [];
  // Tónica, tercera, quinta… en el orden de tonal, siempre subiendo.
  let last = rootMidi - 1;
  const order = [ch.root, ...ch.pcs.filter((p) => p !== ch.root && p !== (ch.bass !== ch.root ? ch.bass : -1))];
  for (const p of order) {
    let m = last + 1;
    while (pc(m) !== p) m++;
    notes.push(m);
    last = m;
  }
  if (ch.bass !== ch.root) {
    let b = rootMidi - 1;
    while (pc(b) !== ch.bass) b--;
    notes.unshift(b);
  }
  return notes;
}
