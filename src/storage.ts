import type { Song } from './model';
import { OWNER_DEVICE_ONLY } from './model';

/**
 * Las canciones de este dispositivo.
 *
 * Antes iban todas juntas en `localStorage` (un solo bloque de texto, con un límite de unos 5 MB que con unas cuantas
 * canciones largas se llena). Ahora van en IndexedDB, **una canción por registro**, y la app trabaja con una copia en
 * memoria: `loadSongs()` y `saveSong()` siguen siendo instantáneas y la escritura en disco va detrás, en orden.
 * Como antes, lo que se guarda es una foto de la canción en ese momento y lo que se lee son copias: cambiar una canción
 * abierta no cambia lo guardado hasta que se guarda.
 * Al arrancar, `initStorage()` lee lo guardado y, la primera vez, trae lo que hubiera en `localStorage`.
 * Si IndexedDB no está disponible (algún modo privado), se sigue usando `localStorage` como antes.
 *
 * Borrar una canción la manda a la **papelera** (`deletedAt`): no sale en la biblioteca, pero se puede recuperar
 * durante `TRASH_DAYS` días; después se borra de verdad (`purgeOldTrash`).
 */

const KEY = 'voces.songs.v1';
const MIGRATED = 'voces.songs.trasladadas';
const BACKUP = 'voces.songs.v1.copia';
const DB = 'voces.canciones';
const STORE = 'canciones';
export const TRASH_DAYS = 30;

let cache: Song[] = [];
let ready = false;
let mode: 'idb' | 'local' = 'local';
let chain: Promise<unknown> = Promise.resolve();
const errorListeners = new Set<(e: Error) => void>();

/** Avisa si una escritura en disco falla (disco lleno, permisos…). */
export function onStorageError(f: (e: Error) => void) {
  errorListeners.add(f);
}
function fail(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.warn('[voces] no se ha podido guardar la canción', err);
  errorListeners.forEach((f) => f(err));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Sin IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se ha podido abrir el almacén de canciones.'));
    req.onblocked = () => reject(new Error('El almacén de canciones está bloqueado por otra pestaña.'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().then((d) => {
      // Otra pestaña con una versión nueva de la base: se cierra esta conexión para no bloquearla.
      d.onversionchange = () => {
        d.close();
        dbPromise = null;
      };
      return d;
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(m: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = d.transaction(STORE, m);
        let result: T | undefined;
        const req = fn(t.objectStore(STORE));
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('Error al guardar la canción.'));
        t.onabort = () => reject(t.error ?? new Error('Se ha cancelado el guardado de la canción.'));
      }),
  );
}

function readLocal(): Song[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Song[]) : [];
  } catch {
    return [];
  }
}
function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

/** Una copia que no comparte nada con la de la app: lo que se guarda en disco es lo de este momento. */
const snapshot = (s: Song): Song => JSON.parse(JSON.stringify(s)) as Song;

/** Pone en cola una escritura (se hacen de una en una y en orden). */
function queue(fn: () => Promise<unknown>) {
  chain = chain.then(fn).catch(fail);
  return chain;
}

/**
 * Lo que aún no se ha terminado de escribir en IndexedDB. Si la página se cierra justo después de un cambio, puede que
 * esa escritura no acabe: al cerrarse (`pagehide`) se apunta en `localStorage`, que es inmediato, y al volver a abrir
 * `applyPending` lo pasa a IndexedDB si es más nuevo que lo guardado.
 */
const PENDING = 'voces.songs.pendientes';
const pending = new Map<string, Song>();
function savePending() {
  if (!pending.size) return;
  try {
    localStorage.setItem(PENDING, JSON.stringify([...pending.values()]));
  } catch {
    /* no cabe: se queda lo que se haya llegado a escribir */
  }
}
async function applyPending() {
  let list: Song[] = [];
  try {
    list = JSON.parse(localStorage.getItem(PENDING) ?? '[]') as Song[];
  } catch {
    /* nada */
  }
  const newer = list.filter((p) => p && typeof p.id === 'string' && !(cache.find((s) => s.id === p.id)?.updatedAt! >= p.updatedAt));
  if (newer.length) {
    await tx('readwrite', (s) => void newer.forEach((x) => s.put(x)));
    cache = [...newer, ...cache.filter((s) => !newer.some((p) => p.id === s.id))];
  }
  localStorage.removeItem(PENDING);
}

