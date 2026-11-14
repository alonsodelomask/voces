// Modelo de datos de la app. Todos los tiempos están en segundos.

export interface Note {
  midi: number;
  start: number;
  dur: number;
  /** Nombre ya escrito con su alteración correcta (p. ej. "F#4"), si se conoce. */
  name?: string;
  /** Si salió de mezclar partitura y grabación: el compás de la partitura (desde 1) del que viene. */
  bar?: number;
  /** La sílaba que se canta en esta nota («cer-» si la palabra sigue; «se‿a» si se unen dos palabras). */
  lyric?: string;
  /** La sílaba se colocó sola (sacando la letra de la grabación) y no está clara: conviene revisarla. */
  lyricDoubt?: boolean;
}

export interface Voice {
  id: string;
  name: string;
  color: string;
  notes: Note[];
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  volume: number; // 0..1
  /**
   * Si es lo que se oye en la grabación (sacado del audio al mezclar): el id de la voz de la partitura a la que
   * corresponde, o '' si no se parecía a ninguna.
   */
  sungOf?: string;
}

export interface ChordMark {
  time: number;
  name: string;
}

/**
 * Grabación que suena junto a las voces. El audio no cabe en el almacén de canciones (un WAV son decenas de MB),
 * así que se guarda aparte en este dispositivo (`audio/track.ts`) y aquí solo queda cómo encaja con la canción.
 */
export interface AudioTrack {
  /** Nombre del archivo original, para mostrarlo. */
  name: string;
  /** Segundo de la grabación guardada que corresponde al instante 0 de la canción (puede ser negativo). */
  offset: number;
  /** Duración de la grabación guardada, en segundos. */
  duration: number;
  volume: number; // 0..1
  muted: boolean;
  solo: boolean;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  beatsPerBar: number;
  /** Armadura en quintas (-7..7); decide si se escriben sostenidos o bemoles. */
  keyFifths: number;
  voices: Voice[];
  chords: ChordMark[];
  /** true = los acordes se calculan a partir de las notas. */
  chordsAuto: boolean;
  createdAt: number;
  updatedAt: number;
  /** Grupo de la nube con el que se comparte (si lo hay). */
  groupId?: string;
  /** Marca de tiempo de la última versión conocida en la nube. */
  remoteUpdatedAt?: string;
  /**
   * Si salió de una grabación (convertida o mezclada): el segundo del archivo en que cae el 0 de la canción (puede ser
   * negativo). Sirve para añadir después otra pista grabada a la vez y que caiga en su sitio.
   */
  audioPhase?: number;
  /** Si salió de mezclar dejando el tono de la partitura: semitonos que la grabación suena por encima de la canción. */
  audioTranspose?: number;
  /** Grabación que suena junto a las voces (el audio está guardado en este dispositivo). */
  audioTrack?: AudioTrack;
  /** Segundo en que empieza cada compás de la partitura (repeticiones desarrolladas), si se sabe. */
  barStarts?: number[];
}

