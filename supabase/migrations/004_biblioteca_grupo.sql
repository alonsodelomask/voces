-- Voces · biblioteca del grupo (15/11/2026): historial de versiones, papelera del grupo y repertorios compartidos.
-- Aditiva e idempotente: columnas nuevas (vacías) en `songs`, dos tablas nuevas y funciones. No cambia ni borra datos.
-- Ejecútala después de 003_nombre_registro.sql.

-- ---------- Papelera del grupo ----------
-- «Quitar del grupo» ya no borra: marca la canción y se puede recuperar durante 30 días (después se borra sola).

alter table public.songs add column if not exists deleted_at timestamptz;
alter table public.songs add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- Una canción en la papelera no se edita (hay que recuperarla antes). Las funciones de abajo saltan esta regla.
drop policy if exists "canciones del grupo: editar" on public.songs;
create policy "canciones del grupo: editar" on public.songs for update to authenticated
  using (is_member(group_id) and deleted_at is null)
  with check (is_member(group_id) and updated_by = auth.uid() and deleted_at is null);

create or replace function public.trash_group_song(p_song text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update songs set deleted_at = now(), deleted_by = auth.uid()
  where id = p_song and is_member(group_id) and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.restore_group_song(p_song text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform set_config('voces.sin_version', '1', true);
  update songs set deleted_at = null, deleted_by = null
  where id = p_song and is_member(group_id) and deleted_at is not null
  returning updated_at into t;
  if t is null then raise exception 'not_found'; end if;
  return t;
end $$;

-- Lo que hay en la papelera de un grupo (y, de paso, se borra del todo lo que lleva más de 30 días).
create or replace function public.group_trash(p_group uuid)
returns table (id text, title text, deleted_at timestamptz, deleted_by uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_group) then raise exception 'not_member'; end if;
  delete from songs s where s.group_id = p_group and s.deleted_at < now() - interval '30 days';
  return query
    select s.id, s.title, s.deleted_at, s.deleted_by from songs s
    where s.group_id = p_group and s.deleted_at is not null
    order by s.deleted_at desc;
end $$;

-- ---------- Historial de versiones ----------
-- Al cambiar una canción se guarda cómo estaba antes: una versión por sesión de trabajo (si la última es de hace más
-- de 10 minutos o de otra persona), como mucho las 50 últimas de cada canción.

create table if not exists public.song_versions (
  id bigserial primary key,
  song_id text not null references public.songs (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null
);
create index if not exists song_versions_song_idx on public.song_versions (song_id, saved_at desc);

alter table public.song_versions enable row level security;
drop policy if exists "versiones del grupo: ver" on public.song_versions;
create policy "versiones del grupo: ver" on public.song_versions for select to authenticated using (is_member(group_id));
-- Sin políticas de escritura: solo las guardan el disparador y `restore_song_version`.

create or replace function public.keep_song_version(s public.songs)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into song_versions (song_id, group_id, title, data, saved_by, saved_at)
  values (s.id, s.group_id, s.title, s.data, s.updated_by, s.updated_at);
  delete from song_versions v where v.song_id = s.id and v.id not in (
    select v2.id from song_versions v2 where v2.song_id = s.id order by v2.saved_at desc, v2.id desc limit 50);
end $$;

create or replace function public.songs_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('voces.sin_version', true), '') = '1' then return new; end if;
  if new.data is distinct from old.data
     and (old.updated_at < now() - interval '10 minutes' or old.updated_by is distinct from new.updated_by) then
    perform keep_song_version(old);
  end if;
  return new;
end $$;

drop trigger if exists songs_version on public.songs;
create trigger songs_version before update on public.songs
  for each row execute function public.songs_version();

-- Vuelve a una versión: la de ahora se guarda antes (siempre), así que también se puede deshacer.
create or replace function public.restore_song_version(p_version bigint)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v song_versions; cur songs; t timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v from song_versions where id = p_version;
  if v.id is null or not is_member(v.group_id) then raise exception 'not_found'; end if;
  select * into cur from songs where id = v.song_id for update;
  if cur.id is null or cur.deleted_at is not null then raise exception 'not_found'; end if;
  perform keep_song_version(cur);
  perform set_config('voces.sin_version', '1', true);
  update songs set data = v.data, title = v.title, updated_by = auth.uid() where id = v.song_id returning updated_at into t;
  perform set_config('voces.sin_version', '', true);
  return t;
end $$;

-- ---------- Repertorios del grupo ----------

create table if not exists public.group_setlists (
  id text primary key check (char_length(id) between 1 and 64),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  song_ids text[] not null default '{}' check (cardinality(song_ids) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists group_setlists_group_idx on public.group_setlists (group_id);

drop trigger if exists group_setlists_touch on public.group_setlists;
create trigger group_setlists_touch before update on public.group_setlists
  for each row execute function public.touch_updated_at();

alter table public.group_setlists enable row level security;
drop policy if exists "repertorios del grupo: ver" on public.group_setlists;
create policy "repertorios del grupo: ver" on public.group_setlists for select to authenticated using (is_member(group_id));
drop policy if exists "repertorios del grupo: crear" on public.group_setlists;
create policy "repertorios del grupo: crear" on public.group_setlists for insert to authenticated
  with check (is_member(group_id) and updated_by = auth.uid());
drop policy if exists "repertorios del grupo: editar" on public.group_setlists;
create policy "repertorios del grupo: editar" on public.group_setlists for update to authenticated
  using (is_member(group_id)) with check (is_member(group_id) and updated_by = auth.uid());
drop policy if exists "repertorios del grupo: borrar" on public.group_setlists;
create policy "repertorios del grupo: borrar" on public.group_setlists for delete to authenticated using (is_member(group_id));

-- ---------- Permisos de las funciones ----------

revoke all on function public.trash_group_song(text), public.restore_group_song(text), public.group_trash(uuid),
  public.restore_song_version(bigint) from public, anon;
grant execute on function public.trash_group_song(text), public.restore_group_song(text), public.group_trash(uuid),
  public.restore_song_version(bigint) to authenticated;
-- Solo para el disparador y las funciones de arriba.
revoke all on function public.keep_song_version(public.songs), public.songs_version() from public, anon, authenticated;
