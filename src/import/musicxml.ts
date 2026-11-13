import { makeSong, makeVoice, orderVoicesByPitch, sortNotes, type ChordMark, type Note, type Song } from '../model';
import { computeChords, fifthsAfterTranspose, prettyAccidentals, transposeChordName } from '../music';

// ---------- Utilidades XML ----------

function kids(el: Element, tag?: string): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(el.children)) if (!tag || c.localName === tag) out.push(c);
  return out;
}
function kid(el: Element, tag: string): Element | undefined {
  return kids(el, tag)[0];
}
function txt(el: Element | undefined, tag?: string): string | undefined {
  if (!el) return undefined;
  const e = tag ? kid(el, tag) : el;
  return e?.textContent?.trim() || undefined;
}
function num(el: Element | undefined, tag?: string): number | undefined {
  const t = txt(el, tag);
  if (t === undefined) return undefined;
  const v = parseFloat(t);
  return isNaN(v) ? undefined : v;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ---------- Datos intermedios por compás ----------

interface RawNote {
  onsetQ: number; // en negras, relativo al compás
  durQ: number;
  midi: number;
  name?: string;
  lane: string; // parte|pentagrama|voz
  tieStart: boolean;
  tieStop: boolean;
  /** Sílabas de la letra por estrofa (número de estrofa → texto, con guion si la palabra sigue). */
  lyrics?: Map<number, string>;
}

/** La sílaba de un `<lyric>`: con guion si la palabra sigue, y las elisiones unidas con «‿». Vacía si solo alarga. */
function lyricText(l: Element): string {
  const texts = kids(l, 'text').map((t) => t.textContent ?? '');
  const text = texts.join('‿').trim();
  if (!text) return '';
  const syllabic = kids(l, 'syllabic').map((s) => s.textContent?.trim());
  const last = syllabic[syllabic.length - 1];
  return last === 'begin' || last === 'middle' ? `${text}-` : text;
}
interface MeasureData {
  lenQ: number;
  notes: RawNote[];
  tempos: { q: number; bpm: number }[];
  harmonies: { q: number; name: string }[];
  beats?: number;
  fifths?: number;
}

const KIND_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7',
  'half-diminished': 'm7♭5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'dominant-13th': '13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: '',
};

function alterStr(alter: number | undefined): string {
  if (!alter) return '';
  return alter > 0 ? '#'.repeat(Math.round(alter)) : 'b'.repeat(Math.round(-alter));
}

function parseHarmony(h: Element): string | null {
  const root = kid(h, 'root');
  if (!root) return null;
  const step = txt(root, 'root-step');
  if (!step) return null;
  const kindEl = kid(h, 'kind');
  const kindText = kindEl?.getAttribute('text');
  const kind = txt(kindEl) ?? 'major';
  let suffix = kindText != null ? kindText : (KIND_SUFFIX[kind] ?? '');
  let name = step + alterStr(num(root, 'root-alter')) + suffix;
  const bass = kid(h, 'bass');
  const bassStep = bass && txt(bass, 'bass-step');
  if (bassStep) name += '/' + bassStep + alterStr(num(bass, 'bass-alter'));
  return prettyAccidentals(name);
}

/** Estado de una parte entre compases. `chromatic`/`diatonic`: instrumento transpositor (p. ej. trompeta en Si♭: −2/−1). */
interface PartState {
  divisions: number;
  chromatic: number;
  diatonic: number;
}

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Altura real de una nota escrita para un instrumento transpositor, con su nombre bien escrito. */
function soundingPitch(step: string, alter: number, octave: number, st: PartState): { midi: number; name: string } {
  const written = (octave + 1) * 12 + (STEP_PC[step] ?? 0) + Math.round(alter);
  if (!st.chromatic && !st.diatonic) return { midi: written, name: step + alterStr(alter) + octave };
  const midi = written + st.chromatic;
  const idx = STEPS.indexOf(step) + octave * 7 + st.diatonic;
  const nStep = STEPS[((idx % 7) + 7) % 7];
  const nOct = Math.floor(idx / 7);
  const nAlter = midi - ((nOct + 1) * 12 + STEP_PC[nStep]);
  // Si la casilla diatónica no cuadra (archivo raro), mejor sin nombre que con uno equivocado.
  return Math.abs(nAlter) <= 2 ? { midi, name: nStep + alterStr(nAlter) + nOct } : { midi, name: '' };
}

