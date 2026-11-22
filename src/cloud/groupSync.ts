import type { Song } from '../model';
import { isNewerFormat, uid } from '../model';
import { getSong, putSynced, saveSong } from '../storage';
import { loadPrefs } from '../account/prefs';
import * as cloud from './cloud';
import { keepLocalMix, sameContent, withNeutralMix } from './mix';

/**
 * Sincronización de las canciones del grupo (antes estaba dentro de `main.ts`; aquí se puede probar con la nube de
 * mentira, scripts/pruebas/32-grupo-sincronizar.js).
 *
 * - Lo que se cambia aquí queda «pendiente de subir» (también en `localStorage`, por si se cierra la app) hasta que el
 *   grupo lo tiene. Si falla (sin cobertura), se reintenta: al volver la conexión, al volver a la app, al arrancar, al
 *   guardar otra vez y cada medio minuto.
 * - Se sube solo si la canción del grupo sigue siendo la versión que se tenía aquí. Si otra persona la ha cambiado
 *   mientras tanto, no se pisa: lo de aquí se guarda como copia «(mis cambios)», se trae la del grupo y se avisa.
 * - Con algo pendiente de subir no se trae la versión del grupo (eso borraba el cambio de aquí): se sube, y si choca,
 *   lo anterior.
 * - Al abrir una canción del grupo, al arrancar y al volver a la app se mira si el grupo tiene una versión más nueva.
 * - La mezcla de ensayo (solo, silencio, ocultar, volumen) no viaja: ver `mix.ts`.
 */
export interface GroupSyncDeps {
  /** La canción abierta (con lo que aún no se haya guardado). */
  current(): Song;
  /** ¿Tiene la abierta cambios sin guardar? */
  isDirty(): boolean;
  /** Guarda ya los cambios sin guardar de la abierta. */
  flush(): void;
  /** Pone en su lugar otra versión de la abierta (ya guardada), sin cortar donde va. */
  replaceCurrent(s: Song): void;
  /** La abierta ha dejado de estar en el grupo: repintar. */
  detached(): void;
  /** Abre otra canción (ya guardada). */
  open(s: Song): void;
  toast(msg: string, error?: boolean, action?: { label: string; run: () => void }): void;
  /** El indicador de la nube junto al nombre de la app. */
  badge(state: 'ok' | 'pending' | 'error' | 'none', title?: string): void;
}

type Nube = Pick<typeof cloud, 'user' | 'pushSong' | 'fetchSong' | 'songStamp' | 'watchGroup'>;
/** La nube. Solo en desarrollo, las pruebas pueden poner una de mentira en memoria (`window.__vocesNube`). */
const nube = (): Nube => (import.meta.env.DEV && (window as unknown as { __vocesNube?: Nube }).__vocesNube) || cloud;
const errName = (e: unknown) => (e as Error | null)?.name;

/**
 * Lo pendiente de subir: id de la canción → cuenta que la cambió ('' si no se sabe). Con la cuenta, si en el mismo
 * dispositivo entra otra persona, no se sube con la suya (fallaría por no ser del grupo y la canción se desligaría).
 */
const PENDING_KEY = 'voces.grupo.pendientes';
function loadPending(): Map<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}');
    // La primera versión guardaba solo la lista de ids (sin cuenta).
    if (Array.isArray(v)) return new Map(v.filter((x) => typeof x === 'string').map((x: string) => [x, '']));
    return new Map(Object.entries(v && typeof v === 'object' ? v : {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return new Map();
  }
}
function savePending() {
  try {
    if (pending.size) localStorage.setItem(PENDING_KEY, JSON.stringify(Object.fromEntries(pending)));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nada */
  }
}

let deps: GroupSyncDeps;
const pending = loadPending();
/** Cuántas veces se ha cambiado cada una: si cambia mientras se sube, sigue pendiente. */
const gen = new Map<string, number>();
let pushTimer: number | undefined;
let retryTimer: number | undefined;
/** La vuelta de subidas en marcha (una cada vez). */
let loop: Promise<void> | null = null;
let again = false;
/** Ha llegado un aviso del grupo durante una subida: al acabar, se mira si hay versión nueva. */
let recheck = false;
/** Falla la subida (sin conexión): el aviso sale una vez, no en cada intento. */
let failing = false;
/** Mientras se pone la versión del grupo en su lugar (no hace falta volver a mirarla). */
let replacing = false;
let unwatch: (() => void) | null = null;
let watched: string | null = null;

export function initGroupSync(d: GroupSyncDeps) {
  deps = d;
  addEventListener('online', () => void retryNow());
}

/** La canción tal como está ahora: si es la abierta, la de la app; si no, la guardada. */
function live(id: string): Song | undefined {
  const cur = deps.current();
  return cur.id === id ? cur : getSong(id);
}

/** ¿Hay cambios de esta canción sin llegar al grupo? */
export function isPending(id: string) {
  return pending.has(id);
}

/** Se acaba de guardar un cambio de una canción del grupo: se sube en un momento (se juntan los seguidos). */
export function markChanged(s: Song) {
  // Una canción de una versión más nueva de la app aquí solo se ve: nunca se sube encima de la del grupo.
  if (!s.groupId || isNewerFormat(s)) return;
  // Se queda con la cuenta que la cambió primero: es la que puede subirla.
  pending.set(s.id, pending.get(s.id) || nube().user()?.id || '');
  gen.set(s.id, (gen.get(s.id) ?? 0) + 1);
  savePending();
  updateBadge();
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void syncGroupNow(), 1500);
}

