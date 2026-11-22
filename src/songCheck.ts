// Revisión de las canciones que entran en la app: un archivo abierto (.voces.json, MusicXML, MIDI), la versión del
// grupo, la de la cuenta y lo guardado en este dispositivo.
//
// Una canción mal hecha, por un fallo o a propósito (llega por WhatsApp), no debe poder:
// - ejecutar código en la app: un color o un id con HTML dentro acabaría en la pantalla;
// - congelar el visualizador o el editor: tiempos infinitos, notas sin duración, alturas absurdas, un compás de 0 pulsos;
// - romper la app al abrirla: listas que faltan o que no son listas.
// Lo que la app conoce se arregla o se quita. Lo que no conoce se conserva tal cual: puede ser una canción de una
// versión más nueva de Vocify (ver `SONG_FORMAT` en model.ts), y lo que no se entiende no se tira.
// Solo importa el modelo y la mezcla: se prueba con `node --test scripts/cancionRevisada.test.mjs`.
import { sameContent } from './cloud/mix';
import { uid, VOICE_COLORS, type Song } from './model';

/** Ninguna canción dura más que esto (en segundos): una nota más allá es un error, y alargaría la canción sin fin. */
export const MAX_SECONDS = 6 * 3600;
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Los ids que crea la app (`uid`) y los que usan las pruebas: letras, cifras y poco más. Nada de comillas ni `<`. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,100}$/;
/** El nombre ya escrito de una nota («F#4», «Bb3», «C♯5»). */
const NOTE_NAME = /^[A-G](?:#|b|♯|♭|x|𝄪|𝄫){0,2}-?\d$/u;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Un texto (o nada si no lo es), recortado a `max` caracteres. */
const text = (x: unknown, max: number): string | undefined => (typeof x === 'string' ? x.slice(0, max) : undefined);

/** Un color de voz seguro: `#rgb` o `#rrggbb`; si no, el de la paleta que le toca por su sitio. */
export function safeColor(c: unknown, index: number): string {
  return typeof c === 'string' && COLOR.test(c) ? c : VOICE_COLORS[index % VOICE_COLORS.length];
}

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
}

/** Quita el campo si no cumple `ok` (los opcionales: mejor sin él que con algo raro). */
function keepIf(o: Obj, k: string, ok: (x: unknown) => boolean) {
  if (k in o && !ok(o[k])) delete o[k];
}

/** Revisa una nota. Devuelve null si no tiene arreglo (se quita). */
function checkNote(raw: unknown): Obj | null {
  if (!isObj(raw)) return null;
  const n: Obj = { ...raw };
  const midi = n.midi;
  if (!num(midi) || midi < 0 || midi > 127) return null;
  if (!num(n.start) || !num(n.dur) || n.dur <= 0) return null;
  let start: number = n.start;
  let dur: number = n.dur;
  // Una nota que empieza un poco antes del 0 se recorta (puede salir así de una grabación); si acaba antes, sobra.
  if (start < 0) {
    dur += start;
    start = 0;
    if (dur <= 0) return null;
  }
  if (start >= MAX_SECONDS) return null;
  dur = Math.min(dur, MAX_SECONDS - start);
  n.start = start;
  n.dur = dur;
  keepIf(n, 'name', (x) => typeof x === 'string' && NOTE_NAME.test(x));
  keepIf(n, 'bar', (x) => num(x) && Number.isInteger(x) && x >= 1);
  keepIf(n, 'lyric', (x) => typeof x === 'string' && x.length <= 200);
  keepIf(n, 'lyricDoubt', (x) => typeof x === 'boolean');
  return n;
}

function checkVoice(raw: unknown, index: number, seen: Set<string>): Obj | null {
  if (!isObj(raw)) return null;
  const v: Obj = { ...raw };
  // Un id raro o repetido se cambia: con dos voces con el mismo id, la mezcla y el editor se lían.
  if (!isSafeId(v.id) || seen.has(v.id)) v.id = uid();
  seen.add(v.id as string);
  v.name = text(v.name, 100) ?? `Voz ${index + 1}`;
  v.color = safeColor(v.color, index);
  const notes = (Array.isArray(v.notes) ? v.notes : []).map(checkNote).filter((n): n is Obj => !!n);
  // El visualizador busca las notas a saltos (búsqueda binaria): tienen que ir en el orden de sus ataques.
  if (notes.some((n, i) => i > 0 && (n.start as number) < (notes[i - 1].start as number))) notes.sort((a, b) => (a.start as number) - (b.start as number));
  v.notes = notes;
  // La mezcla de ensayo: siempre con valores válidos (la app 1.0 cuenta con estos campos).
  v.muted = v.muted === true;
  v.solo = v.solo === true;
  v.hidden = v.hidden === true;
  v.volume = num(v.volume) ? clamp(v.volume, 0, 1) : 0.8;
  keepIf(v, 'sungOf', (x) => typeof x === 'string' && (x === '' || SAFE_ID.test(x)));
  return v;
}