// Colores neón, ordenados de la voz más aguda a la más grave.
export const VOICE_COLORS = [
  '#ff2d6f', // rojo-rosa
  '#e940d6', // magenta
  '#ff8a1f', // naranja
  '#1fd6f2', // cian
  '#9152ff', // violeta
  '#3dff8f', // verde
  '#ffe14d', // amarillo
  '#4d82ff', // azul
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function makeVoice(name: string, index: number, notes: Note[] = []): Voice {
  return {
    id: uid(),
    name,
    color: VOICE_COLORS[index % VOICE_COLORS.length],
    notes,
    muted: false,
    solo: false,
    hidden: false,
    volume: 0.8,
  };
}

export function makeSong(partial: Partial<Song> = {}): Song {
  const now = Date.now();
  return {
    id: uid(),
    title: 'Sin título',
    bpm: 100,
    beatsPerBar: 4,
    keyFifths: 0,
    voices: [],
    chords: [],
    chordsAuto: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function songDuration(song: Song): number {
  let end = 0;
  for (const v of song.voices) {
    for (const n of v.notes) end = Math.max(end, n.start + n.dur);
  }
  return end;
}

/** Dos ataques a menos de esto (en segundos) se cantan a la vez. */
export const AT_ONCE = 0.03;
/** La letra de una voz es copia de la de otra si al menos esta parte de sus sílabas son las de su pareja. */
export const COPIED = 0.9;

/** Las notas en el orden de sus ataques. Casi siempre ya lo están, y entonces es la misma lista. */
export function byStart(notes: Note[]): Note[] {
  for (let i = 1; i < notes.length; i++) if (notes[i].start < notes[i - 1].start) return [...notes].sort((a, b) => a.start - b.start);
  return notes;
}

/**
 * La nota de `notes` (en el orden de sus ataques, `byStart`) que ataca a la vez que `n` (a menos de `AT_ONCE`): la más
 * cercana y, si empatan, la primera. Se busca a saltos (búsqueda binaria): una canción larga tiene miles de notas.
 */
export function onsetPartner(notes: Note[], n: Note): Note | undefined {
  // La primera que ataca después de n.start − AT_ONCE (con un margen por el redondeo: la cuenta exacta va después).
  const desde = n.start - AT_ONCE - 1e-9;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].start <= desde) lo = mid + 1;
    else hi = mid;
  }
  let mejor: Note | undefined;
  for (let i = lo; i < notes.length && notes[i].start < n.start + AT_ONCE + 1e-9; i++) {
    const d = Math.abs(notes[i].start - n.start);
    if (d < AT_ONCE && (!mejor || d < Math.abs(mejor.start - n.start))) mejor = notes[i];
  }
  return mejor;
}

/**
 * Si dos notas llevan la misma sílaba. También si una es la otra sin el guion del final: en una copia, la última sílaba
 * de una palabra que no sigue en esa voz lo pierde («ta-» → «ta»).
 */
export function sameSyllable(a: string | undefined, b: string | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || Math.abs(a.length - b.length) !== 1) return false;
  return a.length > b.length ? a.endsWith('-') && a.startsWith(b) : b.endsWith('-') && b.startsWith(a);
}

/**
 * Si la letra de `v` es copia de la de `of`: al menos `COPIED` de sus sílabas son las de la nota de `of` que ataca a la
 * vez (`onsetPartner`, `sameSyllable`). Sin letra, también (no tiene nada suyo).
 */
export function lyricsCopyOf(v: Voice, of: Voice): boolean {
  const syllables = v.notes.reduce((s, n) => s + (n.lyric ? 1 : 0), 0);
  const notes = byStart(of.notes);
  let differ = 0;
  for (const n of v.notes) {
    if (!n.lyric || sameSyllable(onsetPartner(notes, n)?.lyric, n.lyric)) continue;
    // Ya no llega aunque todas las que quedan sean iguales (el karaoke la pide en cada fotograma).
    if (syllables - ++differ < COPIED * syllables) return false;
  }
  return true;
}

/** Una voz con letra propia que tiene menos de esta parte de las palabras distintas de la que más no lleva la letra
 *  (sus «uh», «dum» o unos ecos), salvo si dice la misma letra que esa en casi tantas notas (un trozo con melismas). */
const FEWER_WORDS = 0.8;
/** Pero la que se oye en la grabación (la melodía que se canta) sí la lleva si dice otra letra que la que más (un
 *  contracanto, otra lengua: `HEARD_OWN`) y tiene al menos esta parte de sus palabras distintas; con menos, son sus «uh»
 *  y «dum» (la grabación se parece a una voz de acompañamiento). */
const HEARD_WORDS = 0.6;
/** Otra letra: al menos estas palabras de dos sílabas o más que la que más no dice. Los «uh», «oh», «ah» o «doo» de una
 *  voz de acompañamiento son de una sílaba: un coro que canta parte de la letra y añade unos «oh» no dice otra letra. */
const HEARD_OWN = 2;