function drop(id: string) {
  pending.delete(id);
  gen.delete(id);
  savePending();
}

/** Apunta la versión del grupo que ya tiene esta canción (sin contarlo como cambio). */
function stamp(id: string, t: string) {
  const st = getSong(id);
  if (st) {
    st.remoteUpdatedAt = t;
    putSynced(st);
  }
  const cur = deps.current();
  if (cur.id === id) cur.remoteUpdatedAt = t;
}

/** Sube ya todo lo pendiente. Si ya se está subiendo, se repite al acabar. */
export function syncGroupNow(): Promise<void> {
  clearTimeout(pushTimer);
  if (loop) {
    again = true;
    return loop;
  }
  loop = (async () => {
    do {
      again = false;
      await pushPending();
    } while (again);
  })().finally(() => {
    loop = null;
    updateBadge();
    if (recheck) {
      recheck = false;
      void checkGroupSong();
    }
  });
  updateBadge();
  return loop;
}

/** Reintenta lo pendiente y mira si la abierta tiene versión nueva (al volver la conexión o a la app). */
export async function retryNow() {
  if (pending.size) await syncGroupNow();
  await checkGroupSong();
}

/** ¿Lo pendiente de esta canción lo dejó otra cuenta? Entonces se guarda para cuando vuelva a entrar. */
function otherAccount(id: string): boolean {
  const owner = pending.get(id);
  const me = nube().user()?.id;
  return !!owner && !!me && owner !== me;
}

async function pushPending() {
  const n = nube();
  const me = n.user()?.id;
  if (!me) return;
  for (const [id, owner] of [...pending]) {
    if (owner && owner !== me) continue;
    if (!owner) {
      pending.set(id, me);
      savePending();
    }
    const s = getSong(id);
    if (!s?.groupId || isNewerFormat(s)) {
      drop(id);
      continue;
    }
    const g = gen.get(id) ?? 0;
    const before = s.remoteUpdatedAt;
    try {
      const t = await n.pushSong(withNeutralMix(s));
      // Si mientras subía se ha puesto otra versión del grupo («Volver a esta versión»), su marca es la buena.
      if (getSong(id)?.remoteUpdatedAt === before) stamp(id, t);
      // Si se ha vuelto a cambiar mientras subía, sigue pendiente (irá en la siguiente, ya sobre esta versión).
      if ((gen.get(id) ?? 0) === g) drop(id);
      failing = false;
      clearTimeout(retryTimer);
    } catch (e) {
      if (errName(e) === 'RemovedFromGroup') {
        detach(id, 'Esta canción se había quitado del grupo. Sigue guardada en tu dispositivo, con tus cambios.');
        continue;
      }
      if (errName(e) === 'GroupConflict') {
        if (await resolveConflict(id)) continue;
      } else if (!failing) {
        deps.toast(`No se ha podido subir al grupo: ${(e as Error).message}. Se volverá a intentar sola.`, true);
      }
      // Sin conexión (o la del grupo no se ha podido traer): se queda pendiente y se reintenta.
      failing = true;
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void syncGroupNow(), 30_000);
      return;
    }
  }
}

