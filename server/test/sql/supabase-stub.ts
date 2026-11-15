import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Lo mínimo de Supabase para probar las migraciones sin Docker (como en Baulify): los roles (anon, authenticated,
 * service_role con BYPASSRLS), `auth.users`, `auth.uid()` leyendo la reclamación `sub` del JWT como hace Supabase y la
 * publicación del tiempo real. Los privilegios por defecto imitan los de Supabase (todo concedido; RLS es la barrera).
 */
const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create publication supabase_realtime;
`;

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations');

export const migrations = () => readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

/** Una base nueva con todas las migraciones en orden (menos las de `skip`). */
export async function freshDatabase(options: { skip?: string[] } = {}): Promise<PGlite> {
  // 001_init.sql usa pgcrypto (códigos de invitación).
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const file of migrations().filter((name) => !options.skip?.includes(name))) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

/** Ejecuta `fn` como la persona `userId` (rol authenticated), como el servidor (service_role) o sin sesión (anon). */
export async function as<T>(db: PGlite, who: { user: string } | 'service' | 'anon', fn: () => Promise<T>): Promise<T> {
  if (who === 'service') await db.exec('set role service_role');
  else if (who === 'anon') await db.exec('set role anon');
  else {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who.user]);
    await db.exec('set role authenticated');
  }
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