function parseMeasure(m: Element, partIdx: number, state: PartState): MeasureData {
  const data: MeasureData = { lenQ: 0, notes: [], tempos: [], harmonies: [] };
  let cursor = 0; // en divisiones
  let maxCursor = 0;
  let lastOnset = 0;
  const q = () => cursor / state.divisions;

  for (const el of Array.from(m.children)) {
    switch (el.localName) {
      case 'attributes': {
        const d = num(el, 'divisions');
        if (d) state.divisions = d;
        const key = kid(el, 'key');
        const f = num(key, 'fifths');
        const tr = kid(el, 'transpose');
        if (tr) {
          const oct = num(tr, 'octave-change') ?? 0;
          state.chromatic = (num(tr, 'chromatic') ?? 0) + oct * 12;
          state.diatonic = (num(tr, 'diatonic') ?? 0) + oct * 7;
        }
        // La armadura escrita de un instrumento transpositor no es la que suena.
        if (f !== undefined && data.fifths === undefined) data.fifths = state.chromatic % 12 ? fifthsAfterTranspose(f, state.chromatic) : f;
        const time = kid(el, 'time');
        const b = num(time, 'beats');
        const bt = num(time, 'beat-type');
        if (b && bt && data.beats === undefined) data.beats = (b * 4) / bt;
        break;
      }
      case 'note': {
        if (kid(el, 'grace') || kid(el, 'cue')) break;
        const dur = num(el, 'duration') ?? 0;
        const isChord = !!kid(el, 'chord');
        const onset = isChord ? lastOnset : cursor;
        if (!isChord) {
          lastOnset = cursor;
          cursor += dur;
          maxCursor = Math.max(maxCursor, cursor);
        }
        const pitch = kid(el, 'pitch');
        if (!pitch || kid(el, 'rest')) break;
        const step = txt(pitch, 'step') ?? 'C';
        const alter = num(pitch, 'alter') ?? 0;
        const octave = num(pitch, 'octave') ?? 4;
        const { midi, name } = soundingPitch(step, alter, octave, state);
        const staff = txt(el, 'staff') ?? '1';
        const voice = txt(el, 'voice') ?? '1';
        const ties = kids(el, 'tie').map((t) => t.getAttribute('type'));
        const notations = kid(el, 'notations');
        if (notations) for (const t of kids(notations, 'tied')) ties.push(t.getAttribute('type'));
        const lyrics = new Map<number, string>();
        kids(el, 'lyric').forEach((l, k) => {
          const s = lyricText(l);
          // Uno que solo alarga (<extend/>) cuenta para su estrofa, vacío: esa nota es un melisma en esa estrofa.
          lyrics.set(parseInt(l.getAttribute('number') ?? '') || k + 1, s);
        });
        data.notes.push({
          onsetQ: onset / state.divisions,
          durQ: dur / state.divisions,
          midi,
          name: name || undefined,
          lane: `${partIdx}|${staff}|${voice}`,
          tieStart: ties.includes('start'),
          tieStop: ties.includes('stop'),
          lyrics: lyrics.size ? lyrics : undefined,
        });
        break;
      }
      case 'backup':
        cursor -= num(el, 'duration') ?? 0;
        if (cursor < 0) cursor = 0;
        break;
      case 'forward':
        cursor += num(el, 'duration') ?? 0;
        maxCursor = Math.max(maxCursor, cursor);
        break;
      case 'direction': {
        const offset = (num(el, 'offset') ?? 0) / state.divisions;
        let bpm: number | undefined;
        const sound = kid(el, 'sound');
        const st = sound?.getAttribute('tempo');
        if (st) bpm = parseFloat(st);
        if (!bpm) {
          for (const dt of kids(el, 'direction-type')) {
            const met = kid(dt, 'metronome');
            const pm = num(met, 'per-minute');
            if (met && pm) {
              const unit = txt(met, 'beat-unit') ?? 'quarter';
              const dotted = !!kid(met, 'beat-unit-dot');
              const mult: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };
              bpm = pm * (mult[unit] ?? 1) * (dotted ? 1.5 : 1);
            }
          }
        }
        if (bpm && bpm > 0) data.tempos.push({ q: q() + offset, bpm });
        break;
      }
      case 'sound': {
        const st = el.getAttribute('tempo');
        if (st && parseFloat(st) > 0) data.tempos.push({ q: q(), bpm: parseFloat(st) });
        break;
      }
      case 'harmony': {
        let name = parseHarmony(el);
        if (name && state.chromatic % 12) name = transposeChordName(name, state.chromatic, 0);
        const offset = (num(el, 'offset') ?? 0) / state.divisions;
        if (name) data.harmonies.push({ q: q() + offset, name });
        break;
      }
    }
  }
  data.lenQ = maxCursor / state.divisions;
  return data;
}