/** Solo las letras, en minúscula y sin tildes («Ción,» → «cion»); se recuerdan, que una canción repite mucho. */
const cleanCache = new Map<string, string>();
function clean(s: string): string {
  let r = cleanCache.get(s);
  if (r === undefined) {
    r = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (cleanCache.size > 20000) cleanCache.clear();
    cleanCache.set(s, r);
  }
  return r;
}

/**
 * Las palabras distintas de la letra de una voz, rehechas de sus sílabas («x-» sigue en la nota siguiente; «‿» separa
 * dos palabras en una nota); de ellas, las de dos sílabas o más (`long`); y cuántas notas canta con letra: las que
 * tienen sílaba y las de en medio de una palabra (un melisma).
 */
function lyricWords(v: Voice): { words: Set<string>; long: Set<string>; sung: number } {
  const words = new Set<string>();
  const long = new Set<string>();
  let w = '';
  /** Las sílabas que lleva `w`. */
  let parts = 0;
  let sung = 0;
  let inWord = false;
  for (const n of byStart(v.notes)) {
    const l = n.lyric?.trim();
    if (!l) {
      if (inWord) sung++;
      continue;
    }
    sung++;
    // Casi siempre es una sílaba sola: solo se parte si lleva «‿» o un espacio.
    const pieces = l.includes('‿') || /\s/u.test(l) ? l.split(/[‿\s]+/u) : [l];
    for (let i = 0; i < pieces.length; i++) {
      const t = pieces[i];
      if (i > 0 && w) {
        addWord(words, long, w, parts);
        w = '';
        parts = 0;
      }
      const goesOn = t.endsWith('-');
      w += clean(goesOn ? t.slice(0, -1) : t);
      parts++;
      if (!goesOn) {
        addWord(words, long, w, parts);
        w = '';
        parts = 0;
      }
    }
    inWord = l.endsWith('-');
  }
  addWord(words, long, w, parts);
  return { words, long, sung };
}

/** Apunta la palabra `w`, de `parts` sílabas, en `words` y, si tiene dos o más, también en `long`. */
function addWord(words: Set<string>, long: Set<string>, w: string, parts: number): void {
  if (!w) return;
  words.add(w);
  if (parts > 1) long.add(w);
}

/** Cuántas palabras de `words` no están en `of`, sin pasar de `max`: no hace falta contarlas todas. */
function wordsNotIn(words: Set<string>, of: Set<string>, max: number): number {
  let n = 0;
  for (const w of words) if (!of.has(w) && ++n >= max) break;
  return n;
}

/** La última respuesta de `lyricsVoice` y de qué datos sale: el karaoke la pide en cada fotograma. */
let lastLyricsVoice: {
  song: Song;
  voices: Voice[];
  /** De cada voz de la canción: su id y de cuál es la voz que se oye. */
  links: (string | undefined)[];
  /** De cada voz entre las que se elige: su id, si es la que se oye, y el ataque y la sílaba de cada nota. */
  ids: string[];
  sungOf: (string | undefined)[];
  starts: number[][];
  lyrics: (string | undefined)[][];
  result: Voice | undefined;
} | null = null;

/** Si `lyricsVoice` daría lo mismo que la última vez: las mismas voces, enlaces, ataques y sílabas. */
function sameInput(m: NonNullable<typeof lastLyricsVoice>, song: Song, voices: Voice[]): boolean {
  if (m.song !== song || m.voices.length !== voices.length || m.links.length !== 2 * song.voices.length) return false;
  for (let i = 0; i < song.voices.length; i++) if (m.links[2 * i] !== song.voices[i].id || m.links[2 * i + 1] !== song.voices[i].sungOf) return false;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const s = m.starts[i];
    const l = m.lyrics[i];
    if (m.voices[i] !== v || v.id !== m.ids[i] || v.sungOf !== m.sungOf[i] || s.length !== v.notes.length) return false;
    for (let j = 0; j < s.length; j++) if (v.notes[j].start !== s[j] || v.notes[j].lyric !== l[j]) return false;
  }
  return true;
}

