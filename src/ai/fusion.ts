// Limpieza de una canción que ha salido de mezclar partitura y grabación.
// La voz «🎙 X» es lo que el detector oyó de X en la grabación, y la voz X es la partitura ya colocada.
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

/** Nombre que tenían antes estas voces («Como se canta (Tenor)»): las canciones ya hechas lo siguen llevando. */
const ANTIGUO = /^Como se canta(?: \((.+)\))?$/;

/** ¿Es una voz sacada de la grabación al mezclar (corresponda o no a una voz de la partitura)? */
export const isSung = (v: Voice) => v.sungOf !== undefined || ANTIGUO.test(v.name);

const mediana = (v: Voice) => {
  const m = v.notes.map((n) => n.midi).sort((a, b) => a - b);
  return m.length ? m[m.length >> 1] : NaN;
};

/** La voz de la partitura a la que corresponde una voz sacada de la grabación (o null si no corresponde a ninguna). */
export function sungSource(song: Song, v: Voice): Voice | null {
  if (v.sungOf !== undefined) return (v.sungOf && song.voices.find((x) => x !== v && x.id === v.sungOf)) || null;
  const m = v.name.match(ANTIGUO);
  if (!m?.[1]) return null; // «Como se canta» a secas: en la versión anterior no se parecía a ninguna voz
  const porNombre = song.voices.find((x) => x !== v && !isSung(x) && x.name === m[1]);
  if (porNombre) return porNombre;
  // Solo si esa voz se renombró: la versión anterior la ponía justo detrás de ella, y cantan en la misma zona.
  // Si se borró, la de delante es otra y no hay que enlazarla.
  const prev = song.voices[song.voices.indexOf(v) - 1];
  return prev && !isSung(prev) && prev.notes.length && v.notes.length && Math.abs(mediana(prev) - mediana(v)) <= 5 ? prev : null;
}

/**
 * Pone al día una canción mezclada con una versión anterior: «Como se canta (Tenor)» pasa a «🎙 Tenor» y queda
 * enlazada a «Tenor» (o suelta, si no se sabe con seguridad cuál era). También arregla los enlaces que apunten a una
 * voz que ya no existe. Devuelve true si ha cambiado algo.
 */
export function migrateSungVoices(song: Song): boolean {
  let cambia = false;
  for (const v of song.voices) {
    if (v.sungOf !== undefined) {
      if (v.sungOf && !song.voices.some((x) => x !== v && x.id === v.sungOf)) {
        const x = song.voices.find((o) => !isSung(o) && `🎙 ${o.name}` === v.name);
        v.sungOf = x ? x.id : '';
        cambia = true;
      }
      continue;
    }
    const m = v.name.match(ANTIGUO);
    if (!m) continue;
    const src = sungSource(song, v);
    v.sungOf = src?.id ?? '';
    v.name = src ? `🎙 ${src.name}` : m[1] ? `🎙 ${m[1]}` : '🎙 Grabación';
    cambia = true;
  }
  return cambia;
}

/** Busca en la canción la pareja «lo que se oye» / «lo que pone la partitura». */
export function findFusion(song: Song): FusionPair | null {
  for (const sung of song.voices) {
    const score = sungSource(song, sung);
    if (score && score !== sung && score.notes.length) return { sung, score };
  }
  return null;
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
    // Si viene de una mezcla, el compás de la partitura (el mismo en cada vuelta); si no, el de la canción.
    return { sung: n, score, semis: score ? n.midi - score.midi : 0, bar: score?.bar ?? bar(n.start) };
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