function checkTrack(raw: unknown): Obj | undefined {
  if (!isObj(raw)) return undefined;
  const t: Obj = { ...raw };
  if (!num(t.offset) || !num(t.duration) || t.duration <= 0) return undefined;
  t.name = text(t.name, 300) ?? 'Grabación';
  t.volume = num(t.volume) ? clamp(t.volume, 0, 1) : 1;
  t.muted = t.muted === true;
  t.solo = t.solo === true;
  return t;
}

/**
 * La canción revisada (una copia: no cambia la que se pasa), o null si no es una canción (no es un objeto). Se puede
 * pasar varias veces: una canción ya revisada sale igual.
 */
export function checkSong(raw: unknown): Song | null {
  if (!isObj(raw)) return null;
  const s: Obj = { ...raw };
  if (!isSafeId(s.id)) s.id = uid();
  s.title = text(s.title, 300) ?? 'Sin título';
  s.bpm = num(s.bpm) && s.bpm > 0 ? clamp(s.bpm, 10, 600) : 100;
  // Un compás de 0 pulsos deja colgado el editor (dibuja sus líneas de compás de 0 en 0).
  s.beatsPerBar = num(s.beatsPerBar) && s.beatsPerBar >= 1 ? clamp(Math.round(s.beatsPerBar), 1, 32) : 4;
  s.keyFifths = num(s.keyFifths) ? clamp(Math.round(s.keyFifths), -7, 7) : 0;
  const seen = new Set<string>();
  s.voices = (Array.isArray(s.voices) ? s.voices : []).map((v, i) => checkVoice(v, i, seen)).filter((v): v is Obj => !!v);
  s.chords = (Array.isArray(s.chords) ? s.chords : [])
    .filter((c): c is Obj => isObj(c) && num(c.time) && c.time >= 0 && c.time < MAX_SECONDS && typeof c.name === 'string' && c.name.length <= 40)
    .map((c) => ({ ...c }));
  s.chordsAuto = s.chordsAuto !== false;
  const now = Date.now();
  if (!num(s.createdAt)) s.createdAt = now;
  if (!num(s.updatedAt)) s.updatedAt = now;
  keepIf(s, 'groupId', isSafeId);
  keepIf(s, 'ownerId', isSafeId);
  keepIf(s, 'remoteUpdatedAt', (x) => typeof x === 'string' && x.length <= 60);
  keepIf(s, 'deletedAt', num);
  keepIf(s, 'audioPhase', num);
  keepIf(s, 'audioTranspose', num);
  keepIf(s, 'barStarts', (x) => Array.isArray(x) && x.every((t) => num(t) && t >= 0 && t < MAX_SECONDS));
  // El número de formato: un entero desde 1. Si no lo es, se quita (sin él cuenta como 1).
  keepIf(s, 'format', (x) => num(x) && Number.isInteger(x) && x >= 1);
  if ('audioTrack' in s) {
    const t = checkTrack(s.audioTrack);
    if (t) s.audioTrack = t;
    else delete s.audioTrack;
  }
  return s as unknown as Song;
}

/** Como `checkSong`, pero si no es una canción avisa con un error (para un archivo que se abre). */
export function checkSongOrFail(raw: unknown): Song {
  const s = isObj(raw) && Array.isArray(raw.voices) ? checkSong(raw) : null;
  if (!s) throw new Error('El archivo no es un proyecto de Vocify.');
  return s;
}

/**
 * Un proyecto (.voces.json) que se abre. Nunca sustituye a una canción que ya está aquí ni a la del grupo o la cuenta:
 * - si dice lo mismo que la de aquí con ese id (`same`), se abre la de aquí y no se guarda nada;
 * - si ese id ya está aquí (también en la papelera) o el archivo viene de un grupo o de una cuenta, se abre como copia
 *   nueva, con otro id y fuera del grupo: un archivo viejo no puede deshacer el trabajo de nadie;
 * - si no, se abre tal cual (pero tampoco va a ningún grupo ni a ninguna cuenta por sí solo), con la fecha del archivo
 *   (`updatedAt`, nunca en el futuro): quien lo abre la guarda sin ponerle la de ahora. Así, si la cuenta ya tiene esa
 *   canción con cambios posteriores (aún sin bajar a este dispositivo), gana la de la cuenta al sincronizar.
 */
export function projectToOpen(file: Song, here: Song | undefined): { song: Song; same: boolean; copy: boolean } {
  // Una de la papelera no cuenta como «la de aquí»: abrir el archivo no la saca de allí, entra como copia.
  if (here && !here.deletedAt && sameContent(here, file)) return { song: here, same: true, copy: false };
  const s: Song = JSON.parse(JSON.stringify(file));
  const copy = !!here || !!s.groupId || !!s.ownerId;
  delete s.groupId;
  delete s.remoteUpdatedAt;
  delete s.ownerId;
  delete s.deletedAt;
  if (copy) {
    s.id = uid();
    if (here) s.title = `${s.title} (copia)`;
    // La grabación está guardada en el dispositivo con el id de la otra: esta copia no la tiene.
    delete s.audioTrack;
    s.createdAt = s.updatedAt = Date.now();
  } else {
    s.updatedAt = Math.min(s.updatedAt || Date.now(), Date.now());
  }
  return { song: s, same: false, copy };
}
