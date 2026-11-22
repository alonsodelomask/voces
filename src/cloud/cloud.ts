// Nube con Supabase: cuentas (código por email), grupos de música y canciones compartidas.
// Si no hay configuración (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), la app funciona solo en local.
import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js';
import { isNewerFormat, NEWER_FORMAT_MSG, type Song } from '../model';
import { checkSong } from '../songCheck';
import { withNeutralMix } from './mix';
import { ApiUnavailable, isTimeout, noAnswerMessage, online, unavailableMessage, wakeServer } from './serverWake';

import { isNative, nativeAppleSignIn } from '../native';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Servidor de Voces en Render (IA, borrar la cuenta y revocación de Apple). */
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '');

export const cloudEnabled = !!(URL && KEY);
/** Se llega desde el enlace «He olvidado mi contraseña» (se mira antes de que Supabase limpie la URL). */
export const recoveryInUrl = typeof location !== 'undefined' && /type=recovery/.test(location.hash + location.search);
export const apiEnabled = cloudEnabled && !!API;
export const sb: SupabaseClient | null = cloudEnabled
  ? // En la web, el enlace del correo vuelve a la página con la sesión en la URL y se recoge solo.
    createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isNative } })
  : null;

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  max_members: number;
  role?: 'owner' | 'member';
}
export interface Member {
  user_id: string;
  role: 'owner' | 'member';
  display_name: string;
}
export interface RemoteSongMeta {
  id: string;
  title: string;
  updated_at: string;
  updated_by: string | null;
  group_id: string;
}

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'El correo o la contraseña no son correctos.',
  'Email not confirmed': 'Aún no has confirmado tu correo: abre el enlace que te enviamos.',
  'User already registered': 'Ya hay una cuenta con ese correo. Entra con tu contraseña o recupérala.',
  'Password should be at least': 'La contraseña es demasiado corta (mínimo 8 caracteres).',
  'Unable to validate email address': 'Ese correo no parece válido.',
  'For security purposes, you can only request this after': 'Espera unos segundos antes de pedir otro correo.',
  'Email rate limit exceeded': 'Se han enviado demasiados correos. Prueba dentro de un rato.',
  // «Error sending confirmation / recovery / magic link / invite email»: el servidor de correo no lo ha aceptado.
  'Error sending': 'No hemos podido enviar el correo. Prueba dentro de un rato y, si sigue fallando, escríbenos a soporte@vocify.es.',
  'New password should be different': 'La contraseña nueva tiene que ser distinta de la anterior.',
  invalid_code: 'Ese código de invitación no existe.',
  group_full: 'El grupo está completo.',
  not_owner: 'Solo el propietario del grupo puede hacer esto.',
  not_authenticated: 'Inicia sesión primero.',
};
function fail(e: { message?: string } | null): never {
  const msg = e?.message ?? 'Error de conexión';
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  throw new Error(key ? ERRORS[key] : msg);
}
function need(): SupabaseClient {
  if (!sb) throw new Error('La nube no está configurada en esta versión de la app.');
  return sb;
}

// ---------- Cuenta ----------

let currentUser: User | null = null;
const authListeners = new Set<(u: User | null) => void>();
const recoveryListeners = new Set<() => void>();
export function onPasswordRecovery(f: () => void) {
  recoveryListeners.add(f);
}

export async function initAuth(): Promise<User | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user ?? null;
  sb.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    authListeners.forEach((f) => f(currentUser));
    // Vuelve del enlace «He olvidado mi contraseña»: hay que pedir la nueva.
    if (event === 'PASSWORD_RECOVERY') recoveryListeners.forEach((f) => f());
  });
  return currentUser;
}
export function user() {
  return currentUser;
}
export function onAuth(f: (u: User | null) => void) {
  authListeners.add(f);
  return () => authListeners.delete(f);
}