// ---------- Repeticiones y casillas de 1ª/2ª vez ----------

function barlineInfo(m: Element) {
  let forward = false;
  let backwardTimes = 0;
  let endingStart: number[] | null = null;
  let endingStop = false;
  for (const b of kids(m, 'barline')) {
    const rep = kid(b, 'repeat');
    if (rep) {
      const dir = rep.getAttribute('direction');
      if (dir === 'forward') forward = true;
      if (dir === 'backward') backwardTimes = parseInt(rep.getAttribute('times') ?? '2') || 2;
    }
    const end = kid(b, 'ending');
    if (end) {
      const type = end.getAttribute('type');
      const nums = (end.getAttribute('number') ?? '1')
        .split(/[,\s]+/)
        .map((s) => parseInt(s))
        .filter((n) => !isNaN(n));
      if (type === 'start') endingStart = nums;
      if (type === 'stop' || type === 'discontinue') endingStop = true;
    }
  }
  return { forward, backwardTimes, endingStart, endingStop };
}

/** Orden en que se tocan los compases (repeticiones y casillas desarrolladas), y en qué vuelta va cada uno. */
function expandRepeats(measures: Element[]): { seq: number[]; passes: number[] } {
  const info = measures.map(barlineInfo);
  const seq: number[] = [];
  const passes: number[] = [];
  let i = 0;
  let repeatStart = 0;
  let pass = 1;
  let arrivedByJump = false;
  const jumps = new Map<number, number>();
  let guard = 0;
  while (i < measures.length && guard++ < 20000) {
    const inf = info[i];
    if (inf.forward && !arrivedByJump) {
      repeatStart = i;
      pass = 1;
    }
    arrivedByJump = false;
    // Casilla que no corresponde a esta pasada: saltarla entera.
    if (inf.endingStart && !inf.endingStart.includes(pass)) {
      let j = i;
      while (j < measures.length && !info[j].endingStop) j++;
      i = j + 1;
      continue;
    }
    seq.push(i);
    passes.push(pass);
    if (inf.backwardTimes) {
      const done = jumps.get(i) ?? 0;
      if (done < inf.backwardTimes - 1) {
        jumps.set(i, done + 1);
        pass++;
        i = repeatStart;
        arrivedByJump = true;
        continue;
      }
      jumps.set(i, 0);
      repeatStart = i + 1;
      pass = 1;
    }
    i++;
  }
  return { seq, passes };
}

// ---------- Conversión principal ----------

