import type { Song } from '../model';

/**
 * Lo que la biblioteca necesita saber de cada canción para listarla, buscarla, filtrarla y ordenarla, sin tocar la
 * pantalla (se prueba en `scripts/biblioteca.test.mjs`).
 */

/** Una fila de la biblioteca: una canción de este dispositivo o una del grupo que aún no se ha descargado. */
export interface LibItem {
  id: string;
  title: string;
  /** Nombres de las voces (sin las «🎙» sacadas de la grabación). */
  voices: string[];
  /** Grupo con el que está compartida, si lo está. */
  groupId?: string;
  createdAt: number;
  updatedAt: number;
  /** Tiene grabación guardada (o una voz «🎙» sacada de ella). */
  audio: boolean;
  /** Alguna nota tiene letra. */
  lyrics: boolean;
  /** Texto de la letra, para buscar en ella. */
  lyricText: string;
  /** Del grupo y todavía no está en este dispositivo. */
  remote?: boolean;
  /** Quién la cambió por última vez (canciones del grupo). */
  by?: string;
  /** En la papelera desde… */
  deletedAt?: number;
  song?: Song;
}

const sung = (name: string) => name.startsWith('🎙');

export function itemFromSong(s: Song): LibItem {
  const lyricText = s.voices
    .flatMap((v) => v.notes.map((n) => n.lyric ?? ''))
    .filter(Boolean)
    .join(' ')
    .replace(/[-‿]\s*/g, '');
  return {
    id: s.id,
    title: s.title,
    voices: s.voices.filter((v) => !v.sungOf && !sung(v.name)).map((v) => v.name),
    groupId: s.groupId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    audio: !!s.audioTrack || s.voices.some((v) => v.sungOf !== undefined || sung(v.name)),
    lyrics: lyricText.length > 0,
    lyricText,
    deletedAt: s.deletedAt,
    song: s,
  };
}

export type SortKey = 'updated' | 'title' | 'created';
export interface Query {
  q?: string;
  /** '' = todas; 'local' = solo en este dispositivo; o el id de un grupo. */
  where?: string;
  audio?: boolean;
  lyrics?: boolean;
  sort?: SortKey;
  /** true = de mayor a menor (las más recientes, o Z→A). */
  desc?: boolean;
}

/** Quita tildes y mayúsculas, para buscar «cancion» y encontrar «Canción». */
export const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Busca en el título, en los nombres de las voces y en la letra. Varias palabras: tienen que estar todas. */
export function matches(it: LibItem, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${it.title} ${it.voices.join(' ')} ${it.lyricText}`);
  return words.every((w) => hay.includes(w));
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function applyQuery(items: LibItem[], query: Query): LibItem[] {
  const { q = '', where = '', audio, lyrics, sort = 'updated' } = query;
  const desc = query.desc ?? sort !== 'title';
  const out = items.filter(
    (it) =>
      matches(it, q) &&
      (where === '' || (where === 'local' ? !it.groupId : it.groupId === where)) &&
      (!audio || it.audio) &&
      (!lyrics || it.lyrics),
  );
  const cmp =
    sort === 'title'
      ? (a: LibItem, b: LibItem) => collator.compare(a.title, b.title)
      : sort === 'created'
        ? (a: LibItem, b: LibItem) => a.createdAt - b.createdAt
        : (a: LibItem, b: LibItem) => a.updatedAt - b.updatedAt;
  return out.sort((a, b) => (desc ? -cmp(a, b) : cmp(a, b)) || collator.compare(a.title, b.title));
}

/** «hace 4 días», «ayer», «hace 2 meses», «el año pasado»… */
export function relativeDate(t: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'ahora mismo';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  if (abs < 30 * 86_400) return rtf.format(Math.round(s / (7 * 86_400)), 'week');
  if (abs < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), 'month');
  return rtf.format(Math.round(s / (365 * 86_400)), 'year');
}

/** Días que le quedan en la papelera (como mínimo 0). */
export function daysLeft(deletedAt: number, days: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + days * 86_400_000 - now) / 86_400_000));
}

/**
 * Miniatura de la canción: cada voz como una línea de su color, con la altura de sus notas a lo largo del tiempo.
 * Devuelve trazos SVG en una caja de `w`×`h` (como mucho `max` notas por voz, para que no pese).
 */
export function miniLines(s: Song, w = 64, h = 36, max = 160): { color: string; d: string }[] {
  const voices = s.voices.filter((v) => v.notes.length && !v.hidden);
  if (!voices.length) return [];
  let t0 = Infinity;
  let t1 = -Infinity;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of voices)
    for (const n of v.notes) {
      t0 = Math.min(t0, n.start);
      t1 = Math.max(t1, n.start + n.dur);
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
    }
  const span = Math.max(1e-6, t1 - t0);
  const range = Math.max(6, hi - lo);
  const pad = 3;
  const x = (t: number) => (((t - t0) / span) * (w - 2 * pad) + pad).toFixed(1);
  const y = (m: number) => (h - pad - ((m - lo + (range - (hi - lo)) / 2) / range) * (h - 2 * pad)).toFixed(1);
  return voices.map((v) => {
    const step = Math.max(1, Math.ceil(v.notes.length / max));
    const ns = v.notes.filter((_, i) => i % step === 0);
    let d = '';
    for (const n of ns) d += `M${x(n.start)} ${y(n.midi)}H${x(n.start + n.dur * step)}`;
    return { color: v.color, d };
  });
}