/** Envía un código de 6 dígitos al email (y crea la cuenta si no existe). */
export async function sendCode(email: string) {
  // El correo trae un enlace (y un código si la plantilla lo incluye, con SMTP propio). En la web, el enlace vuelve aquí.
  const emailRedirectTo = isNative ? undefined : location.origin + location.pathname;
  const { error } = await need().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo } });
  if (error) fail(error);
}
export async function verifyCode(email: string, token: string) {
  const { error } = await need().auth.verifyOtp({ email, token: token.trim(), type: 'email' });
  if (error) fail(error);
}
/** Alternativa con contraseña (útil para la cuenta de demostración de la revisión de Apple). */
/** Entrar con email y contraseña. */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await need().auth.signInWithPassword({ email, password });
  if (error) fail(error);
}

/** Dirección a la que vuelven los enlaces de los correos (en la app no hay: se abren en la web). */
function returnUrl(): string | undefined {
  return isNative ? undefined : location.origin + location.pathname;
}

/**
 * Crear cuenta con contraseña. Devuelve 'confirm' si hay que confirmar el correo antes de entrar (lo normal) o
 * 'signed-in' si el proyecto no pide confirmación.
 */
export async function signUp(email: string, password: string, name: string): Promise<'confirm' | 'signed-in'> {
  const { data, error } = await need().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: returnUrl(), data: name ? { full_name: name } : undefined },
  });
  if (error) fail(error);
  // Supabase no dice si el correo ya existía (por privacidad): sin identidades, es que ya hay cuenta.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('Ya hay una cuenta con ese correo. Entra con tu contraseña o recupérala.');
  }
  return data.session ? 'signed-in' : 'confirm';
}

/** Manda el correo para elegir otra contraseña. */
export async function resetPassword(email: string) {
  const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
  if (error) fail(error);
}

/** Cambia la contraseña de la sesión actual (tras el enlace de recuperación o desde la cuenta). */
export async function updatePassword(password: string) {
  const { error } = await need().auth.updateUser({ password });
  if (error) fail(error);
}
export async function signOut() {
  await need().auth.signOut();
}

/**
 * Cambia el correo de la cuenta. Supabase manda un enlace a la dirección nueva (plantilla «Confirma tu nuevo correo en
 * Vocify») y el cambio vale cuando se pulsa; hasta entonces se sigue entrando con el de antes.
 */
export async function changeEmail(email: string) {
  const { error } = await need().auth.updateUser({ email: email.trim() }, { emailRedirectTo: returnUrl() });
  if (error) fail(error);
}

/** Con qué se puede entrar en esta cuenta: «email» (correo y contraseña o enlace) y/o «apple». */
export function signInMethods(): string[] {
  const ids = currentUser?.identities?.map((i) => i.provider) ?? [];
  const prov = (currentUser?.app_metadata?.providers as string[] | undefined) ?? [];
  return [...new Set([...ids, ...prov])];
}
export async function deleteAccount() {
  let viaServer = false;
  if (API) {
    // El servidor revoca antes el acceso de Apple (norma 5.1.1(v)) y borra la cuenta.
    try {
      await api('DELETE', '/v1/account');
      viaServer = true;
    } catch (e) {
      // Servidor sin configurar (503) o dormido sin respuesta: se borra igual directamente en Supabase.
      if (!(e instanceof ApiUnavailable)) throw e;
    }
  }
  if (!viaServer) {
    const { error } = await need().rpc('delete_my_account');
    if (error) fail(error);
  }
  await need().auth.signOut();
}

/** Llamada al servidor de Render con la sesión actual. Los errores traen un mensaje en español listo para enseñar. */
async function api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = 150_000): Promise<T> {
  if (!API) throw new Error('El servidor de Vocify no está configurado en esta versión.');
  const { data } = await need().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesión primero.');
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Render en el plan gratuito se duerme: la primera petición puede tardar ~1 minuto. Con Internet, lo más
    // probable es eso (y no «comprueba la conexión», que despistaba). Si se agota la espera, otro mensaje.
    throw new ApiUnavailable(noAnswerMessage(online(), isTimeout(e)));
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (res.status === 503) throw new ApiUnavailable(unavailableMessage(json?.error?.message));
  const message = json?.error?.message ?? `Error del servidor (${res.status}).`;
  if (!res.ok) throw new Error(message);
  return json as T;
}