/** Guarda la versión de aquí como canción aparte («(mis cambios)»), fuera del grupo. */
function keepMine(mine: Song): Song {
  const c: Song = JSON.parse(JSON.stringify(mine));
  c.id = uid();
  c.title = `${mine.title} (mis cambios)`;
  delete c.groupId;
  delete c.remoteUpdatedAt;
  delete c.deletedAt;
  delete c.ownerId; // la adopta la cuenta que haya entrado, como cualquier canción nueva
  // La grabación (si la hay) se queda con la canción del grupo: copiarla ocuparía otra vez decenas de MB.
  delete c.audioTrack;
  c.createdAt = c.updatedAt = Date.now();
  saveSong(c);
  return c;
}

/**
 * Otra persona la ha cambiado desde la versión de aquí. Nada se pierde: lo de aquí queda como «(mis cambios)», se trae
 * la del grupo (con la mezcla y la grabación de aquí) y se avisa. Devuelve false si no se ha podido traer.
 */
async function resolveConflict(id: string): Promise<boolean> {
  let theirs: Song;
  try {
    theirs = await nube().fetchSong(id);
  } catch {
    return false;
  }
  // Lo último de aquí, también lo que se haya hecho mientras se traía.
  const cur = deps.current();
  if (cur.id === id && deps.isDirty()) deps.flush();
  const mine = getSong(id);
  drop(id);
  if (!mine) return true;
  keepLocalMix(theirs, live(id));
  // Si dicen lo mismo (p. ej. la subida anterior llegó pero no su respuesta), no hace falta copia.
  const copy = sameContent(mine, theirs) ? null : keepMine(mine);
  saveSong(theirs);
  if (deps.current().id === id) {
    replacing = true;
    try {
      deps.replaceCurrent(theirs);
    } finally {
      replacing = false;
    }
  }
  if (copy)
    deps.toast(
      `Otra persona del grupo cambió «${theirs.title}» a la vez que tú. Ahora tienes su versión; la tuya está a salvo en «${copy.title}».`,
      false,
      { label: 'Abrir la mía', run: () => deps.open(getSong(copy.id) ?? copy) },
    );
  return true;
}

/** Ya no está en el grupo: aquí se queda como canción propia (y no se vuelve a subir). */
function detach(id: string, msg?: string) {
  drop(id);
  const local = live(id);
  if (!local?.groupId) return;
  local.groupId = undefined;
  local.remoteUpdatedAt = undefined;
  saveSong(local);
  if (local === deps.current()) {
    deps.detached();
    if (msg) deps.toast(msg);
  }
}

/**
 * ¿Tiene el grupo una versión más nueva de la abierta? Entonces se trae (si aquí no hay nada sin subir; si lo hay, se
 * sube, y si choca se guardan las dos). Al abrirla, al arrancar, al volver a la app y con cada aviso del grupo.
 */
export async function checkGroupSong(): Promise<void> {
  const cur = deps.current();
  const n = nube();
  if (!cur.groupId || !n.user() || replacing) return;
  if (pending.has(cur.id) || deps.isDirty()) {
    if (deps.isDirty()) deps.flush();
    return void syncGroupNow();
  }
  if (loop) {
    recheck = true;
    return;
  }
  const seen = cur.remoteUpdatedAt;
  let st: Awaited<ReturnType<Nube['songStamp']>>;
  try {
    st = await n.songStamp(cur.id);
  } catch {
    return; // sin conexión: se mirará al volver
  }
  const now = deps.current();
  if (now.id !== cur.id || !now.groupId || pending.has(now.id) || deps.isDirty()) return;
  // Mientras se preguntaba ha empezado o acabado una subida: la respuesta puede ser vieja (o de antes de crearse la
  // fila, y desligaría una canción recién compartida). Se vuelve a mirar con la versión nueva.
  if (loop) {
    recheck = true;
    return;
  }
  if (now.remoteUpdatedAt !== seen) return void checkGroupSong();
  if (!st && !now.remoteUpdatedAt) return markChanged(now); // nunca llegó a subirse (con una versión anterior): se sube
  if (!st || st.deleted_at) {
    if (loadPrefs().groupNotices) return detach(now.id, 'Esta canción se ha quitado del grupo. Sigue guardada en tu dispositivo.');
    return detach(now.id);
  }
  if (st.updated_at === now.remoteUpdatedAt) return;
  const prefs = loadPrefs();
  // Ajustes de cuenta › Avisos: sin «ponerla al día sola», se avisa con un botón para hacerlo.
  if (!prefs.autoUpdate) return void deps.toast('Otra persona del grupo ha cambiado esta canción.', false, { label: 'Ver su versión', run: () => void pullCurrent(true) });
  await pullCurrent(prefs.groupNotices);
}

