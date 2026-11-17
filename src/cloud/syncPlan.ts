/** Qué hacer para dejar al día las canciones de un dispositivo y las de la cuenta (ver `personalSync.ts`). */

/** Lo que el planificador necesita de cada canción del dispositivo. */
export interface LocalLite {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  groupId?: string;
  ownerId?: string;
}
/** Lo que el planificador necesita de cada fila de la cuenta. */
export interface RemoteLite {
  id: string;
  song_updated_ms: number;
  song_deleted_ms: number | null;
  moved_to_group: string | null;
  /** Borrada del todo en algún dispositivo (una «lápida», sin datos). */
  purged?: boolean;
}
export interface Plan {
  /** Subir: aquí es más reciente o no está en la cuenta. */
  push: string[];
  /** Traer: en la cuenta es más reciente o aquí no está. */
  pull: string[];
  /** Ya estaban en la cuenta y al día, pero aquí aún sin dueña: apuntar que son de esta cuenta. */
  adopt: string[];
  /**
   * Han pasado a un grupo en este dispositivo: marcarlas así en la cuenta. `rescue`: la de la cuenta es más nueva que la
   * de aquí (se cambió en otro dispositivo): se guarda antes como copia, para no perder esos cambios.
   */
  moveRemote: { id: string; group: string; stamp: number; rescue: boolean }[];
  /** Han pasado a un grupo en otro dispositivo y la copia de aquí no es más nueva: sobra aquí (está en el grupo). */
  removeLocal: string[];
  /** Han pasado a un grupo en otro dispositivo, pero aquí se cambiaron después: esos cambios se quedan en una copia. */
  forkLocal: string[];
  /** Se borraron del todo en otro dispositivo y aquí no se han cambiado después: se borran también aquí. */
  purgeLocal: string[];
  /** Dejar en la cuenta como borradas del todo: se borraron aquí, o llevan en la papelera más de `trashDays` días. */
  purgeRemote: string[];
  /** Lápidas viejas (más de `tombstoneDays` días): ya se pueden quitar de la cuenta. */
  dropRemote: string[];
}

/** La marca de una canción: su último cambio, o cuándo fue a la papelera si fue después. */
export const localStamp = (s: Pick<LocalLite, 'updatedAt' | 'deletedAt'>) => Math.max(s.updatedAt || 0, s.deletedAt ?? 0);
export const remoteStamp = (r: Pick<RemoteLite, 'song_updated_ms' | 'song_deleted_ms'>) => Math.max(r.song_updated_ms || 0, r.song_deleted_ms ?? 0);

const DAY = 86_400_000;

/**
 * Decide qué hacer con cada canción. Pura: sin red ni almacenamiento (se prueba en scripts/personalSync.test.mjs).
 * Gana lo más reciente según las marcas de tiempo. `trashDays`: lo que lleva más en la papelera de la cuenta se borra (el
 * mismo plazo que en el dispositivo). `tombstoneDays`: cuánto se guardan las lápidas.
 */
export function planSync(
  local: readonly LocalLite[],
  remote: readonly RemoteLite[],
  me: string,
  pendingDeletes: ReadonlySet<string>,
  now: number,
  trashDays = 30,
  tombstoneDays = 90,
): Plan {
  const plan: Plan = { push: [], pull: [], adopt: [], moveRemote: [], removeLocal: [], forkLocal: [], purgeLocal: [], purgeRemote: [], dropRemote: [] };
  const R = new Map(remote.map((r) => [r.id, r]));
  const L = new Map(local.map((l) => [l.id, l]));
  for (const l of local) {
    if (l.ownerId && l.ownerId !== me) continue; // de otra cuenta: no se toca
    const r = R.get(l.id);
    const ls = localStamp(l);
    if (l.groupId) {
      // En un grupo: si era de la cuenta, deja de serlo.
      if (r && !r.moved_to_group && !r.purged) {
        const rs = remoteStamp(r);
        plan.moveRemote.push({ id: l.id, group: l.groupId, stamp: Math.max(ls, rs), rescue: rs > ls });
      }
      continue;
    }
    if (!r) {
      plan.push.push(l.id);
      continue;
    }
    const rs = remoteStamp(r);
    if (r.purged) {
      // Borrada del todo en otro dispositivo. Si aquí se ha cambiado después, vuelve a la cuenta.
      if (ls > rs) plan.push.push(l.id);
      else plan.purgeLocal.push(l.id);
    } else if (r.moved_to_group) {
      // Pasó a un grupo en otro dispositivo. Si aquí se ha cambiado después, esos cambios no se pierden: van a una copia.
      if (ls > rs) plan.forkLocal.push(l.id);
      else plan.removeLocal.push(l.id);
    } else if (ls > rs) plan.push.push(l.id);
    else if (ls < rs) plan.pull.push(l.id);
    else if (!l.ownerId) plan.adopt.push(l.id);
  }
  const trashLimit = now - trashDays * DAY;
  const tombLimit = now - tombstoneDays * DAY;
  for (const r of remote) {
    if (L.has(r.id)) continue;
    if (r.purged) {
      if (remoteStamp(r) < tombLimit) plan.dropRemote.push(r.id);
    } else if (pendingDeletes.has(r.id)) plan.purgeRemote.push(r.id);
    else if (r.moved_to_group) continue;
    else if (r.song_deleted_ms && r.song_deleted_ms < trashLimit) plan.purgeRemote.push(r.id);
    else plan.pull.push(r.id);
  }
  return plan;
}