// ---------- Iniciar sesión con Apple (solo en la app de iPhone) ----------

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Igual que en Baulify: el resumen SHA-256 del nonce va a Apple y el crudo a Supabase (`signInWithIdToken`). El nombre,
 * que Apple solo da la primera vez, se guarda en el perfil. El código de autorización va al servidor para poder revocar
 * el acceso al borrar la cuenta; si falla, se entra igual.
 */
export async function signInWithApple(): Promise<'signed-in' | 'cancelled'> {
  const db = need();
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  let cred;
  try {
    cred = await nativeAppleSignIn(hashed);
  } catch (e) {
    if ((e as Error).name === 'NativeCancelled') return 'cancelled';
    throw new Error('No se ha podido iniciar sesión con Apple.');
  }
  const { data, error } = await db.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: raw });
  if (error) {
    throw new Error(/audience|aud|client/i.test(error.message) ? 'Apple no está activado para esta app en el servidor.' : 'No se ha podido iniciar sesión. Prueba otra vez.');
  }
  currentUser = data.user ?? currentUser;
  if (cred.fullName && !data.user?.user_metadata?.full_name) {
    await db.auth.updateUser({ data: { full_name: cred.fullName } }).catch(() => {});
    if (!(await getProfileName().catch(() => ''))) await setProfileName(cred.fullName).catch(() => {});
  }
  if (cred.authorizationCode && API) {
    await api('POST', '/v1/apple/authorization', { authorizationCode: cred.authorizationCode }, 20_000).catch(() => {});
  }
  return 'signed-in';
}

/**
 * «Descargar mis datos» (derecho de portabilidad): perfil, canciones de la cuenta, grupos, miembros de cada grupo y las
 * canciones compartidas, en un JSON. Las grabaciones, que solo están en el dispositivo, no van (Exportar proyecto).
 */
