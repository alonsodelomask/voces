import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';

import { as, freshDatabase, MIGRATIONS_DIR } from './supabase-stub.ts';

/**
 * Migración `004_biblioteca_grupo.sql` contra PGlite, con todas las migraciones en orden: historial de versiones
 * (una por sesión de trabajo o por persona, como mucho 50, volver a una), papelera del grupo (no se edita, se recupera,
 * a los 30 días se borra con sus versiones) y repertorios compartidos, con RLS (quien no es del grupo no ve nada).
 * Personas, grupo y canciones FICTICIOS.
 */
const ANA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BRUNO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const CARMEN = 'cccccccc-3333-4333-8333-cccccccccccc';
const SONG = 'cancion-prueba-1';

let pg: PGlite;
let group: string;
const rows = async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const asUser = <T>(user: string, sql: string, params: unknown[] = []) => as(pg, { user }, () => rows<T>(sql, params));
const versions = async () => (await rows<{ n: number }>(`select count(*)::int as n from song_versions where song_id = $1`, [SONG]))[0].n;
/** Retrasa la última modificación de la canción (sin que el disparador la ponga en «ahora»). */
const backdate = async (minutes: number) => {
  await pg.exec(`set session_replication_role = replica`);
  await pg.query(`update songs set updated_at = now() - make_interval(mins => $2) where id = $1`, [SONG, minutes]);
  await pg.exec(`set session_replication_role = origin`);
};
const edit = (user: string, n: number) =>
  asUser(user, `update songs set data = jsonb_build_object('n', $2::int), updated_by = $3 where id = $1 returning id`, [SONG, n, user]);