/**
 * La voz que lleva la letra (la del MIDI y la del karaoke), entre las de la partitura con letra que no sean copia
 * (`lyricsCopyOf`) de otra con más sílabas: así no la lleva una voz de arriba que va al ritmo de la melodía en algunas
 * frases y solo tiene esos trozos. De esas, fuera las que tienen muchas menos palabras distintas que la que más
 * (`FEWER_WORDS`: sus «uh», «dum» o unos ecos), salvo si dicen la misma letra en casi tantas notas (un trozo con
 * melismas) o si es la que se oye en la grabación y dice otra letra (`HEARD_OWN`: palabras de varias sílabas que la otra
 * no dice, no unos «oh») con bastantes palabras (`HEARD_WORDS`: la melodía junto a un contracanto o a otra lengua). Y de
 * las que quedan (una partitura coral, con la letra en cada voz), la que se oye en la grabación, si la hay (`sungOf`: es
 * la melodía que se canta), o si no, la primera. `voices`: entre cuáles se elige (p. ej. las que se ven).
 */
export function lyricsVoice(song: Song, voices: Voice[] = song.voices): Voice | undefined {
  if (lastLyricsVoice && sameInput(lastLyricsVoice, song, voices)) return lastLyricsVoice.result;
  const result = chooseLyricsVoice(song, voices);
  lastLyricsVoice = {
    song,
    voices: [...voices],
    links: song.voices.flatMap((v) => [v.id, v.sungOf]),
    ids: voices.map((v) => v.id),
    sungOf: voices.map((v) => v.sungOf),
    starts: voices.map((v) => v.notes.map((n) => n.start)),
    lyrics: voices.map((v) => v.notes.map((n) => n.lyric)),
    result,
  };
  return result;
}

function chooseLyricsVoice(song: Song, voices: Voice[]): Voice | undefined {
  const score = voices.filter((v) => v.sungOf === undefined);
  const syllables = score.map((v) => v.notes.reduce((s, x) => s + (x.lyric ? 1 : 0), 0));
  const own = score.filter((v, i) => syllables[i] > 0 && !score.some((u, j) => syllables[j] > syllables[i] && lyricsCopyOf(v, u)));
  if (own.length < 2) return own[0];
  const info = own.map(lyricWords);
  const richest = info.reduce((a, b) => (b.words.size > a.words.size ? b : a));
  const heard = new Set(song.voices.map((v) => v.sungOf).filter(Boolean));
  const carry = own.filter((v, i) => {
    const x = info[i];
    if (x.words.size >= FEWER_WORDS * richest.words.size) return true;
    // Con la misma letra (ninguna palabra que la que más no diga), si la canta en casi tantas notas.
    if (wordsNotIn(x.words, richest.words, 1) === 0) return x.sung >= FEWER_WORDS * richest.sung;
    // Con palabras que la que más no dice, solo la que se oye, con bastantes palabras (`HEARD_WORDS`) y si es otra letra
    // (`HEARD_OWN`): no si solo añade unos «oh» o «doo» a parte de la misma.
    return heard.has(v.id) && x.words.size >= HEARD_WORDS * richest.words.size && wordsNotIn(x.long, richest.words, HEARD_OWN) >= HEARD_OWN;
  });
  return carry.find((v) => heard.has(v.id)) ?? carry[0];
}

export function sortNotes(notes: Note[]): void {
  notes.sort((a, b) => a.start - b.start || b.midi - a.midi);
}

/** Ordena las voces de aguda a grave por su altura media y les asigna colores. */
export function orderVoicesByPitch(voices: Voice[], recolor = true): Voice[] {
  const avg = (v: Voice) =>
    v.notes.length ? v.notes.reduce((s, n) => s + n.midi, 0) / v.notes.length : 0;
  const sorted = [...voices].sort((a, b) => avg(b) - avg(a));
  if (recolor) sorted.forEach((v, i) => (v.color = VOICE_COLORS[i % VOICE_COLORS.length]));
  return sorted;
}