export async function exportMyData(): Promise<Blob> {
  const db = need();
  if (!currentUser) throw new Error('Inicia sesión primero.');
  const name = await getProfileName();
  const groups = await myGroups();
  const detail = [];
  for (const g of groups) {
    const [mem, songs] = await Promise.all([members(g.id), db.from('songs').select('id, title, data, updated_at, updated_by').eq('group_id', g.id)]);
    if (songs.error) fail(songs.error);
    detail.push({ grupo: { id: g.id, nombre: g.name, codigo: g.invite_code, maximo: g.max_members, rol: g.role }, miembros: mem, canciones: songs.data });
  }
  const propias = await db
    .from('personal_songs')
    .select('id, title, data, song_updated_ms, song_deleted_ms, updated_at')
    .eq('owner_id', currentUser.id)
    .not('data', 'is', null);
  if (propias.error) fail(propias.error);
  const data = {
    exportado: new Date().toISOString(),
    cuenta: { id: currentUser.id, correo: currentUser.email ?? null, nombre: name, creada: currentUser.created_at, proveedores: currentUser.app_metadata?.providers ?? [] },
    canciones_de_la_cuenta: propias.data,
    grupos: detail,
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function getProfileName(): Promise<string> {
  if (!currentUser) return '';
  const { data } = await need().from('profiles').select('display_name').eq('id', currentUser.id).maybeSingle();
  return data?.display_name ?? '';
}
export async function setProfileName(name: string) {
  if (!currentUser) return;
  const { error } = await need().from('profiles').upsert({ id: currentUser.id, display_name: name.slice(0, 60) });
  if (error) fail(error);
}

// ---------- Grupos ----------

export async function myGroups(): Promise<Group[]> {
  if (!currentUser) return [];
  const { data, error } = await need()
    .from('group_members')
    .select('role, groups(id, name, invite_code, max_members)')
    .eq('user_id', currentUser.id);
  if (error) fail(error);
  const out: Group[] = [];
  for (const r of data ?? []) {
    const g = (Array.isArray(r.groups) ? r.groups[0] : r.groups) as Group | null;
    if (g) out.push({ ...g, role: r.role as Group['role'] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export async function createGroup(name: string): Promise<Group> {
  const { data, error } = await need().rpc('create_group', { p_name: name });
  if (error) fail(error);
  return { ...(data as Group), role: 'owner' };
}
export async function joinGroup(code: string): Promise<Group> {
  const { data, error } = await need().rpc('join_group', { p_code: code });
  if (error) fail(error);
  return data as Group;
}
export async function leaveGroup(id: string) {
  const { error } = await need().rpc('leave_group', { p_group: id });
  if (error) fail(error);
}
export async function regenerateInvite(id: string): Promise<string> {
  const { data, error } = await need().rpc('regenerate_invite', { p_group: id });
  if (error) fail(error);
  return data as string;
}
export async function setMaxMembers(id: string, max: number) {
  const { error } = await need().from('groups').update({ max_members: max }).eq('id', id);
  if (error) fail(error);
}
export async function members(groupId: string): Promise<Member[]> {
  const db = need();
  const { data, error } = await db.from('group_members').select('user_id, role').eq('group_id', groupId);
  if (error) fail(error);
  const ids = (data ?? []).map((m) => m.user_id);
  const { data: profs } = await db.from('profiles').select('id, display_name').in('id', ids);
  const names = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
  return (data ?? []).map((m) => ({ user_id: m.user_id, role: m.role, display_name: names.get(m.user_id) || 'Sin nombre' }));
}
export async function removeMember(groupId: string, userId: string) {
  const { error } = await need().from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) fail(error);
}

// ---------- Canciones compartidas ----------

export async function groupSongs(groupId: string): Promise<RemoteSongMeta[]> {
  const { data, error } = await need()
    .from('songs')
    .select('id, title, updated_at, updated_by, group_id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) fail(error);
  return data ?? [];
}
export async function fetchSong(id: string): Promise<Song> {
  const { data, error } = await need().from('songs').select('data, group_id, updated_at').eq('id', id).single();
  if (error) fail(error);
  // Lo que llega del grupo se revisa (lo puede haber guardado cualquier versión de la app, o una mal hecha).
  const song = checkSong({ ...(data.data && typeof data.data === 'object' ? data.data : {}), id, groupId: data.group_id, remoteUpdatedAt: data.updated_at })!;
  delete song.ownerId;
  return song;
}
/** Cuándo se cambió por última vez la canción en el grupo (y si está en su papelera). `null` si no está o no la ves. */
export async function songStamp(id: string): Promise<{ updated_at: string; deleted_at: string | null } | null> {
  const { data, error } = await need().from('songs').select('updated_at, deleted_at').eq('id', id).maybeSingle();
  if (error) fail(error);
  return data as { updated_at: string; deleted_at: string | null } | null;
}

/** La canción ya no está en el grupo (la quitó alguien). */
export class RemovedFromGroup extends Error {
  // Con nombre: las pruebas (nube de mentira) lo reconocen sin importar esta clase.
  override name = 'RemovedFromGroup';
  constructor() {
    super('Esta canción ya no está en el grupo.');
  }
}
/** Otra persona ha cambiado la canción desde la versión que tenía este dispositivo: no se ha subido nada. */
export class GroupConflict extends Error {
  override name = 'GroupConflict';
  constructor() {
    super('Otra persona del grupo ha cambiado esta canción mientras tanto.');
  }
}

/** Sube (o actualiza) una canción en su grupo. Devuelve la marca de tiempo del servidor. */
export async function pushSong(song: Song): Promise<string> {
  // Una canción de una versión más nueva de la app no se cambia desde esta: nunca se sube encima de la del grupo.
  if (isNewerFormat(song)) throw new Error(NEWER_FORMAT_MSG);
  if (!song.groupId || !currentUser) throw new Error('La canción no está en ningún grupo.');
  // La grabación está guardada en este dispositivo y no viaja al grupo, así que su ficha tampoco.
  // Tampoco viaja de quién es en este dispositivo (canciones de la cuenta) ni si está en su papelera.
  // La mezcla de ensayo (solo, silencio…) es de cada uno: sube con su valor normal (la 1.0 necesita los campos).
  const data: Song = { ...withNeutralMix(song), remoteUpdatedAt: undefined, audioTrack: undefined, ownerId: undefined, deletedAt: undefined };
  // Ya estaba en el grupo: solo se actualiza, y solo si sigue siendo la versión que se tenía aquí (si otra persona la
  // ha cambiado mientras tanto, no se pisa su trabajo). Si alguien la quitó, no se vuelve a crear.
  if (song.remoteUpdatedAt) {
    const { data: rows, error } = await need()
      .from('songs')
      .update({ title: song.title, data, updated_by: currentUser.id })
      .eq('id', song.id)
      .eq('updated_at', song.remoteUpdatedAt)
      .is('deleted_at', null)
      .select('updated_at');
    if (error) fail(error);
    if (rows && rows.length) return rows[0].updated_at as string;
    // No ha cambiado nada: o ya no está en el grupo, o es otra versión.
    const now = await songStamp(song.id);
    if (now && !now.deleted_at) throw new GroupConflict();
    throw new RemovedFromGroup();
  }
  const { data: row, error } = await need()
    .from('songs')
    .upsert({ id: song.id, group_id: song.groupId, title: song.title, data, updated_by: currentUser.id })
    .select('updated_at')
    .single();
  if (error) fail(error);
  return row.updated_at as string;
}
export async function deleteRemoteSong(id: string) {
  const { error } = await need().from('songs').delete().eq('id', id);
  if (error) fail(error);
}

// ---------- Papelera del grupo (004_biblioteca_grupo.sql) ----------

export interface TrashedSong {
  id: string;
  title: string;
  deleted_at: string;
  deleted_by: string | null;
  group_id: string;
}
/** «Quitar del grupo»: desaparece para todos, pero se puede recuperar durante 30 días. */
export async function trashRemoteSong(id: string) {
  const { error } = await need().rpc('trash_group_song', { p_song: id });
  if (error) fail(error);
}
/** La saca de la papelera del grupo. Devuelve su marca de tiempo nueva. */
export async function restoreRemoteSong(id: string): Promise<string> {
  const { data, error } = await need().rpc('restore_group_song', { p_song: id });
  if (error) fail(error);
  return data as string;
}
/** Lo que hay en la papelera de un grupo (lo de más de 30 días se borra al pedirlo). */
export async function groupTrash(groupId: string): Promise<TrashedSong[]> {
  const { data, error } = await need().rpc('group_trash', { p_group: groupId });
  if (error) fail(error);
  return ((data ?? []) as Omit<TrashedSong, 'group_id'>[]).map((t) => ({ ...t, group_id: groupId }));
}

// ---------- Historial de versiones ----------

export interface SongVersion {
  id: number;
  title: string;
  saved_by: string | null;
  saved_at: string;
}
/** Versiones anteriores de una canción del grupo, de la más nueva a la más antigua (como mucho 50). */
export async function songVersions(songId: string): Promise<SongVersion[]> {
  const { data, error } = await need()
    .from('song_versions')
    .select('id, title, saved_by, saved_at')
    .eq('song_id', songId)
    .order('saved_at', { ascending: false })
    .limit(50);
  if (error) fail(error);
  return data ?? [];
}
export async function fetchVersion(id: number): Promise<{ title: string; data: Song }> {
  const { data, error } = await need().from('song_versions').select('title, data').eq('id', id).single();
  if (error) fail(error);
  return { title: String(data.title ?? ''), data: checkSong(data.data) ?? checkSong({})! };
}
/** Vuelve la canción del grupo a esa versión (la de ahora se guarda antes como versión). */
export async function restoreVersion(id: number): Promise<string> {
  const { data, error } = await need().rpc('restore_song_version', { p_version: id });
  if (error) fail(error);
  return data as string;
}

// ---------- Repertorios del grupo ----------

export interface RemoteSetlist {
  id: string;
  group_id: string;
  name: string;
  song_ids: string[];
  updated_at: string;
}
export async function groupSetlists(groupId: string): Promise<RemoteSetlist[]> {
  const { data, error } = await need().from('group_setlists').select('id, group_id, name, song_ids, updated_at').eq('group_id', groupId);
  if (error) fail(error);
  return data ?? [];
}
export async function pushSetlist(r: { id: string; groupId: string; name: string; songIds: string[] }) {
  if (!currentUser) throw new Error('Inicia sesión primero.');
  const { error } = await need()
    .from('group_setlists')
    .upsert({ id: r.id, group_id: r.groupId, name: r.name, song_ids: r.songIds, updated_by: currentUser.id });
  if (error) fail(error);
}
export async function deleteSetlist(id: string) {
  const { error } = await need().from('group_setlists').delete().eq('id', id);
  if (error) fail(error);
}

/** Avisa cuando alguien del grupo crea, cambia o borra una canción. */
export function watchGroup(groupId: string, cb: (ev: { type: string; id: string; updated_by?: string | null; updated_at?: string; deleted_at?: string | null }) => void): () => void {
  if (!sb) return () => {};
  const ch: RealtimeChannel = sb
    .channel('songs-' + groupId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'songs', filter: `group_id=eq.${groupId}` }, (p) => {
      const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { id: string; updated_by?: string; updated_at?: string; deleted_at?: string | null };
      cb({ type: p.eventType, id: row.id, updated_by: row.updated_by, updated_at: row.updated_at, deleted_at: row.deleted_at });
    })
    .subscribe();
  return () => {
    sb!.removeChannel(ch);
  };
}

// ---------- Canciones de la cuenta (005_canciones_cuenta.sql) ----------
// Las que no están en un grupo, para verlas en cualquier dispositivo de la misma cuenta. Quién gana si cambian en dos
// sitios lo decide `cloud/personalSync.ts`; aquí solo se leen y se escriben. La grabación nunca se sube.

export interface PersonalRow {
  id: string;
  title: string;
  song_updated_ms: number;
  song_deleted_ms: number | null;
  moved_to_group: string | null;
  purged: boolean;
  updated_at: string;
}
export interface PersonalPut {
  id: string;
  title: string;
  data: Song;
  song_updated_ms: number;
  song_deleted_ms: number | null;
}
const PERSONAL_BATCH = 20;
const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/**
 * Cada llamada lleva la cuenta para la que se planificó (`owner`): si mientras tanto se ha cambiado de cuenta, se para
 * (y las reglas de acceso tampoco dejarían escribir en otra).
 */
function ownerOk(owner: string) {
  if (!currentUser || currentUser.id !== owner) throw new Error('Ha cambiado la sesión.');
}

/** Lo que hay en la cuenta (sin el contenido de las canciones, que puede pesar). */
export async function personalList(owner: string): Promise<PersonalRow[]> {
  ownerOk(owner);
  const { data, error } = await need()
    .from('personal_songs')
    .select('id, title, song_updated_ms, song_deleted_ms, moved_to_group, purged, updated_at')
    .eq('owner_id', owner);
  if (error) fail(error);
  return ((data ?? []) as PersonalRow[]).map((r) => ({
    ...r,
    song_updated_ms: Number(r.song_updated_ms),
    song_deleted_ms: r.song_deleted_ms == null ? null : Number(r.song_deleted_ms),
  }));
}
/** El contenido de esas canciones (de 20 en 20). */
export async function personalFetch(owner: string, ids: string[]): Promise<{ id: string; data: Song }[]> {
  const out: { id: string; data: Song }[] = [];
  for (const part of chunks(ids, PERSONAL_BATCH)) {
    ownerOk(owner);
    const { data, error } = await need().from('personal_songs').select('id, data').eq('owner_id', owner).in('id', part).not('data', 'is', null);
    if (error) fail(error);
    // Revisadas, como todo lo que llega de fuera (las que no son una canción se dejan fuera).
    for (const r of (data ?? []) as { id: string; data: unknown }[]) {
      const song = checkSong(r.data);
      if (song) out.push({ id: r.id, data: song });
    }
  }
  return out;
}
/** Sube (o pone al día) canciones de la cuenta. También devuelve a la cuenta una que estaba en un grupo o borrada. */
export async function personalPut(owner: string, rows: PersonalPut[]) {
  for (const part of chunks(rows, PERSONAL_BATCH)) {
    ownerOk(owner);
    const { error } = await need()
      .from('personal_songs')
      .upsert(part.map((r) => ({ owner_id: owner, ...r, moved_to_group: null, purged: false })), { onConflict: 'owner_id,id' });
    if (error) fail(error);
  }
}
/** Estas canciones han pasado a un grupo: dejan de ser de la cuenta (los otros dispositivos las buscarán allí). */
export async function personalMoved(owner: string, moves: { id: string; group: string; stamp: number }[]) {
  for (const m of moves) {
    ownerOk(owner);
    const { error } = await need()
      .from('personal_songs')
      .update({ data: null, moved_to_group: m.group, purged: false, song_updated_ms: m.stamp, song_deleted_ms: null })
      .eq('owner_id', owner)
      .eq('id', m.id);
    if (error) fail(error);
  }
}
/** Borradas del todo: se quedan como lápidas (sin datos), para que otro dispositivo no las vuelva a subir. */
export async function personalPurge(owner: string, ids: string[], stamp: number) {
  for (const part of chunks(ids, 100)) {
    ownerOk(owner);
    const { error } = await need()
      .from('personal_songs')
      .update({ data: null, purged: true, moved_to_group: null, song_updated_ms: stamp, song_deleted_ms: null })
      .eq('owner_id', owner)
      .in('id', part);
    if (error) fail(error);
  }
}
/** Quita lápidas viejas. */
export async function personalDrop(owner: string, ids: string[]) {
  for (const part of chunks(ids, 100)) {
    ownerOk(owner);
    const { error } = await need().from('personal_songs').delete().eq('owner_id', owner).eq('purged', true).in('id', part);
    if (error) fail(error);
  }
}
/** Avisa cuando cambia algo de la cuenta en otro dispositivo. */
export function watchPersonal(owner: string, cb: () => void): () => void {
  if (!sb) return () => {};
  const ch: RealtimeChannel = sb
    .channel('personal-' + owner)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_songs', filter: `owner_id=eq.${owner}` }, (p) => {
      // Los avisos de borrado no se filtran en el servidor: solo cuentan los de esta cuenta.
      const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { owner_id?: string };
      if (row?.owner_id === owner) cb();
    })
    .subscribe();
  return () => {
    sb!.removeChannel(ch);
  };
}

// ---------- IA ----------

export interface AiVoice {
  targetId: string;
  name: string;
  notes: { beat: number; dur: number; note: string }[];
}
export interface AiAnswer {
  reply: string;
  chords: { beat: number; name: string }[];
  voices: AiVoice[];
}

/** `onWaking`: se llama si el servidor estaba dormido y hay que esperar a que despierte (para avisar en pantalla). */
export async function askAI(prompt: string, songText: string, onWaking?: () => void): Promise<AiAnswer> {
  // Primero se despierta el servidor: si no, la petición puede llegar, contarse para el cupo y quedarse sin respuesta.
  if (API) await wakeServer(API, onWaking);
  return api<AiAnswer>('POST', '/v1/ai', { prompt, song: songText });
}
