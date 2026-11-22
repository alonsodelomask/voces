import type { Song } from '../model';
import { isNewerFormat, OWNER_DEVICE_ONLY, uid } from '../model';
import { getTrack, putTrack } from '../audio/track';
import { deleteSong, getSong, onSongDeleted, onSongStored, peekSongs, peekTrash, putSynced, saveSong, setOwner, TRASH_DAYS } from '../storage';
import * as cloud from './cloud';
import { localStamp, planSync, remoteStamp, type Plan } from './syncPlan';
import { keepLocalMix } from './mix';

export { planSync } from './syncPlan';

/**
 * Canciones de la cuenta: las que no están en un grupo se guardan también en la cuenta (tabla `personal_songs`), para
 * verlas en cualquier dispositivo donde se entre con ella.
 *
 * Cada dispositivo sigue trabajando con sus canciones (`storage.ts`) y, con la sesión iniciada, las compara con las de
 * la cuenta: gana lo más reciente según las marcas de tiempo (`updatedAt` y, si está en la papelera, `deletedAt`). Un
 * cambio hecho aquí siempre lleva una marca posterior a la que tenía la canción (`storage.ts`), aunque viniera de un
 * dispositivo con el reloj adelantado. Se sincroniza al entrar, al abrir la app, al volver a ella, al guardar (con una
 * pausa) y cuando otro dispositivo cambia algo (tiempo real).
 *
 * - Las canciones de un grupo no son de la cuenta: ya están en el grupo. Si una canción de la cuenta pasa a un grupo, su
 *   fila se queda vacía y marcada, y los otros dispositivos quitan su copia (la encuentran en el grupo). Si en otro
 *   dispositivo se había cambiado después, esos cambios se guardan en una copia: no se pierden.
 * - Las canciones sin cuenta (`ownerId`) de este dispositivo las adopta la primera cuenta que entra. Las de otra cuenta
 *   (otra persona que usó este dispositivo) no se suben a la tuya.
 * - Borrar del todo una canción en un dispositivo la borra de la cuenta y de los demás dispositivos (aunque sea después,
 *   si no había conexión): en la cuenta queda una «lápida» para que nadie la vuelva a subir.
 * - La grabación (audio) nunca se sube: se queda en el dispositivo donde está, y nunca se pierde por sincronizar.
 */

type Nube = Pick<
  typeof cloud,
  'cloudEnabled' | 'user' | 'personalList' | 'personalFetch' | 'personalPut' | 'personalMoved' | 'personalPurge' | 'personalDrop' | 'watchPersonal' | 'fetchSong'
>;
/** La nube. Solo en desarrollo, las pruebas pueden poner una de mentira en memoria (`window.__vocesNube`). */
const nube = (): Nube => (import.meta.env.DEV && (window as unknown as { __vocesNube?: Nube }).__vocesNube) || cloud;
const ready = () => {
  const n = nube();
  return n.cloudEnabled && typeof n.personalList === 'function' && n.user() ? n.user()! : null;
};

export interface PersonalSyncDeps {
  /** La canción abierta (con lo que aún no se haya guardado). */
  current(): Song;
  /** ¿Tiene cambios sin guardar? Entonces no se cambia por la de la cuenta (al guardarla, ganará la de aquí). */
  isDirty(): boolean;
  /** La canción abierta ha cambiado en otro dispositivo: ponerla al día. */
  replaceCurrent(s: Song): void;
  /** Han cambiado canciones de este dispositivo (para repintar la biblioteca si está abierta). */
  changed(info: { pulled: number; added: number; removed: number; forked: number }): void;
}