/** Trae la versión del grupo de la abierta, con la mezcla y la grabación de este dispositivo. */
async function pullCurrent(notice: boolean) {
  const id = deps.current().id;
  let remote: Song;
  try {
    remote = await nube().fetchSong(id);
  } catch {
    return; // sin conexión: se ignora
  }
  const cur = deps.current();
  // Mientras se traía se ha cambiado algo aquí: no se pisa (al subirlo se comprueba si choca).
  if (cur.id !== id || pending.has(id) || deps.isDirty()) return;
  keepLocalMix(remote, cur);
  saveSong(remote);
  replacing = true;
  try {
    deps.replaceCurrent(remote);
  } finally {
    replacing = false;
  }
  if (notice) deps.toast('Canción actualizada por tu grupo.');
}

/**
 * Una versión del grupo que se acaba de descargar (abrirla desde la biblioteca o el panel del grupo), lista para
 * guardarla aquí: con la mezcla y la grabación de este dispositivo. Si aquí hay cambios sin subir, se queda la de aquí y
 * se sube (si choca con la del grupo, se guardan las dos).
 */
export function fromGroup(remote: Song): Song {
  // Lo de la abierta que esperaba su guardado cuenta como cambio de aquí.
  if (deps.current().id === remote.id && deps.isDirty()) deps.flush();
  const local = live(remote.id);
  if (local && pending.has(remote.id)) {
    void syncGroupNow();
    return local;
  }
  return keepLocalMix(remote, local);
}

/**
 * La versión del grupo que se ha elegido a propósito (volver a una versión, recuperarla de la papelera). Si aquí había
 * cambios sin subir distintos, se guardan antes como «(mis cambios)».
 */
export function adoptFromGroup(remote: Song): Song {
  if (deps.current().id === remote.id && deps.isDirty()) deps.flush();
  const local = live(remote.id);
  if (local && pending.has(remote.id)) {
    const mine = getSong(remote.id) ?? local;
    if (!sameContent(mine, remote)) {
      const c = keepMine(mine);
      deps.toast(`Tus cambios sin subir de «${mine.title}» están a salvo en «${c.title}».`);
    }
  }
  drop(remote.id);
  return keepLocalMix(remote, local);
}

// ---------------- Avisos del grupo (tiempo real) ----------------

/** Vigila el grupo de la abierta (y pone el indicador). */
export function watchCurrent() {
  const n = nube();
  const cur = deps.current();
  const g = cur.groupId && n.user() ? cur.groupId : null;
  updateBadge();
  if (g === watched) return;
  unwatch?.();
  watched = g;
  // La nube de mentira de algunas pruebas no tiene avisos.
  unwatch = g && typeof n.watchGroup === 'function' ? n.watchGroup(g, (ev) => void onRemoteChange(ev)) : null;
}

async function onRemoteChange(ev: { type: string; id: string; updated_by?: string | null; updated_at?: string; deleted_at?: string | null }) {
  if (ev.type === 'DELETE' || ev.deleted_at) {
    // Se ha quitado del grupo (a la papelera del grupo, o borrada): aquí se queda como canción propia.
    return detach(ev.id, loadPrefs().groupNotices ? 'Esta canción se ha quitado del grupo. Sigue guardada en tu dispositivo.' : undefined);
  }
  // Con cambios sin subir no se trae nada (borraría lo de aquí): se sube ya y la subida comprueba la versión.
  if (pending.has(ev.id)) return void syncGroupNow();
  const cur = deps.current();
  if (ev.id !== cur.id) return; // las demás se miran al abrirlas
  if (ev.updated_at && ev.updated_at === cur.remoteUpdatedAt) return; // es la que ya tenemos (la nuestra)
  await checkGroupSong();
}

// ---------------- Indicador ----------------

function updateBadge() {
  if (!deps) return;
  const cur = deps.current();
  if (!cur?.groupId) return deps.badge('none');
  if (!nube().user()) return deps.badge('error', 'Sin sincronizar (inicia sesión)');
  if (pending.has(cur.id) && otherAccount(cur.id)) return deps.badge('error', 'Cambios de otra cuenta sin subir al grupo: se subirán cuando vuelva a entrar');
  if (pending.has(cur.id) && failing) return deps.badge('error', 'Cambios sin subir al grupo: se volverá a intentar al recuperar la conexión');
  if (pending.has(cur.id) || loop) return deps.badge('pending', 'Guardando en el grupo…');
  deps.badge('ok', 'Sincronizada con el grupo');
}