export function parseMusicXML(text: string, fallbackTitle = 'Partitura'): Song {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo MusicXML no es válido.');
  const root = doc.documentElement;
  if (root.localName === 'score-timewise') {
    throw new Error('Formato MusicXML "timewise" no soportado. Expórtalo como MusicXML normal (partwise).');
  }
  if (root.localName !== 'score-partwise') throw new Error('No parece un archivo MusicXML.');

  const title =
    txt(kid(root, 'work'), 'work-title') ??
    txt(root, 'movement-title') ??
    kids(root, 'credit')
      .map((c) => txt(c, 'credit-words'))
      .find(Boolean) ??
    fallbackTitle;

  const partNames = new Map<string, string>();
  const partList = kid(root, 'part-list');
  if (partList) {
    for (const sp of kids(partList, 'score-part')) {
      partNames.set(sp.getAttribute('id') ?? '', txt(sp, 'part-name') ?? txt(sp, 'part-abbreviation') ?? '');
    }
  }

  const parts = kids(root, 'part');
  if (!parts.length) throw new Error('La partitura no tiene partes.');
  const partMeasures = parts.map((p) => kids(p, 'measure'));
  const measureCount = Math.max(...partMeasures.map((m) => m.length));

  // Parseo de cada compás en orden de documento.
  const parsed: MeasureData[][] = partMeasures.map((ms, pi) => {
    const state: PartState = { divisions: 1, chromatic: 0, diatonic: 0 };
    return ms.map((m) => parseMeasure(m, pi, state));
  });
  const measureLen: number[] = [];
  for (let i = 0; i < measureCount; i++) {
    measureLen[i] = Math.max(0, ...parsed.map((p) => p[i]?.lenQ ?? 0));
  }

  const { seq, passes } = expandRepeats(partMeasures[0]);

  // Línea temporal en negras. La letra de cada nota: la estrofa de la vuelta en que se canta (la 1.ª la primera vez,
  // la 2.ª al repetir…), o la primera que tenga si no hay tantas.
  const laneNotes = new Map<string, (RawNote & { absQ: number; lyric?: string })[]>();
  // La estrofa se elige por compás y por carril: la de esta vuelta si ese carril la tiene en ese compás; si no, la de
  // número más bajo que tenga. Nota a nota, un melisma de una estrofa se llenaba con la sílaba de otra.
  const tempos: { q: number; bpm: number }[] = [];
  const harmonies: { q: number; name: string }[] = [];
  let beats = 4;
  let fifths = 0;
  let gotBeats = false;
  let gotFifths = false;
  let t = 0;
  // Dónde empieza cada compás (en negras), con las repeticiones ya desarrolladas: sirve para saltar entre compases
  // al mezclar con una grabación (la anacrusa, los cambios de compás y los 7/8 no caen en una rejilla regular).
  const barQ: number[] = [];
  seq.forEach((mi, si) => {
    barQ.push(t);
    parsed.forEach((pm, pi) => {
      const md = pm[mi];
      if (!md) return;
      // Estrofas que trae cada carril en este compás.
      const estrofas = new Map<string, Set<number>>();
      for (const n of md.notes) {
        if (!n.lyrics) continue;
        const s = estrofas.get(n.lane) ?? new Set<number>();
        for (const k of n.lyrics.keys()) s.add(k);
        estrofas.set(n.lane, s);
      }
      const verso = (lane: string) => {
        const s = estrofas.get(lane);
        if (!s?.size) return undefined;
        return s.has(passes[si]) ? passes[si] : Math.min(...s);
      };
      if (md.beats && !gotBeats) {
        beats = md.beats;
        gotBeats = true;
      }
      if (md.fifths !== undefined && !gotFifths) {
        fifths = md.fifths;
        gotFifths = true;
      }
      for (const n of md.notes) {
        const arr = laneNotes.get(n.lane) ?? [];
        const v = verso(n.lane);
        arr.push({ ...n, absQ: t + n.onsetQ, lyric: v === undefined ? undefined : n.lyrics?.get(v) || undefined });
        laneNotes.set(n.lane, arr);
      }
      for (const tp of md.tempos) tempos.push({ q: t + tp.q, bpm: tp.bpm });
      if (pi === 0 || !harmonies.length) for (const h of md.harmonies) harmonies.push({ q: t + h.q, name: h.name });
    });
    t += measureLen[mi];
  });

  // Mapa de tempo: negras -> segundos.
  tempos.sort((a, b) => a.q - b.q);
  const tmap: { q: number; bpm: number; sec: number }[] = [];
  const initialBpm = tempos.length && tempos[0].q < 4 ? tempos[0].bpm : 120;
  tmap.push({ q: 0, bpm: initialBpm, sec: 0 });
  for (const tp of tempos) {
    const last = tmap[tmap.length - 1];
    if (tp.q <= last.q + 1e-6) {
      last.bpm = tp.bpm;
      continue;
    }
    if (tp.bpm === last.bpm) continue;
    tmap.push({ q: tp.q, bpm: tp.bpm, sec: last.sec + ((tp.q - last.q) * 60) / last.bpm });
  }
  const qToSec = (q: number) => {
    let seg = tmap[0];
    for (const s of tmap) if (s.q <= q + 1e-9) seg = s;
    return seg.sec + ((q - seg.q) * 60) / seg.bpm;
  };

  // Construye las líneas: carril (parte/pentagrama/voz) y, si hay acordes, su posición en el acorde.
  const lines = new Map<string, Note[]>();
  const lineMeta = new Map<string, { part: number; key: string; rank: number }>();
  for (const [lane, raw] of laneNotes) {
    raw.sort((a, b) => a.absQ - b.absQ || b.midi - a.midi);
    // Rango dentro del acorde (0 = nota más aguda).
    let k = 0;
    while (k < raw.length) {
      let j = k;
      while (j < raw.length && Math.abs(raw[j].absQ - raw[k].absQ) < 1e-6) j++;
      // En un acorde de una misma voz, la sílaba (que el programa suele poner en una sola nota) es de todas.
      const silaba = raw.slice(k, j).find((x) => x.lyric)?.lyric;
      for (let r = k; r < j; r++) {
        const n = raw[r];
        const key = `${lane}|${r - k}`;
        const arr = lines.get(key) ?? [];
        const startSec = qToSec(n.absQ);
        const endSec = qToSec(n.absQ + n.durQ);
        const prev = arr[arr.length - 1] as (Note & { _tie?: boolean }) | undefined;
        if (n.tieStop && prev && prev.midi === n.midi && Math.abs(prev.start + prev.dur - startSec) < 0.05) {
          prev.dur = endSec - prev.start;
        } else {
          const note: Note = { midi: n.midi, start: startSec, dur: Math.max(0.02, endSec - startSec), name: n.name };
          if (n.lyric ?? silaba) note.lyric = n.lyric ?? silaba;
          arr.push(note);
        }
        lines.set(key, arr);
        if (!lineMeta.has(key)) lineMeta.set(key, { part: parseInt(lane), key: lane, rank: r - k });
      }
      k = j;
    }
  }

  // Nombres de las voces.
  const linesPerPart = new Map<number, number>();
  for (const m of lineMeta.values()) linesPerPart.set(m.part, (linesPerPart.get(m.part) ?? 0) + 1);
  const partCounters = new Map<number, number>();

  const voices = [...lines.entries()]
    .filter(([, notes]) => notes.length > 0)
    .map(([key, notes], idx) => {
      const meta = lineMeta.get(key)!;
      const partId = parts[meta.part].getAttribute('id') ?? '';
      let name = partNames.get(partId) || `Voz ${meta.part + 1}`;
      if ((linesPerPart.get(meta.part) ?? 1) > 1) {
        const c = (partCounters.get(meta.part) ?? 0) + 1;
        partCounters.set(meta.part, c);
        name += ` ${c}`;
      }
      sortNotes(notes);
      return makeVoice(name, idx, notes);
    });

  if (!voices.length) throw new Error('No se encontraron notas en la partitura.');

  // Renombra "Parte 1", "Parte 2"… de aguda a grave dentro de cada parte.
  const ordered = orderVoicesByPitch(voices);

  const song = makeSong({
    title,
    bpm: Math.round(initialBpm),
    beatsPerBar: Math.round(beats) || 4,
    keyFifths: fifths,
    voices: ordered,
    barStarts: barQ.map(qToSec),
  });

  if (harmonies.length) {
    const marks: ChordMark[] = [];
    harmonies.sort((a, b) => a.q - b.q);
    for (const h of harmonies) {
      const last = marks[marks.length - 1];
      if (last && last.name === h.name) continue;
      marks.push({ time: qToSec(h.q), name: h.name });
    }
    song.chords = marks;
    song.chordsAuto = false;
  } else {
    song.chords = computeChords(song);
  }
  return song;
}
