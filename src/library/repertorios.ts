/**
 * Repertorios: listas ordenadas de canciones («Concierto de Navidad», «Ensayo del jueves»). Son de este dispositivo y
 * ocupan muy poco (solo nombres e ids), así que van en `localStorage`. Una canción puede estar en varios.
 */

export interface Repertorio {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

const KEY = 'voces.repertorios.v1';

export function loadRepertorios(): Repertorio[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Repertorio[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.songIds)) : [];
  } catch {
    return [];
  }
}

function write(list: Repertorio[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function update(id: string, fn: (r: Repertorio) => void): Repertorio | null {
  const list = loadRepertorios();
  const r = list.find((x) => x.id === id);
  if (!r) return null;
  fn(r);
  r.updatedAt = Date.now();
  write(list);
  return r;
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function createRepertorio(name: string, songIds: string[] = []): Repertorio {
  const now = Date.now();
  const r: Repertorio = { id: newId(), name: name.trim() || 'Repertorio', songIds: [...new Set(songIds)], createdAt: now, updatedAt: now };
  write([...loadRepertorios(), r]);
  return r;
}

export function renameRepertorio(id: string, name: string) {
  return update(id, (r) => (r.name = name.trim() || r.name));
}

export function deleteRepertorio(id: string) {
  write(loadRepertorios().filter((r) => r.id !== id));
}

/** Añade canciones al final (las que ya estaban no se repiten). Devuelve cuántas se han añadido. */
export function addToRepertorio(id: string, songIds: string[]): number {
  let added = 0;
  update(id, (r) => {
    for (const s of songIds)
      if (!r.songIds.includes(s)) {
        r.songIds.push(s);
        added++;
      }
  });
  return added;
}

export function removeFromRepertorio(id: string, songIds: string[]) {
  return update(id, (r) => (r.songIds = r.songIds.filter((s) => !songIds.includes(s))));
}

/** Sube (-1) o baja (+1) una canción un puesto. */
export function moveInRepertorio(id: string, songId: string, dir: -1 | 1) {
  return update(id, (r) => {
    const i = r.songIds.indexOf(songId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= r.songIds.length) return;
    [r.songIds[i], r.songIds[j]] = [r.songIds[j], r.songIds[i]];
  });
}

/** Una canción borrada del todo deja de estar en los repertorios. */
export function forgetSong(songIds: string[]) {
  const list = loadRepertorios();
  let changed = false;
  for (const r of list) {
    const before = r.songIds.length;
    r.songIds = r.songIds.filter((s) => !songIds.includes(s));
    if (r.songIds.length !== before) changed = true;
  }
  if (changed) write(list);
}
