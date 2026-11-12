import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';

/**
 * Lo que el servidor necesita de la base. Dos implementaciones: Supabase (con la service role, sólo en Render) y una
 * en memoria para las pruebas y para probar en el PC sin proyecto.
 */
export type PendingRevocation = { id: number; token: string; attempts: number };

export interface Store {
  /** Peticiones a la IA de esa persona desde `since` (ISO). */
  aiUsageSince(userId: string, since: string): Promise<number>;
  recordAiUsage(userId: string): Promise<void>;
  /** El `sub` de la identidad de Apple vinculada a la cuenta, o null si no entró con Apple. */
  appleIdentity(userId: string): Promise<string | null>;
  saveAppleToken(userId: string, sealed: string): Promise<void>;
  appleToken(userId: string): Promise<string | null>;
  queueRevocation(sealed: string): Promise<void>;
  dueRevocations(limit: number): Promise<PendingRevocation[]>;
  revocationDone(id: number): Promise<void>;
  revocationLater(id: number, attempts: number, nextAt: Date): Promise<void>;
  /** Sale de sus grupos (pasando la propiedad si hace falta) y borra el usuario de Auth (el resto cae en cascada). */
  deleteAccount(userId: string): Promise<void>;
}

export class SupabaseStore implements Store {
  private readonly db: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private static check(error: { message: string } | null, what: string): void {
    // Nunca se registra el mensaje de la base (podría llevar datos): sólo qué operación falló.
    if (error) throw new Error(`db-${what}`);
  }

  async aiUsageSince(userId: string, since: string) {
    const { count, error } = await this.db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
    SupabaseStore.check(error, 'ai-usage');
    return count ?? 0;
  }
  async recordAiUsage(userId: string) {
    const { error } = await this.db.from('ai_usage').insert({ user_id: userId });
    SupabaseStore.check(error, 'ai-usage-insert');
  }
  async appleIdentity(userId: string) {
    const { data, error } = await this.db.auth.admin.getUserById(userId);
    SupabaseStore.check(error, 'auth-user');
    const identity = data.user?.identities?.find((i) => i.provider === 'apple');
    const sub = identity?.identity_data?.sub ?? identity?.id;
    return typeof sub === 'string' && sub ? sub : null;
  }
  async saveAppleToken(userId: string, sealed: string) {
    const { error } = await this.db.from('apple_tokens').upsert({ user_id: userId, token: sealed, updated_at: new Date().toISOString() });
    SupabaseStore.check(error, 'apple-token-save');
  }
  async appleToken(userId: string) {
    const { data, error } = await this.db.from('apple_tokens').select('token').eq('user_id', userId).maybeSingle();
    SupabaseStore.check(error, 'apple-token-read');
    return (data?.token as string | undefined) ?? null;
  }
  async queueRevocation(sealed: string) {
    const { error } = await this.db.from('apple_revocations').insert({ token: sealed });
    SupabaseStore.check(error, 'apple-queue');
  }
  async dueRevocations(limit: number) {
    const { data, error } = await this.db
      .from('apple_revocations')
      .select('id, token, attempts')
      .lte('next_at', new Date().toISOString())
      .order('next_at')
      .limit(limit);
    SupabaseStore.check(error, 'apple-due');
    return (data ?? []) as PendingRevocation[];
  }
  async revocationDone(id: number) {
    const { error } = await this.db.from('apple_revocations').delete().eq('id', id);
    SupabaseStore.check(error, 'apple-done');
  }
  async revocationLater(id: number, attempts: number, nextAt: Date) {
    const { error } = await this.db.from('apple_revocations').update({ attempts, next_at: nextAt.toISOString() }).eq('id', id);
    SupabaseStore.check(error, 'apple-later');
  }
  async deleteAccount(userId: string) {
    const { error: rpcError } = await this.db.rpc('delete_account_data', { p_user: userId });
    SupabaseStore.check(rpcError, 'account-data');
    const { error } = await this.db.auth.admin.deleteUser(userId);
    SupabaseStore.check(error, 'auth-delete');
  }
}

/**
 * Modo espera: el servidor está desplegado pero aún no tiene la clave secreta de Supabase. Todo responde
 * «no configurado» (503) en vez de fallar al arrancar, para poder desplegar antes de pegar las claves.
 */
export class UnconfiguredStore implements Store {
  private fail(): never {
    throw new ApiError('not-configured', 'El servidor de Voces aún no está conectado a la base de datos. Vuelve a probar más tarde.');
  }
  aiUsageSince(): Promise<number> { return this.fail(); }
  recordAiUsage(): Promise<void> { return this.fail(); }
  appleIdentity(): Promise<string | null> { return this.fail(); }
  saveAppleToken(): Promise<void> { return this.fail(); }
  appleToken(): Promise<string | null> { return this.fail(); }
  queueRevocation(): Promise<void> { return this.fail(); }
  async dueRevocations(): Promise<PendingRevocation[]> { return []; }
  revocationDone(): Promise<void> { return this.fail(); }
  revocationLater(): Promise<void> { return this.fail(); }
  deleteAccount(): Promise<void> { return this.fail(); }
}

/** En memoria: pruebas y desarrollo sin proyecto de Supabase. */
export class MemoryStore implements Store {
  usage: { userId: string; at: string }[] = [];
  appleIdentities = new Map<string, string>();
  appleTokens = new Map<string, string>();
  revocations: (PendingRevocation & { nextAt: number })[] = [];
  deleted: string[] = [];
  private nextId = 1;

  async aiUsageSince(userId: string, since: string) {
    return this.usage.filter((u) => u.userId === userId && u.at >= since).length;
  }
  async recordAiUsage(userId: string) {
    this.usage.push({ userId, at: new Date().toISOString() });
  }
  async appleIdentity(userId: string) {
    return this.appleIdentities.get(userId) ?? null;
  }
  async saveAppleToken(userId: string, sealed: string) {
    this.appleTokens.set(userId, sealed);
  }
  async appleToken(userId: string) {
    return this.appleTokens.get(userId) ?? null;
  }
  async queueRevocation(sealed: string) {
    this.revocations.push({ id: this.nextId++, token: sealed, attempts: 0, nextAt: Date.now() });
  }
  async dueRevocations(limit: number) {
    return this.revocations.filter((r) => r.nextAt <= Date.now()).slice(0, limit).map(({ id, token, attempts }) => ({ id, token, attempts }));
  }
  async revocationDone(id: number) {
    this.revocations = this.revocations.filter((r) => r.id !== id);
  }
  async revocationLater(id: number, attempts: number, nextAt: Date) {
    const r = this.revocations.find((x) => x.id === id);
    if (r) {
      r.attempts = attempts;
      r.nextAt = nextAt.getTime();
    }
  }
  async deleteAccount(userId: string) {
    this.deleted.push(userId);
    this.appleTokens.delete(userId);
    this.usage = this.usage.filter((u) => u.userId !== userId);
  }
}