const PENDING_KEY = 'voces.cuenta.borradas';
function loadPending(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function savePending(p: Record<string, string[]>) {
  try {
    for (const k of Object.keys(p)) if (!p[k]?.length) delete p[k];
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nada */
  }
}

let deps: PersonalSyncDeps | null = null;
let timer: number | undefined;
let running = false;
let again = false;
let unwatch: (() => void) | null = null;
let watching: string | null = null;
/** Mientras se aplican cambios que llegan de la cuenta, lo que se guarda no se vuelve a subir. */
let applying = false;
/** Una canción con un título o un contenido que la cuenta no admite (no se reintenta en cada vuelta). */
const tooBig = new Set<string>();
const MAX_DATA = 4_900_000;

/** Una canción de este dispositivo que va (o iba) a la cuenta de `me`. */
const mine = (s: Song, me: string) => !s.ownerId || s.ownerId === me;
const silently = <T>(f: () => T): T => {
  applying = true;
  try {
    return f();
  } finally {
    applying = false;
  }
};

export function initPersonalSync(d: PersonalSyncDeps) {
  deps = d;
  onSongStored((s) => {
    const me = ready();
    if (applying || !me || !mine(s, me.id)) return;
    // Sin grupo: a la cuenta. En un grupo y ya subida antes: hay que marcarla en la cuenta como pasada al grupo.
    if (!s.groupId || s.ownerId) schedulePersonalSync(2000);
  });
  onSongDeleted((s) => {
    if (applying || s.groupId || !s.ownerId) return; // nunca subida (o del grupo): en la cuenta no hay nada
    const p = loadPending();
    p[s.ownerId] = [...new Set([...(p[s.ownerId] ?? []), s.id])];
    savePending(p);
    if (ready()?.id === s.ownerId) schedulePersonalSync(1000);
  });
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedulePersonalSync(500);
    });
  if (typeof window !== 'undefined') window.addEventListener('online', () => schedulePersonalSync(500));
}

/** Con sesión: escucha los cambios de la cuenta y sincroniza ya. Sin sesión: deja de escuchar. */
export function personalAuthChanged() {
  const me = ready();
  if ((me?.id ?? null) !== watching) {
    unwatch?.();
    unwatch = null;
    watching = me?.id ?? null;
    if (me) unwatch = nube().watchPersonal(me.id, () => schedulePersonalSync(800));
  }
  if (me) void syncPersonal();
}

export function schedulePersonalSync(ms = 1500) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncPersonal(), ms);
}

/** Lo que se hizo en la última sincronización (para las pruebas y para depurar). */
export let lastSync: { at: number; plan: Plan | null; errors: string[] } | null = null;

/** Copia de una canción con otro id (y su grabación, si está en este dispositivo), lista para ir a la cuenta. */
async function copyOf(s: Song, me: string): Promise<Song> {
  const c: Song = JSON.parse(JSON.stringify(s));
  c.id = uid();
  c.title = `${s.title} (copia)`;
  delete c.groupId;
  delete c.remoteUpdatedAt;
  delete c.deletedAt;
  c.ownerId = me;
  c.createdAt = Date.now();
  if (s.audioTrack) {
    try {
      const wav = await getTrack(s.id);
      if (wav) await putTrack(c.id, wav);
      else delete c.audioTrack;
    } catch {
      delete c.audioTrack;
    }
  }
  return c;
}

