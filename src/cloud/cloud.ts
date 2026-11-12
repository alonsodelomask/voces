// Nube con Supabase: cuentas (código por email), grupos de música y canciones compartidas.
// Si no hay configuración (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), la app funciona solo en local.
import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Song } from '../model';

import { nativeAppleSignIn } from '../native';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Servidor de Voces en Render (IA, borrar la cuenta y revocación de Apple). */
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '');

export const cloudEnabled = !!(URL && KEY);
export const apiEnabled = cloudEnabled && !!API;
export const sb: SupabaseClient | null = cloudEnabled
  ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
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

export async function initAuth(): Promise<User | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user ?? null;
  sb.auth.onAuthStateChange((_e, session) => {
    currentUser = session?.user ?? null;
    authListeners.forEach((f) => f(currentUser));
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
  const { error } = await need().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) fail(error);
}
export async function verifyCode(email: string, token: string) {
  const { error } = await need().auth.verifyOtp({ email, token: token.trim(), type: 'email' });
  if (error) fail(error);
}
/** Alternativa con contraseña (útil para la cuenta de demostración de la revisión de Apple). */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await need().auth.signInWithPassword({ email, password });
  if (error) fail(error);
}
export async function signOut() {
  await need().auth.signOut();
}
export async function deleteAccount() {
  if (API) {
    // El servidor revoca antes el acceso de Apple (norma 5.1.1(v)) y borra la cuenta.
    await api('DELETE', '/v1/account');
  } else {
    const { error } = await need().rpc('delete_my_account');
    if (error) fail(error);
  }
  await need().auth.signOut();
}

/** Llamada al servidor de Render con la sesión actual. Los errores traen un mensaje en español listo para enseñar. */
async function api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = 150_000): Promise<T> {
  if (!API) throw new Error('El servidor de Voces no está configurado en esta versión.');
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
  } catch {
    // Render en el plan gratuito se duerme: la primera petición puede tardar ~1 minuto.
    throw new Error('No se ha podido conectar con el servidor. Comprueba la conexión y prueba otra vez.');
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `Error del servidor (${res.status}).`);
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
    .order('updated_at', { ascending: false });
  if (error) fail(error);
  return data ?? [];
}
export async function fetchSong(id: string): Promise<Song> {
  const { data, error } = await need().from('songs').select('data, group_id, updated_at').eq('id', id).single();
  if (error) fail(error);
  return { ...(data.data as Song), id, groupId: data.group_id, remoteUpdatedAt: data.updated_at };
}
/** Sube (o actualiza) una canción en su grupo. Devuelve la marca de tiempo del servidor. */
export async function pushSong(song: Song): Promise<string> {
  if (!song.groupId || !currentUser) throw new Error('La canción no está en ningún grupo.');
  const data: Song = { ...song, remoteUpdatedAt: undefined };
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

/** Avisa cuando alguien del grupo crea, cambia o borra una canción. */
export function watchGroup(groupId: string, cb: (ev: { type: string; id: string; updated_by?: string | null; updated_at?: string }) => void): () => void {
  if (!sb) return () => {};
  const ch: RealtimeChannel = sb
    .channel('songs-' + groupId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'songs', filter: `group_id=eq.${groupId}` }, (p) => {
      const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { id: string; updated_by?: string; updated_at?: string };
      cb({ type: p.eventType, id: row.id, updated_by: row.updated_by, updated_at: row.updated_at });
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

export async function askAI(prompt: string, songText: string): Promise<AiAnswer> {
  return api<AiAnswer>('POST', '/v1/ai', { prompt, song: songText });
}