/**
 * Lee las canciones guardadas. Llamar una vez al arrancar, antes de usar el resto. La primera vez con IndexedDB, trae
 * las de `localStorage` y, cuando están todas escritas y comprobadas, las quita de allí.
 */
export async function initStorage(): Promise<void> {
  if (ready) return;
  try {
    const stored = ((await tx<Song[]>('readonly', (s) => s.getAll())) ?? []) as Song[];
    mode = 'idb';
    const old = readLocal();
    if (old.length) {
      // Lo que ya esté en IndexedDB manda (es más nuevo): solo se traen las que falten.
      const have = new Set(stored.map((s) => s.id));
      const missing = old.filter((s) => s && typeof s.id === 'string' && !have.has(s.id));
      if (missing.length) await tx('readwrite', (s) => void missing.forEach((x) => s.put(x)));
      const after = ((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []).map(String);
      const all = new Set(after);
      if (old.every((s) => all.has(s.id))) {
        // La copia de antes se guarda aparte unos días, por si algo hubiera salido mal; ya no se escribe en ella.
        localStorage.setItem(BACKUP, localStorage.getItem(KEY) ?? '[]');
        localStorage.removeItem(KEY);
        localStorage.setItem(MIGRATED, String(Date.now()));
      }
      cache = [...stored, ...missing];
    } else cache = stored;
    await applyPending();
    addEventListener('pagehide', savePending);
    // La copia de antes del traslado se quita pasados los días de la papelera.
    const when = Number(localStorage.getItem(MIGRATED));
    if (localStorage.getItem(BACKUP) && when && Date.now() - when > TRASH_DAYS * 86_400_000) localStorage.removeItem(BACKUP);
  } catch (e) {
    console.warn('[voces] IndexedDB no disponible; las canciones se guardan como antes', e);
    mode = 'local';
    cache = readLocal();
  }
  cache.sort((a, b) => b.updatedAt - a.updatedAt);
  ready = true;
}

/** Para las pruebas: espera a que todo lo pendiente esté escrito. */
export function flushStorage(): Promise<unknown> {
  return chain;
}

/** Las canciones de la biblioteca (sin las de la papelera), de la más reciente a la más antigua. */
export function loadSongs(): Song[] {
  return cache.filter((s) => !s.deletedAt).map(snapshot);
}

/** Las de la papelera, de la última borrada a la primera. */
export function loadTrash(): Song[] {
  return cache
    .filter((s) => s.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
    .map(snapshot);
}

/**
 * Para listar sin copiar (la biblioteca, con muchas canciones, en cada tecla del buscador): lo guardado tal cual.
 * **No se debe modificar** lo que devuelve; para cambiar una canción, `getSong` y `saveSong`.
 */
export function peekSongs(): readonly Song[] {
  return cache.filter((s) => !s.deletedAt);
}
export function peekTrash(): readonly Song[] {
  return cache.filter((s) => s.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** Todos los ids guardados, también los de la papelera (sus grabaciones no se deben borrar). */
export function allSongIds(): Set<string> {
  return new Set(cache.map((s) => s.id));
}

export function getSong(id: string): Song | undefined {
  const s = cache.find((x) => x.id === id);
  return s && snapshot(s);
}

// Quien sincroniza con la cuenta (cloud/personalSync.ts) se entera de lo que cambia aquí.
const storedListeners = new Set<(s: Song) => void>();
const deletedListeners = new Set<(s: Song) => void>();
/** Avisa cada vez que se guarda, se manda a la papelera o se recupera una canción (no con `putSynced`/`setOwner`). */
export function onSongStored(f: (s: Song) => void) {
  storedListeners.add(f);
}
/** Avisa cuando una canción se borra del todo (no con `deleteSong(id, { silent: true })`). */
export function onSongDeleted(f: (s: Song) => void) {
  deletedListeners.add(f);
}
const tell = (set: Set<(s: Song) => void>, s: Song) =>
  set.forEach((f) => {
    try {
      f(s);
    } catch (e) {
      console.warn('[voces]', e);
    }
  });

/** Guarda la foto `copy` (que ya no se toca desde fuera) y la pone la primera (o en su sitio, con `inPlace`). */
function store(copy: Song, inPlace = false): boolean {
  const i = inPlace ? cache.findIndex((s) => s.id === copy.id) : -1;
  if (i >= 0) cache = cache.map((s, j) => (j === i ? copy : s));
  else cache = [copy, ...cache.filter((s) => s.id !== copy.id)];
  if (mode === 'local') return writeLocal();
  pending.set(copy.id, copy);
  void queue(async () => {
    await tx('readwrite', (s) => s.put(copy));
    if (pending.get(copy.id) === copy) pending.delete(copy.id);
  });
  return true;
}

/** Guarda una canción (y la pone la primera: es la más reciente). Devuelve false si no ha cabido. */
/**
 * La marca de un cambio: ahora, pero siempre después de la marca que ya tenía la canción. Así un cambio hecho aquí gana
 * aunque la versión anterior viniera de otro dispositivo con el reloj adelantado (canciones de la cuenta).
 */
function nextStamp(id: string, also = 0): number {
  const prev = cache.find((s) => s.id === id);
  return Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1, (prev?.deletedAt ?? 0) + 1, also + 1);
}

export function saveSong(song: Song): boolean {
  song.updatedAt = nextStamp(song.id, song.updatedAt);
  // Una canción abierta nunca está en la papelera: guardarla la saca de allí si lo estaba.
  delete song.deletedAt;
  const copy = snapshot(song);
  const ok = store(copy);
  tell(storedListeners, copy);
  return ok;
}

/**
 * Para la sincronización con la cuenta: guarda la canción tal como llega (sin tocar sus marcas de tiempo, que son las
 * del dispositivo donde se cambió) y sin avisar a `onSongStored`, para no volver a subirla.
 */
export function putSynced(song: Song): boolean {
  return store(snapshot(song), true);
}

/** Apunta de qué cuenta es una canción (sin cambiar sus marcas de tiempo ni su sitio en la lista). */
export function setOwner(id: string, ownerId: string) {
  const s = cache.find((x) => x.id === id);
  if (!s || s.ownerId === ownerId) return;
  store({ ...s, ownerId }, true);
}

/** Manda una canción a la papelera. La grabación se queda: si se recupera, vuelve con ella. */
export function trashSong(id: string) {
  const s = cache.find((x) => x.id === id);
  if (!s) return;
  const copy = { ...s, deletedAt: nextStamp(id) };
  store(copy);
  tell(storedListeners, copy);
}

/** La saca de la papelera tal como estaba (la pone la primera de la biblioteca). */
export function restoreSong(id: string) {
  const s = cache.find((x) => x.id === id);
  if (!s) return;
  const back = { ...s, updatedAt: nextStamp(id) };
  delete back.deletedAt;
  if (back.ownerId === OWNER_DEVICE_ONLY) delete back.ownerId; // vuelve a ser normal (y a la cuenta)
  store(back);
  tell(storedListeners, back);
}

/** Borra una canción del todo (la grabación se borra aparte, con `delTrack`). */
export function deleteSong(id: string, opts: { silent?: boolean } = {}) {
  const gone = cache.find((s) => s.id === id);
  cache = cache.filter((s) => s.id !== id);
  pending.delete(id);
  if (mode === 'local') writeLocal();
  else void queue(() => tx('readwrite', (s) => s.delete(id)));
  if (gone && !opts.silent) tell(deletedListeners, gone);
}

/** Borra del todo lo que lleva en la papelera más de `TRASH_DAYS` días. Devuelve sus ids. */
export function purgeOldTrash(now = Date.now()): string[] {
  const limit = now - TRASH_DAYS * 86_400_000;
  const old = cache.filter((s) => s.deletedAt && s.deletedAt < limit).map((s) => s.id);
  old.forEach((id) => deleteSong(id));
  return old;
}

const LAST = 'voces.last';
export function setLast(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* nada */
  }
}
export function getLast(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
