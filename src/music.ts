import { Chord, Note as TNote } from 'tonal';
import type { ChordMark, Note, Song } from './model';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number, keyFifths = 0): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return (keyFifths < 0 ? FLAT_NAMES : SHARP_NAMES)[pc] + octave;
}

export function noteLabel(n: Note, keyFifths = 0): string {
  return prettyAccidentals(n.name ?? midiToName(n.midi, keyFifths));
}

export function prettyAccidentals(s: string): string {
  return s.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
}

/** Convierte un nombre tipo "F#4" a número MIDI. */
export function nameToMidi(name: string): number {
  const m = TNote.midi(name);
  if (m == null) throw new Error('Nota no válida: ' + name);
  return m;
}

function pitchClassName(n: Note, keyFifths: number): string {
  if (n.name) return n.name.replace(/-?\d+$/, '');
  const pc = ((n.midi % 12) + 12) % 12;
  return (keyFifths < 0 ? FLAT_NAMES : SHARP_NAMES)[pc];
}

// Tipos de acorde "normales": se prefieren sobre interpretaciones raras.
const COMMON = /^(M|m|7|maj7|m7|dim|dim7|aug|sus4|sus2|6|m6|9|m9|add9|madd9|m7b5|7sus4|5|maj9|11|13)$/;

function cleanChordName(name: string): string {
  // tonal escribe el mayor como "DM": lo dejamos en "D".
  return name.replace(/^([A-G][#b]*)M(?=\/|$)/, '$1');
}

/** Detecta el nombre de un acorde a partir de notas que suenan a la vez (bajo primero). */
export function detectChord(notes: Note[], keyFifths: number): string | null {
  if (notes.length < 2) return null;
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const pcs: string[] = [];
  for (const n of sorted) {
    const p = pitchClassName(n, keyFifths);
    if (!pcs.some((q) => TNote.chroma(q) === TNote.chroma(p))) pcs.push(p);
  }
  // Con dos notas distintas no hay acorde claro.
  if (pcs.length < 3) return null;
  const cands = Chord.detect(pcs);
  if (!cands.length) return null;
  const score = (c: string) => {
    const [main] = c.split('/');
    const type = main.replace(/^[A-G][#b]*/, '');
    let s = 0;
    if (COMMON.test(type)) s += 10;
    if (c.includes('/')) s -= 1;
    return s;
  };
  const best = [...cands].sort((a, b) => score(b) - score(a))[0];
  // Sin la nota del bajo (p. ej. "C#m/E" → "C#m"): en grupos vocales la voz grave no siempre es el bajo.
  return prettyAccidentals(cleanChordName(best.split('/')[0]));
}

/** Calcula las marcas de acorde a partir de las notas de todas las voces. */
export function computeChords(song: Song): ChordMark[] {
  const all: Note[] = [];
  for (const v of song.voices) for (const n of v.notes) all.push(n);
  if (!all.length) return [];
  const times = [...new Set(all.map((n) => Math.round(n.start * 1000) / 1000))].sort((a, b) => a - b);
  // 1) Acorde detectado en cada ataque.
  const raw: ChordMark[] = [];
  for (const t of times) {
    const sounding = all.filter((n) => n.start <= t + 0.001 && n.start + n.dur > t + 0.01);
    const name = detectChord(sounding, song.keyFifths);
    if (name && name !== raw[raw.length - 1]?.name) raw.push({ time: t, name });
  }
  // 2) Quita acordes de paso (más cortos que ~un pulso) y une repetidos.
  const minDur = Math.max(0.3, (60 / (song.bpm || 100)) * 0.9);
  const end = Math.max(...all.map((n) => n.start + n.dur));
  const marks: ChordMark[] = [];
  raw.forEach((c, i) => {
    const next = raw[i + 1]?.time ?? end;
    if (next - c.time < minDur) return;
    if (marks[marks.length - 1]?.name === c.name) return;
    marks.push(c);
  });
  return marks;
}

/**
 * Reparte notas que pueden solaparse en "carriles" monofónicos (líneas melódicas),
 * intentando que cada carril siga la nota más cercana en altura.
 */
export function splitIntoLanes(notes: Note[]): Note[][] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.midi - a.midi);
  const lanes: Note[][] = [];
  let i = 0;
  while (i < sorted.length) {
    // Agrupa los ataques simultáneos.
    const group: Note[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].start - sorted[i].start < 0.02) group.push(sorted[j++]);
    i = j;
    const start = group[0].start;
    const free = lanes.filter((l) => {
      const last = l[l.length - 1];
      return last.start + last.dur <= start + 0.06;
    });
    for (const n of group) {
      let best = -1;
      let bestDist = Infinity;
      free.forEach((l, k) => {
        const d = Math.abs(l[l.length - 1].midi - n.midi);
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      });
      if (best >= 0) {
        const lane = free[best];
        const last = lane[lane.length - 1];
        if (last.start + last.dur > n.start) last.dur = Math.max(0.01, n.start - last.start);
        lane.push(n);
        free.splice(best, 1);
      } else {
        lanes.push([n]);
      }
    }
  }
  return lanes;
}

/** Mantiene una voz monofónica: recorta/elimina notas que se solapan con `added`. */
export function insertMonophonic(notes: Note[], added: Note): Note[] {
  const end = added.start + added.dur;
  const out: Note[] = [];
  for (const n of notes) {
    if (n === added) continue;
    const nEnd = n.start + n.dur;
    if (nEnd <= added.start + 1e-6 || n.start >= end - 1e-6) {
      out.push(n);
    } else if (n.start < added.start - 1e-6) {
      out.push({ ...n, dur: added.start - n.start });
    }
    // Las notas que empiezan dentro de la nueva se eliminan.
  }
  out.push(added);
  out.sort((a, b) => a.start - b.start);
  return out;
}
