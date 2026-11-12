import type { Song } from './model';

const KEY = 'voces.songs.v1';

export function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Song[]) : [];
  } catch {
    return [];
  }
}

export function saveSong(song: Song): boolean {
  try {
    const all = loadSongs().filter((s) => s.id !== song.id);
    song.updatedAt = Date.now();
    all.unshift(song);
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteSong(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSongs().filter((s) => s.id !== id)));
  } catch {
    /* nada */
  }
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
