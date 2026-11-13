// Modelo de datos de la app. Todos los tiempos están en segundos.

export interface Note {
  midi: number;
  start: number;
  dur: number;
  /** Nombre ya escrito con su alteración correcta (p. ej. "F#4"), si se conoce. */
  name?: string;
  /** Si salió de mezclar partitura y grabación: el compás de la partitura (desde 1) del que viene. */
  bar?: number;
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
  /** Si salió de una grabación: segundos que se recortaron al principio para cuadrar el primer pulso (para añadir otras pistas igual). */
  audioPhase?: number;
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
