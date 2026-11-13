// Limpieza de una canción que ha salido de mezclar partitura y grabación.
// La voz «Como se canta (X)» es lo que el detector oyó en la grabación, y la voz X es la partitura ya colocada.
// Aquí se comparan: lo que es claramente del detector se quita a mano, y lo dudoso (¿cantáis otra nota o se ha
// equivocado el detector?) es una pregunta musical, y esa se la hacemos a la IA.
import type { Note, Song, Voice } from '../model';
import { midiToName, prettyAccidentals } from '../music';

export interface FusionPair {
  /** La voz con lo que de verdad se oye. */
  sung: Voice;
  /** La voz de la partitura a la que corresponde. */
  score: Voice;
}

const PREFIJO = 'Como se canta';

/** Busca en la canción la pareja «lo que se canta» / «lo que pone la partitura». */
export function findFusion(song: Song): FusionPair | null {
  const i = song.voices.findIndex((v) => v.name.startsWith(PREFIJO));
  if (i < 0) return null;
  const sung = song.voices[i];
  const entre = sung.name.match(/\(([^)]+)\)/)?.[1];
  const score = (entre && song.voices.find((v) => v.name === entre)) || song.voices[i - 1];
  return score && score !== sung && score.notes.length ? { sung, score } : null;
}

export interface Diff {
  /** Nota de la grabación. */
  sung: Note;
  /** La nota de la partitura que suena en ese momento (si hay). */
  score: Note | null;
  /** Diferencia en semitonos (0 = igual). */
  semis: number;
  /** Compás (empezando en 1). */
  bar: number;
}

/** Empareja cada nota oída con la de la partitura que suena en ese instante. */
export function diffSungVsScore(song: Song, pair: FusionPair): Diff[] {
  const spb = 60 / song.bpm;
  const bar = (t: number) => Math.floor(t / spb / song.beatsPerBar) + 1;
  return pair.sung.notes.map((n) => {
    const mid = n.start + Math.min(0.05, n.dur / 2);
    const score = pair.score.notes.find((x) => x.start <= mid && x.start + x.dur > mid) ?? null;
    return { sung: n, score, semis: score ? n.midi - score.midi : 0, bar: bar(n.start) };
  });
}

export interface FusionSummary {
  total: number;
  iguales: number;
  distintas: number;
  sinPartitura: number;
  cortas: number;
  octavas: number;
  /** Compases donde se repite la misma diferencia: ahí probablemente cantáis otra cosa. */
  sistematicas: { bar: number; semis: number; veces: number }[];
}

export function summarize(diffs: Diff[]): FusionSummary {
  const porCompas = new Map<string, { bar: number; semis: number; veces: number }>();
  for (const d of diffs) {
    if (!d.score || !d.semis) continue;
    const k = `${d.bar}|${d.semis}`;
    const e = porCompas.get(k) ?? { bar: d.bar, semis: d.semis, veces: 0 };
    e.veces++;
    porCompas.set(k, e);
  }
  return {
    total: diffs.length,
    iguales: diffs.filter((d) => d.score && !d.semis).length,
    distintas: diffs.filter((d) => d.score && d.semis).length,
    sinPartitura: diffs.filter((d) => !d.score).length,
    cortas: diffs.filter((d) => d.sung.dur < 0.12).length,
    octavas: diffs.filter((d) => Math.abs(d.semis) === 12).length,
    sistematicas: [...porCompas.values()].filter((e) => e.veces >= 2).sort((a, b) => b.veces - a.veces).slice(0, 8),
  };
}

/**
 * Limpieza que no necesita criterio musical: quita las notas de un suspiro, junta las que son la misma nota
 * partida en dos y devuelve a su sitio las que están una octava arriba o abajo de la partitura.
 */
export function cleanSung(song: Song, pair: FusionPair): { quitadas: number; unidas: number; octavas: number } {
  const diffs = diffSungVsScore(song, pair);
  let quitadas = 0;
  let octavas = 0;
  const notes: Note[] = [];
  for (const d of diffs) {
    if (d.sung.dur < 0.12) {
      quitadas++;
      continue;
    }
    const n = { ...d.sung };
    if (d.score && Math.abs(d.semis) === 12) {
      n.midi = d.score.midi;
      delete n.name;
      octavas++;
    }
    notes.push(n);
  }
  let unidas = 0;
  const out: Note[] = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    if (prev && prev.midi === n.midi && n.start - (prev.start + prev.dur) < 0.09) {
      prev.dur = Math.max(prev.dur, n.start + n.dur - prev.start);
      unidas++;
      continue;
    }
    if (prev && prev.start + prev.dur > n.start) prev.dur = n.start - prev.start;
    out.push(n);
  }
  pair.sung.notes = out;
  return { quitadas, unidas, octavas };
}

/** La petición para la IA: solo las diferencias, con su compás, no la canción entera. */
export function fusionPrompt(song: Song, pair: FusionPair): string {
  const diffs = diffSungVsScore(song, pair).filter((d) => d.score && d.semis);
  const spb = 60 / song.bpm;
  const lista = diffs
    .slice(0, 120)
    .map((d) => {
      const pulso = (d.sung.start / spb).toFixed(2);
      const sube = d.semis > 0 ? '+' : '';
      return `c.${d.bar} pulso ${pulso}: partitura ${prettyAccidentals(midiToName(d.score!.midi, song.keyFifths))}, se oye ${prettyAccidentals(midiToName(d.sung.midi, song.keyFifths))} (${sube}${d.semis})`;
    })
    .join('\n');
  return [
    `Esta canción ha salido de mezclar una partitura con una grabación del grupo. La voz «${pair.score.name}» son las notas de la partitura colocadas donde se cantan, y la voz «${pair.sung.name}» es lo que un detector de alturas oyó en la grabación (se equivoca a menudo: confunde voces cercanas, octavas y notas de paso).`,
    `Limpia «${pair.sung.name}» con criterio musical: donde la nota que se oye no encaje en la armonía ni tenga sentido como variante cantada, pon la de la partitura; donde la misma diferencia se repita y encaje (una variante que el grupo canta de verdad, un retardo, una nota de paso), déjala como está.`,
    `Devuelve la voz entera en "voices" con targetId "${pair.sung.id}" y EXACTAMENTE los mismos beat y dur de cada nota: cambia solo el nombre de la nota, o quita la nota si sobra. En "reply", cuenta en pocas frases qué has corregido y en qué compases creéis que de verdad cantáis algo distinto de la partitura.`,
    '',
    'DIFERENCIAS (compás, pulso, partitura → lo que se oye):',
    lista || '(ninguna)',
  ].join('\n');
}