/** Compara este dispositivo con la cuenta y deja los dos al día. Si ya hay una en marcha, se repite al acabar. */
export async function syncPersonal(): Promise<void> {
  const me = ready();
  if (!me || !deps) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  const n = nube();
  const owner = me.id;
  const errors: string[] = [];
  let pulled = 0;
  let added = 0;
  let removed = 0;
  let forked = 0;
  let plan: Plan | null = null;
  /** Cada paso por separado: si uno falla (sin conexión, una canción rara), los demás siguen. */
  const step = async (name: string, f: () => Promise<void>) => {
    if (ready()?.id !== owner) throw new Error('Ha cambiado la sesión.');
    try {
      await f();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      console.warn(`[voces] canciones de la cuenta (${name})`, e);
    }
  };
  const isCurrent = (id: string) => deps!.current().id === id;
  try {
    const remote = await n.personalList(owner);
    const pending = new Set(loadPending()[owner] ?? []);
    const local = [...peekSongs(), ...peekTrash()];
    const p = planSync(local, remote, owner, pending, Date.now(), TRASH_DAYS);
    plan = p;
    const R = new Map(remote.map((r) => [r.id, r]));
    /** ¿Sigue aquí igual que cuando se planificó (o más antigua que la de la cuenta)? Si no, se deja para la próxima. */
    const notNewer = (id: string) => {
      const here = getSong(id);
      const r = R.get(id);
      return !!here && !!r && localStamp(here) <= remoteStamp(r);
    };

    // Traer: solo si aquí no ha cambiado mientras tanto, sin pisar la canción abierta con cambios sin guardar y sin
    // resucitar lo que se haya borrado aquí mientras tanto.
    if (p.pull.length)
      await step('traer', async () => {
        const got = await n.personalFetch(owner, p.pull);
        const nowPending = new Set(loadPending()[owner] ?? []);
        silently(() => {
          for (const { id, data } of got) {
            const r = R.get(id);
            if (!r || !data || nowPending.has(id)) continue;
            const here = getSong(id);
            if (here && (localStamp(here) > remoteStamp(r) || !mine(here, owner) || here.groupId)) continue;
            if (!here && p.pull.includes(id) && local.some((l) => l.id === id)) continue; // borrada aquí mientras tanto
            if (isCurrent(id) && deps!.isDirty()) continue;
            const song: Song = { ...data, id, ownerId: owner, updatedAt: r.song_updated_ms };
            delete song.deletedAt;
            delete song.groupId;
            delete song.remoteUpdatedAt;
            if (r.song_deleted_ms) song.deletedAt = r.song_deleted_ms;
            // La grabación es de este dispositivo: se conserva la de aquí (si la hay) y no se trae ninguna.
            delete song.audioTrack;
            if (here?.audioTrack) song.audioTrack = here.audioTrack;
            putSynced(song);
            pulled++;
            if (!here && !song.deletedAt) added++;
            if (isCurrent(id) && !song.deletedAt) deps!.replaceCurrent(getSong(id)!);
          }
        });
      });

    // Pasadas a un grupo aquí. Si la de la cuenta era más nueva (cambiada en otro dispositivo), antes se guarda una copia.
    if (p.moveRemote.length)
      await step('pasar al grupo', async () => {
        // Primero se leen (después de marcarlas ya no tienen datos) y las copias se guardan solo si se ha podido marcar:
        // si falla, en la próxima vuelta se repite todo sin dejar copias de más.
        const rescue = p.moveRemote.filter((m) => m.rescue).map((m) => m.id);
        const got = rescue.length ? await n.personalFetch(owner, rescue) : [];
        await n.personalMoved(owner, p.moveRemote);
        for (const { id, data } of got) {
          const c = await copyOf({ ...data, id, audioTrack: undefined }, owner);
          c.updatedAt = Date.now();
          saveSong(c); // nueva: irá a la cuenta en la próxima vuelta
          forked++;
        }
      });

    // Pasadas a un grupo en otro dispositivo, con cambios de aquí posteriores: esos cambios se guardan en una copia.
    for (const id of p.forkLocal)
      await step('copia', async () => {
        const s = getSong(id);
        if (!s || isCurrent(id)) return;
        const c = await copyOf(s, owner);
        c.updatedAt = Date.now();
        saveSong(c);
        silently(() => deleteSong(id, { silent: true }));
        forked++;
      });

    // Pasadas a un grupo en otro dispositivo, sin cambios aquí: la copia de aquí sobra (está en el grupo). Si tiene
    // grabación, se cambia por la del grupo conservando la grabación (que solo está aquí).
    for (const id of p.removeLocal)
      await step('quitar', async () => {
        if (isCurrent(id) || !notNewer(id)) return;
        const s = getSong(id)!;
        if (s.audioTrack) {
          // Con la grabación y la mezcla de ensayo de aquí (no viajan al grupo).
          const g = keepLocalMix(await n.fetchSong(id), s);
          silently(() => putSynced(g));
        } else silently(() => deleteSong(id, { silent: true }));
        removed++;
      });

    // Borradas del todo en otro dispositivo. Con grabación (que solo está aquí) no se borra: va a la papelera de aquí,
    // solo de este dispositivo, y se puede recuperar durante 30 días.
    for (const id of p.purgeLocal)
      await step('borrar aquí', async () => {
        if (isCurrent(id) || !notNewer(id)) return;
        const s = getSong(id)!;
        if (s.audioTrack) silently(() => putSynced({ ...s, ownerId: OWNER_DEVICE_ONLY, deletedAt: s.deletedAt ?? Date.now() }));
        else silently(() => deleteSong(id, { silent: true }));
        removed++;
      });

    // Subir lo de aquí (lo guardado ahora mismo; si se vuelve a cambiar, irá en la siguiente).
    const puts: cloud.PersonalPut[] = [];
    for (const id of p.push) {
      const s = getSong(id);
      if (!s || s.groupId || !mine(s, owner)) continue;
      // De una versión más nueva de la app: aquí solo se ve, y no se sube encima de lo que haya en la cuenta.
      if (isNewerFormat(s)) continue;
      const data: Song = { ...s };
      delete data.audioTrack;
      delete data.remoteUpdatedAt;
      delete data.ownerId;
      delete data.deletedAt;
      delete data.groupId;
      const title = (s.title ?? '').slice(0, 300);
      if (JSON.stringify(data).length > MAX_DATA) {
        if (!tooBig.has(id)) console.warn(`[voces] «${title}» es demasiado grande para guardarla en la cuenta`);
        tooBig.add(id);
        continue;
      }
      puts.push({ id, title, data, song_updated_ms: s.updatedAt || 0, song_deleted_ms: s.deletedAt ?? null });
    }
    if (puts.length)
      await step('subir', async () => {
        await n.personalPut(owner, puts);
        silently(() => puts.forEach((x) => setOwner(x.id, owner)));
      });
    if (p.adopt.length) silently(() => p.adopt.forEach((id) => setOwner(id, owner)));

    // Borradas del todo aquí (o viejas en la papelera): lápidas en la cuenta. Y fuera las lápidas viejas.
    if (p.purgeRemote.length)
      await step('borrar en la cuenta', async () => {
        // La lápida, siempre posterior a lo que había en la cuenta (aunque esa marca viniera de un reloj adelantado).
        const stamp = Math.max(Date.now(), ...p.purgeRemote.map((id) => (R.get(id) ? remoteStamp(R.get(id)!) + 1 : 0)));
        await n.personalPurge(owner, p.purgeRemote, stamp);
        // Las borradas que había al empezar ya están resueltas; las de mientras tanto, para la siguiente.
        const left = loadPending();
        left[owner] = (left[owner] ?? []).filter((id) => !pending.has(id));
        savePending(left);
      });
    else if (pending.size) {
      // Pendientes que no hacía falta borrar en la cuenta (nunca llegaron, o vuelven a estar aquí): se olvidan.
      const left = loadPending();
      left[owner] = (left[owner] ?? []).filter((id) => !pending.has(id));
      savePending(left);
    }
    if (p.dropRemote.length) await step('lápidas', () => n.personalDrop(owner, p.dropRemote));

    if (pulled || removed || forked) deps.changed({ pulled, added, removed, forked });
  } catch (e) {
    errors.push((e as Error).message);
    console.warn('[voces] no se han podido sincronizar las canciones de la cuenta', e);
  } finally {
    lastSync = { at: Date.now(), plan, errors };
    running = false;
    if (again) {
      again = false;
      schedulePersonalSync(300);
    }
  }
}
