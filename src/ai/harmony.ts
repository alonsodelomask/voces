// Asistente musical basado en reglas: revisión de voces, propuesta de acordes y armonización.
import { Chord, Note as TNote } from 'tonal';
import { makeVoice, VOICE_COLORS, type ChordMark, type Note, type Song, type Voice } from '../model';
import { midiToName, plainAccidentals, prettyAccidentals } from '../music';

// ---------------- Utilidades ----------------

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const pcOf = (m: number) => ((m % 12) + 12) % 12;
const pcName = (pc: number, fifths: number) => (fifths < 0 ? FLAT : SHARP)[pcOf(pc)];

export interface ParsedChord {
  root: number;
  pcs: number[];
  bass: number;
  third: number | null;
  fifth: number | null;
}

export function parseChord(name: string): ParsedChord | null {
  const plain = plainAccidentals(name).replace(/^([A-G][#b]*)(?=\/|$)/, '$1M');
  const c = Chord.get(plain);
  if (c.empty || !c.tonic) return null;
  const root = TNote.chroma(c.tonic)!;
  const pcs = c.notes.map((n) => TNote.chroma(n)!).filter((x) => typeof x === 'number');
  const bass = c.bass ? TNote.chroma(c.bass)! : root;
  if (!pcs.includes(bass)) pcs.push(bass);
  const third = pcs.find((p) => [3, 4].includes(pcOf(p - root))) ?? null;
  const fifth = pcs.find((p) => [6, 7, 8].includes(pcOf(p - root))) ?? null;
  return { root, pcs, bass, third, fifth };
}

function noteAt(v: Voice, t: number): Note | null {
  for (const n of v.notes) {
    if (n.start <= t + 1e-6 && n.start + n.dur > t + 1e-6) return n;
    if (n.start > t) break;
  }
  return null;
}

function chordAt(chords: ChordMark[], t: number): ChordMark | null {
  let c: ChordMark | null = null;
  for (const x of chords) if (x.time <= t + 1e-6) c = x;
  return c;
}

function fmtT(t: number) {
  return `${Math.floor(t / 60)}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;
}

// ---------------- 1. Revisión de voces ----------------

export interface Issue {
  time: number;
  level: 'aviso' | 'idea';
  text: string;
}

const INTERVAL_NAMES: Record<number, string> = { 0: 'octavas', 7: 'quintas' };

export function analyzeSong(song: Song): Issue[] {
  const issues: Issue[] = [];
  const voices = song.voices.filter((v) => v.notes.length);
  const spb = 60 / song.bpm;
  const onsets = [...new Set(voices.flatMap((v) => v.notes.map((n) => Math.round(n.start * 1000) / 1000)))].sort((a, b) => a - b);

  // Rango y saltos de cada voz.
  for (const v of voices) {
    const lo = Math.min(...v.notes.map((n) => n.midi));
    const hi = Math.max(...v.notes.map((n) => n.midi));
    if (hi - lo > 19) issues.push({ time: v.notes[0].start, level: 'aviso', text: `«${v.name}» abarca ${hi - lo} semitonos (${midiToName(lo)}–${midiToName(hi)}): es un registro muy amplio para una sola persona.` });
    if (lo < 40) issues.push({ time: v.notes.find((n) => n.midi === lo)!.start, level: 'aviso', text: `«${v.name}» baja hasta ${midiToName(lo)}, muy grave para casi cualquier voz.` });
    if (hi > 81) issues.push({ time: v.notes.find((n) => n.midi === hi)!.start, level: 'aviso', text: `«${v.name}» sube hasta ${midiToName(hi)}, muy agudo.` });
    let leaps = 0;
    for (let i = 1; i < v.notes.length && leaps < 4; i++) {
      const a = v.notes[i - 1];
      const b = v.notes[i];
      const jump = Math.abs(b.midi - a.midi);
      if (jump > 9 && b.start - (a.start + a.dur) < spb) {
        leaps++;
        issues.push({ time: b.start, level: 'idea', text: `Salto de ${jump} semitonos en «${v.name}» (${midiToName(a.midi)} → ${midiToName(b.midi)}): difícil de afinar; prueba una nota más cercana del acorde.` });
      }
    }
  }

  // Pares de voces: quintas/octavas paralelas, cruces y choques.
  const order = [...voices];
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = order[i];
      const b = order[j];
      let par = 0;
      let cross = 0;
      let clash = 0;
      let prev: [number, number] | null = null;
      for (const t of onsets) {
        const na = noteAt(a, t);
        const nb = noteAt(b, t);
        if (!na || !nb) {
          prev = null;
          continue;
        }
        const cur: [number, number] = [na.midi, nb.midi];
        const iv = Math.abs(cur[0] - cur[1]) % 12;
        if (prev && prev[0] !== cur[0] && prev[1] !== cur[1]) {
          const pv = Math.abs(prev[0] - prev[1]) % 12;
          const sameDir = Math.sign(cur[0] - prev[0]) === Math.sign(cur[1] - prev[1]);
          if (sameDir && pv === iv && (iv === 7 || iv === 0) && par < 3) {
            par++;
            issues.push({ time: t, level: 'idea', text: `${INTERVAL_NAMES[iv][0].toUpperCase() + INTERVAL_NAMES[iv].slice(1)} paralelas entre «${a.name}» y «${b.name}»: suenan "huecas"; mueve una de las dos en otra dirección.` });
          }
        }
        if (cur[0] < cur[1] && cross < 2) {
          cross++;
          issues.push({ time: t, level: 'idea', text: `«${a.name}» pasa por debajo de «${b.name}» (${midiToName(cur[0])} < ${midiToName(cur[1])}). Si no es intencionado, puede confundir a quien canta.` });
        }
        const dur = Math.min(na.start + na.dur, nb.start + nb.dur) - t;
        if ((iv === 1 || iv === 11) && dur >= spb * 1.5 && clash < 2) {
          clash++;
          issues.push({ time: t, level: 'aviso', text: `Choque de segunda menor entre «${a.name}» y «${b.name}» (${midiToName(cur[0])}/${midiToName(cur[1])}) que dura ${(dur / spb).toFixed(1)} pulsos.` });
        }
        prev = cur;
      }
    }
  }

  // Notas largas fuera del acorde marcado.
  if (song.chords.length && !song.chordsAuto) {
    let out = 0;
    for (const v of voices) {
      for (const n of v.notes) {
        if (out >= 6) break;
        if (n.dur < spb * 1.5) continue;
        const c = chordAt(song.chords, n.start);
        const pc = c && parseChord(c.name);
        if (pc && !pc.pcs.includes(pcOf(n.midi))) {
          out++;
          issues.push({ time: n.start, level: 'idea', text: `«${v.name}» canta ${midiToName(n.midi, song.keyFifths)} (larga) sobre ${c!.name}, que no es nota del acorde.` });
        }
      }
    }
  }

  issues.sort((x, y) => x.time - y.time);
  return issues.slice(0, 40).map((i) => ({ ...i, text: prettyAccidentals(i.text) + ` (${fmtT(i.time)})` }));
}

// ---------------- 2. Proponer acordes para una melodía ----------------

interface Cand {
  root: number;
  quality: '' | 'm' | 'dim';
  degree: number; // semitonos desde la tónica mayor
}

function diatonic(tonic: number): Cand[] {
  const steps: [number, Cand['quality']][] = [
    [0, ''],
    [2, 'm'],
    [4, 'm'],
    [5, ''],
    [7, ''],
    [9, 'm'],
    [11, 'dim'],
    [4, ''], // V del relativo menor (p. ej. E en Do mayor)
    [2, ''], // V/V (D en Do mayor)
  ];
  return steps.map(([d, q]) => ({ root: pcOf(tonic + d), quality: q, degree: d }));
}

function candPcs(c: Cand): number[] {
  const third = c.quality === '' ? 4 : 3;
  const fifth = c.quality === 'dim' ? 6 : 7;
  return [c.root, pcOf(c.root + third), pcOf(c.root + fifth)];
}

const MOVES: Record<string, number> = {
  '7>0': 0.45, '7>9': 0.25, '5>7': 0.3, '2>7': 0.35, '0>5': 0.2, '0>7': 0.15, '9>2': 0.25, '9>5': 0.25,
  '4>9': 0.2, '0>9': 0.15, '5>0': 0.2, '11>0': 0.3, 'E>9': 0.45, 'D>7': 0.4,
};

export function suggestChords(song: Song, melodyId: string, perBar: 1 | 2): ChordMark[] {
  const mel = song.voices.find((v) => v.id === melodyId);
  if (!mel || !mel.notes.length) return [];
  const spb = 60 / song.bpm;
  const segLen = (song.beatsPerBar * spb) / perBar;
  const end = Math.max(...mel.notes.map((n) => n.start + n.dur));
  const nSeg = Math.ceil(end / segLen - 1e-6);
  const tonic = pcOf(song.keyFifths * 7);
  // ¿Mayor o relativo menor? Se mira el peso de cada tónica y la última nota.
  const weight = (pc: number) => mel.notes.reduce((s, n) => s + (pcOf(n.midi) === pc ? n.dur : 0), 0);
  const last = pcOf(mel.notes[mel.notes.length - 1].midi);
  const minor = weight(pcOf(tonic + 9)) + (last === pcOf(tonic + 9) ? 2 : 0) > weight(tonic) + (last === tonic ? 2 : 0);
  const home = minor ? 9 : 0;
  const cands = diatonic(tonic);
  const key = (c: Cand) => (c.degree === 4 && c.quality === '' ? 'E' : c.degree === 2 && c.quality === '' ? 'D' : String(c.degree));

  // Puntuación de cada acorde en cada tramo.
  const fit: number[][] = [];
  for (let s = 0; s < nSeg; s++) {
    const t0 = s * segLen;
    const t1 = t0 + segLen;
    fit.push(
      cands.map((c) => {
        const pcs = candPcs(c);
        let score = 0;
        let any = false;
        for (const n of mel.notes) {
          const ov = Math.min(t1, n.start + n.dur) - Math.max(t0, n.start);
          if (ov <= 0) continue;
          any = true;
          const strong = Math.abs(n.start - t0) < 0.02 || Math.abs(((n.start / spb) % 2)) < 0.02;
          const inChord = pcs.includes(pcOf(n.midi));
          score += (ov / segLen) * (inChord ? (pcOf(n.midi) === c.root ? 1.15 : 1) : -0.7) * (strong ? 1.4 : 1);
        }
        if (!any) return 0;
        if (c.quality === 'dim') score -= 0.35;
        if (c.degree === 2 && c.quality === '') score -= 0.25;
        if (c.degree === 4 && c.quality === '') score -= minor ? 0.05 : 0.3;
        return score;
      }),
    );
  }

  // Viterbi: mejor secuencia combinando encaje y movimientos típicos.
  const N = cands.length;
  const best: number[][] = [];
  const back: number[][] = [];
  for (let s = 0; s < nSeg; s++) {
    best.push(new Array(N).fill(-Infinity));
    back.push(new Array(N).fill(0));
    for (let j = 0; j < N; j++) {
      let base = fit[s][j];
      if (s === 0 && cands[j].degree === home && cands[j].quality !== 'dim') base += 0.4;
      if (s === nSeg - 1 && cands[j].degree === home && cands[j].quality === (minor ? 'm' : '')) base += 0.6;
      if (s === 0) {
        best[s][j] = base;
        continue;
      }
      for (let i = 0; i < N; i++) {
        const mv = i === j ? -0.04 : MOVES[`${key(cands[i])}>${key(cands[j])}`] ?? 0;
        const v = best[s - 1][i] + base + mv;
        if (v > best[s][j]) {
          best[s][j] = v;
          back[s][j] = i;
        }
      }
    }
  }
  let j = best[nSeg - 1].indexOf(Math.max(...best[nSeg - 1]));
  const path: number[] = [];
  for (let s = nSeg - 1; s >= 0; s--) {
    path.unshift(j);
    j = back[s][j];
  }
  const marks: ChordMark[] = [];
  path.forEach((ci, s) => {
    const c = cands[ci];
    const name = prettyAccidentals(pcName(c.root, song.keyFifths) + c.quality);
    if (marks[marks.length - 1]?.name !== name) marks.push({ time: s * segLen, name });
  });
  return marks;
}

// ---------------- 3. Armonizar: crear voces a partir de melodía + acordes ----------------

export interface HarmonizeOptions {
  melodyId: string;
  voices: number; // voces nuevas (1-4)
  style: 'bloque' | 'pad';
}

export function harmonize(song: Song, opts: HarmonizeOptions): Voice[] {
  const mel = song.voices.find((v) => v.id === opts.melodyId);
  if (!mel || !mel.notes.length || !song.chords.length) return [];
  const n = Math.max(1, Math.min(4, opts.voices));
  const melMed = [...mel.notes.map((x) => x.midi)].sort((a, b) => a - b)[mel.notes.length >> 1];
  // Centros de cada voz por debajo de la melodía; la última hace de bajo si hay 3 o más.
  const centers = Array.from({ length: n }, (_, k) => (n >= 3 && k === n - 1 ? melMed - 19 : melMed - 5 - 5 * k));
  const ranges = centers.map((c) => [c - 8, c + 7] as [number, number]);
  const spb = 60 / song.bpm;

  type Voicing = number[];
  let prev: Voicing | null = null;
  let prevMel: number | null = null;

  const choose = (top: number, ch: ParsedChord): Voicing | null => {
    const lists = ranges.map(([lo, hi], k) => {
      const out: number[] = [];
      for (let m = hi + (k === 0 ? 3 : 0); m >= lo; m--) if (m < top && ch.pcs.includes(pcOf(m))) out.push(m);
      return out;
    });
    let bestV: Voicing | null = null;
    let bestCost = Infinity;
    const cur: number[] = [];
    const rec = (k: number) => {
      if (k === n) {
        const c = cost(cur, top, ch);
        if (c < bestCost) {
          bestCost = c;
          bestV = [...cur];
        }
        return;
      }
      for (const m of lists[k]) {
        if (k > 0 && m >= cur[k - 1]) continue;
        cur.push(m);
        rec(k + 1);
        cur.pop();
      }
    };
    rec(0);
    return bestV;
  };

  const cost = (v: number[], top: number, ch: ParsedChord) => {
    let c = 0;
    const all = [top, ...v];
    const pcs = new Set(all.map(pcOf));
    if (!pcs.has(ch.root)) c += 6;
    if (ch.third !== null && !pcs.has(ch.third)) c += 4;
    if (ch.fifth !== null && !pcs.has(ch.fifth) && all.length >= 4) c += 1;
    // Terceras dobladas suenan pesadas.
    if (ch.third !== null && all.filter((m) => pcOf(m) === ch.third).length > 1) c += 1.5;
    if (n >= 2 && pcOf(v[n - 1]) !== ch.bass) c += 5;
    for (let k = 0; k < all.length - 1; k++) {
      const gap = all[k] - all[k + 1];
      const limit = k === all.length - 2 && n >= 3 ? 19 : 12;
      if (gap > limit) c += 3;
      if (gap < 2) c += 2;
    }
    v.forEach((m, k) => (c += Math.abs(m - centers[k]) * 0.12));
    if (prev) {
      v.forEach((m, k) => {
        const d = Math.abs(m - prev![k]);
        c += d * 0.9 + (d > 7 ? 3 : 0);
      });
      const prevAll = [prevMel ?? top, ...prev];
      for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
          const i1 = Math.abs(prevAll[a] - prevAll[b]) % 12;
          const i2 = Math.abs(all[a] - all[b]) % 12;
          if ((i2 === 7 || i2 === 0) && i1 === i2 && prevAll[a] !== all[a] && prevAll[b] !== all[b]) c += 8;
        }
      }
    }
    return c;
  };

  const lines: Note[][] = Array.from({ length: n }, () => []);
  const push = (k: number, midi: number, start: number, dur: number) => {
    const line = lines[k];
    const last = line[line.length - 1];
    if (last && last.midi === midi && Math.abs(last.start + last.dur - start) < 1e-3) last.dur += dur;
    else line.push({ midi, start, dur });
  };

  if (opts.style === 'pad') {
    const chords = song.chords;
    const end = Math.max(...mel.notes.map((x) => x.start + x.dur));
    chords.forEach((c, i) => {
      const t0 = c.time;
      const t1 = i + 1 < chords.length ? chords[i + 1].time : end;
      if (t1 <= t0) return;
      const ch = parseChord(c.name);
      if (!ch) return;
      const inSpan = mel.notes.filter((x) => x.start < t1 && x.start + x.dur > t0);
      const top = inSpan.length ? Math.min(...inSpan.map((x) => x.midi)) : melMed;
      const v = choose(top, ch);
      if (!v) return;
      v.forEach((m, k) => push(k, m, t0, t1 - t0));
      prev = v;
      prevMel = top;
    });
  } else {
    for (const note of mel.notes) {
      const c = chordAt(song.chords, note.start);
      const ch = c && parseChord(c.name);
      if (!ch) continue;
      const passing = !ch.pcs.includes(pcOf(note.midi)) && note.dur < spb * 0.99;
      let v: Voicing | null = passing && prev ? prev : choose(note.midi, ch);
      if (v && v.some((m) => m >= note.midi)) v = choose(note.midi, ch);
      if (!v) continue;
      v.forEach((m, k) => push(k, m, note.start, note.dur));
      prev = v;
      prevMel = note.midi;
    }
  }

  const used = new Set(song.voices.map((v) => v.color));
  const free = VOICE_COLORS.filter((c) => !used.has(c));
  return lines
    .map((notes, k) => {
      const v = makeVoice(`${mel.name} · armonía ${k + 1}`, song.voices.length + k, notes);
      v.color = free[k] ?? v.color;
      return v;
    })
    .filter((v) => v.notes.length);
}

/** Resumen compacto de la canción para enviarlo a la IA (en pulsos, con nombres de nota). */
export function songToPrompt(song: Song): string {
  const spb = 60 / song.bpm;
  const b = (t: number) => Math.round((t / spb) * 100) / 100;
  const lines = [
    `Título: ${song.title}`,
    `Tempo: ${song.bpm} BPM · ${song.beatsPerBar} pulsos por compás · armadura: ${song.keyFifths} quintas (${song.keyFifths >= 0 ? 'sostenidos' : 'bemoles'})`,
    `Acordes (pulso:acorde): ${song.chords.map((c) => `${b(c.time)}:${plainAccidentals(c.name)}`).join(' ') || '(ninguno)'}`,
  ];
  for (const v of song.voices) {
    lines.push(`Voz id=${v.id} «${v.name}» (inicio:duración:nota, en pulsos): ` + v.notes.map((x) => `${b(x.start)}:${b(x.dur)}:${plainAccidentals(x.name ?? midiToName(x.midi, song.keyFifths))}`).join(' '));
  }
  return lines.join('\n');
}
