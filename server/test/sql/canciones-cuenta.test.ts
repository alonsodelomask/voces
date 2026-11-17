import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';

import { as, freshDatabase, MIGRATIONS_DIR } from './supabase-stub.ts';

/**
 * Migración `005_canciones_cuenta.sql` contra PGlite, con todas las migraciones en orden: cada persona ve y cambia solo
 * sus canciones (ni el grupo ni nadie más), al pasar a un grupo se queda sin datos, y al borrar la cuenta se borran.
 * Personas y canciones FICTICIAS.
 */
const ANA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BRUNO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

let pg: PGlite;
const rows = async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const asUser = <T>(user: string, sql: string, params: unknown[] = []) => as(pg, { user }, () => rows<T>(sql, params));
const insert = (user: string, owner: string, id: string, title = 'Canción de prueba') =>
  asUser(user, `insert into personal_songs (owner_id, id, title, data, song_updated_ms) values ($1, $2, $3, '{"voices":[]}', 1000) returning id`, [owner, id, title]);

describe('canciones de la cuenta (005)', () => {
  before(async () => {
    pg = await freshDatabase();
    await pg.query(`insert into auth.users (id) values ($1), ($2)`, [ANA, BRUNO]);
  });
  after(async () => {
    await pg.close();
  });

  it('se puede volver a ejecutar sin errores ni cambios', async () => {
    await insert(ANA, ANA, 'c-repetir');
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, '005_canciones_cuenta.sql'), 'utf8'));
    const [s] = await rows<{ title: string }>(`select title from personal_songs where id = 'c-repetir'`);
    assert.equal(s.title, 'Canción de prueba');
  });

  it('cada persona ve y cambia solo las suyas; nadie crea canciones a nombre de otra', async () => {
    await insert(ANA, ANA, 'c-ana');
    await insert(BRUNO, BRUNO, 'c-ana'); // el mismo id en otra cuenta no choca
    await assert.rejects(insert(BRUNO, ANA, 'c-intrusa'), /row-level security/);
    const deAna = await asUser<{ id: string }>(ANA, `select id from personal_songs order by id`);
    assert.deepEqual(deAna.map((r) => r.id), ['c-ana', 'c-repetir']);
    assert.equal((await asUser(BRUNO, `select id from personal_songs where owner_id = $1`, [ANA])).length, 0);
    assert.equal((await asUser(BRUNO, `update personal_songs set title = 'x' where owner_id = $1 returning id`, [ANA])).length, 0);
    assert.equal((await asUser(BRUNO, `delete from personal_songs where owner_id = $1 returning id`, [ANA])).length, 0);
    await assert.rejects(asUser(ANA, `update personal_songs set owner_id = $1 where id = 'c-ana' and owner_id = $2`, [BRUNO, ANA]), /row-level security/);
    assert.equal((await as(pg, 'anon', () => rows(`select id from personal_songs`).catch(() => []))).length, 0);
  });

  it('al cambiarla se pone al día la hora del servidor', async () => {
    const [antes] = await rows<{ updated_at: string }>(`select updated_at from personal_songs where owner_id = $1 and id = 'c-ana'`, [ANA]);
    await pg.exec(`set session_replication_role = replica`);
    await pg.query(`update personal_songs set updated_at = now() - interval '1 hour' where owner_id = $1 and id = 'c-ana'`, [ANA]);
    await pg.exec(`set session_replication_role = origin`);
    await asUser(ANA, `update personal_songs set song_updated_ms = 2000 where owner_id = $1 and id = 'c-ana'`, [ANA]);
    const [despues] = await rows<{ updated_at: string }>(`select updated_at from personal_songs where owner_id = $1 and id = 'c-ana'`, [ANA]);
    assert.ok(new Date(despues.updated_at) >= new Date(antes.updated_at));
  });

  it('al pasar a un grupo se queda sin datos (y no puede quedarse con ellos)', async () => {
    const g = 'dddddddd-4444-4444-8444-dddddddddddd';
    await asUser(ANA, `update personal_songs set data = null, moved_to_group = $2 where owner_id = $1 and id = 'c-ana'`, [ANA, g]);
    await assert.rejects(asUser(ANA, `update personal_songs set data = '{}' where owner_id = $1 and id = 'c-ana'`, [ANA]), /check constraint/);
    await assert.rejects(asUser(ANA, `update personal_songs set data = null where owner_id = $1 and id = 'c-repetir'`, [ANA]), /check constraint/);
  });

  it('borrada del todo queda como lápida, sin datos', async () => {
    await insert(BRUNO, BRUNO, 'c-lapida');
    await asUser(BRUNO, `update personal_songs set data = null, purged = true where owner_id = $1 and id = 'c-lapida'`, [BRUNO]);
    await assert.rejects(asUser(BRUNO, `update personal_songs set data = '{}' where owner_id = $1 and id = 'c-lapida'`, [BRUNO]), /check constraint/);
    await asUser(BRUNO, `update personal_songs set data = '{}', purged = false where owner_id = $1 and id = 'c-lapida'`, [BRUNO]);
    await asUser(BRUNO, `delete from personal_songs where owner_id = $1 and id = 'c-lapida'`, [BRUNO]);
  });

  it('no admite canciones desmesuradas', async () => {
    await assert.rejects(
      asUser(ANA, `insert into personal_songs (owner_id, id, data, song_updated_ms) values ($1, 'c-enorme', jsonb_build_object('x', repeat('a', 5000001)), 1)`, [ANA]),
      /check constraint/,
    );
  });

  it('está en el tiempo real', async () => {
    const r = await rows(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'personal_songs'`);
    assert.equal(r.length, 1);
  });

  it('al borrar la cuenta se borran sus canciones (las de otras personas, no)', async () => {
    await pg.query(`delete from auth.users where id = $1`, [ANA]);
    assert.equal((await rows(`select id from personal_songs where owner_id = $1`, [ANA])).length, 0);
    assert.equal((await rows(`select id from personal_songs where owner_id = $1`, [BRUNO])).length, 1);
  });
});