describe('biblioteca del grupo (004)', () => {
  before(async () => {
    pg = await freshDatabase();
    await pg.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [ANA, BRUNO, CARMEN]);
    const [g] = await asUser<{ id: string; invite_code: string }>(ANA, `select * from create_group('Grupo de prueba')`);
    group = g.id;
    await asUser(BRUNO, `select join_group($1)`, [g.invite_code]);
    await asUser(ANA, `insert into songs (id, group_id, title, data, updated_by) values ($1, $2, 'Canción de prueba', '{"n":0}', $3)`, [SONG, group, ANA]);
  });
  after(async () => {
    await pg.close();
  });

  it('se puede volver a ejecutar sin errores ni cambios', async () => {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, '004_biblioteca_grupo.sql'), 'utf8'));
    const [s] = await rows<{ title: string }>(`select title from songs where id = $1`, [SONG]);
    assert.equal(s.title, 'Canción de prueba');
  });

  describe('historial de versiones', () => {
    it('una versión por sesión: seguido y la misma persona, no; tras 10 minutos o con otra persona, sí', async () => {
      await edit(ANA, 1);
      assert.equal(await versions(), 0, 'recién creada y seguido: no');
      await backdate(11);
      await edit(ANA, 2);
      assert.equal(await versions(), 1, 'más de 10 minutos después: se guarda la de antes');
      await edit(ANA, 3);
      assert.equal(await versions(), 1, 'seguido: no');
      await edit(BRUNO, 4);
      assert.equal(await versions(), 2, 'otra persona: sí');
      const [last] = await rows<{ data: { n: number }; saved_by: string }>(`select data, saved_by from song_versions where song_id = $1 order by id desc limit 1`, [SONG]);
      assert.deepEqual(last, { data: { n: 3 }, saved_by: ANA }, 'guarda cómo estaba y quién lo dejó así');
    });

    it('solo los del grupo las ven; nadie las escribe a mano', async () => {
      assert.equal((await asUser(BRUNO, `select id from song_versions where song_id = $1`, [SONG])).length, 2);
      assert.equal((await asUser(CARMEN, `select id from song_versions where song_id = $1`, [SONG])).length, 0);
      assert.equal((await as(pg, 'anon', () => rows(`select id from song_versions`).catch(() => []))).length, 0);
      await assert.rejects(asUser(ANA, `insert into song_versions (song_id, group_id, data, saved_at) values ($1, $2, '{}', now())`, [SONG, group]), /row-level security/);
      assert.equal((await asUser(ANA, `delete from song_versions where song_id = $1 returning id`, [SONG])).length, 0);
      assert.equal(await versions(), 2);
    });

    it('volver a una versión guarda antes la de ahora (una sola vez) y la puede usar cualquiera del grupo', async () => {
      const [first] = await rows<{ id: number }>(`select id from song_versions where song_id = $1 order by id limit 1`, [SONG]);
      await asUser(BRUNO, `select restore_song_version($1)`, [first.id]);
      const [s] = await rows<{ data: { n: number }; updated_by: string }>(`select data, updated_by from songs where id = $1`, [SONG]);
      assert.deepEqual(s, { data: { n: 1 }, updated_by: BRUNO });
      assert.equal(await versions(), 3, 'la de antes de volver, y solo esa');
      const [prev] = await rows<{ data: { n: number } }>(`select data from song_versions where song_id = $1 order by id desc limit 1`, [SONG]);
      assert.deepEqual(prev.data, { n: 4 });
      await assert.rejects(asUser(CARMEN, `select restore_song_version($1)`, [first.id]), /not_found/);
      await assert.rejects(as(pg, 'anon', () => rows(`select restore_song_version($1)`, [first.id])), /permission denied/);
    });

    it('como mucho 50 por canción, las más nuevas', async () => {
      for (let i = 0; i < 60; i++) await edit(i % 2 ? ANA : BRUNO, 100 + i);
      assert.equal(await versions(), 50);
      const [newest] = await rows<{ data: { n: number } }>(`select data from song_versions where song_id = $1 order by id desc limit 1`, [SONG]);
      assert.deepEqual(newest.data, { n: 158 });
    });
  });

  describe('papelera del grupo', () => {
    it('quitar la manda a la papelera: no se edita y sale en la papelera del grupo, con quién y cuándo', async () => {
      await asUser(BRUNO, `select trash_group_song($1)`, [SONG]);
      assert.equal((await edit(ANA, 999)).length, 0, 'en la papelera no se edita');
      const trash = await asUser<{ id: string; deleted_by: string }>(ANA, `select id, deleted_by from group_trash($1)`, [group]);
      assert.deepEqual(trash, [{ id: SONG, deleted_by: BRUNO }]);
      await assert.rejects(asUser(CARMEN, `select * from group_trash($1)`, [group]), /not_member/);
      await assert.rejects(asUser(CARMEN, `select trash_group_song($1)`, [SONG]), /not_found/);
      await assert.rejects(asUser(BRUNO, `select trash_group_song($1)`, [SONG]), /not_found/, 'dos veces no');
    });

    it('recuperarla la deja como estaba y se vuelve a poder editar', async () => {
      const before = await versions();
      await asUser(ANA, `select restore_group_song($1)`, [SONG]);
      const [s] = await rows<{ deleted_at: string | null; data: { n: number } }>(`select deleted_at, data from songs where id = $1`, [SONG]);
      assert.deepEqual(s, { deleted_at: null, data: { n: 159 } });
      assert.equal(await versions(), before, 'recuperar no guarda versión');
      assert.equal((await edit(ANA, 160)).length, 1);
      assert.equal((await asUser(ANA, `select * from group_trash($1)`, [group])).length, 0);
    });

    it('a los 30 días se borra del todo, con sus versiones', async () => {
      await asUser(ANA, `select trash_group_song($1)`, [SONG]);
      await pg.exec(`set session_replication_role = replica`);
      await pg.query(`update songs set deleted_at = now() - interval '31 days' where id = $1`, [SONG]);
      await pg.exec(`set session_replication_role = origin`);
      assert.equal((await asUser(BRUNO, `select * from group_trash($1)`, [group])).length, 0);
      assert.equal((await rows(`select id from songs where id = $1`, [SONG])).length, 0);
      assert.equal(await versions(), 0);
    });
  });

  describe('repertorios del grupo', () => {
    it('los del grupo los crean, editan y borran; quien no es del grupo no los ve', async () => {
      await asUser(ANA, `insert into group_setlists (id, group_id, name, song_ids, updated_by) values ('rep-1', $1, 'Concierto de prueba', '{a,b}', $2)`, [group, ANA]);
      await asUser(BRUNO, `update group_setlists set song_ids = '{b,a,c}', updated_by = $1 where id = 'rep-1'`, [BRUNO]);
      const [r] = await asUser<{ song_ids: string[]; updated_by: string }>(ANA, `select song_ids, updated_by from group_setlists where id = 'rep-1'`);
      assert.deepEqual(r, { song_ids: ['b', 'a', 'c'], updated_by: BRUNO });
      assert.equal((await asUser(CARMEN, `select id from group_setlists`)).length, 0);
      await assert.rejects(asUser(BRUNO, `insert into group_setlists (id, group_id, name, updated_by) values ('rep-2', $1, 'Otro', $2)`, [group, ANA]), /row-level security/, 'con el nombre de otra persona, no');
      await assert.rejects(asUser(CARMEN, `insert into group_setlists (id, group_id, name, updated_by) values ('rep-3', $1, 'Ajeno', $2)`, [group, CARMEN]), /row-level security/);
      assert.equal((await asUser(CARMEN, `delete from group_setlists where id = 'rep-1' returning id`)).length, 0);
      assert.equal((await asUser(BRUNO, `delete from group_setlists where id = 'rep-1' returning id`)).length, 1);
    });
  });
});
