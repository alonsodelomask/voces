-- Voces · canciones de la cuenta (17/11/2026): las canciones que no están en un grupo también se guardan en la cuenta,
-- para verlas en cualquier dispositivo donde se entre con ella (el navegador de otro ordenador, el iPhone...).
-- Aditiva e idempotente: una tabla nueva, sus reglas de acceso y el tiempo real. No cambia ni borra datos.
-- Ejecútala después de 004_biblioteca_grupo.sql.
--
-- Cada fila es una canción de una persona. La app compara las marcas de tiempo de su dispositivo (`song_updated_ms`,
-- `song_deleted_ms`, en milisegundos) con las de aquí y se queda con lo más reciente. Una canción que se comparte con un
-- grupo deja de ser «de la cuenta»: su fila se queda sin datos y con `moved_to_group`, para que los otros dispositivos
-- lo sepan y la busquen en el grupo. Una canción borrada del todo deja una fila sin datos y con `purged` (una «lápida»),
-- para que otro dispositivo que aún la tenga en su papelera no la vuelva a subir; las lápidas viejas las quita la app.
-- La grabación de audio nunca se sube: se queda en el dispositivo.

create table if not exists public.personal_songs (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  title text not null default '' check (char_length(title) <= 300),
  data jsonb check (data is null or octet_length(data::text) <= 5000000),
  song_updated_ms bigint not null,
  song_deleted_ms bigint,
  moved_to_group uuid,
  purged boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (owner_id, id),
  -- Mientras es de la cuenta lleva sus datos; al pasar a un grupo o borrarse del todo, ya no.
  check ((moved_to_group is null and not purged) = (data is not null))
);
create index if not exists personal_songs_owner_idx on public.personal_songs (owner_id, updated_at desc);

drop trigger if exists personal_songs_touch on public.personal_songs;
create trigger personal_songs_touch before update on public.personal_songs
  for each row execute function public.touch_updated_at();

-- Cada persona ve, crea, cambia y borra solo las suyas. Nadie más (ni el grupo) las ve.
alter table public.personal_songs enable row level security;
drop policy if exists "canciones de la cuenta: ver" on public.personal_songs;
create policy "canciones de la cuenta: ver" on public.personal_songs for select to authenticated using (owner_id = auth.uid());
drop policy if exists "canciones de la cuenta: crear" on public.personal_songs;
create policy "canciones de la cuenta: crear" on public.personal_songs for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "canciones de la cuenta: editar" on public.personal_songs;
create policy "canciones de la cuenta: editar" on public.personal_songs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "canciones de la cuenta: borrar" on public.personal_songs;
create policy "canciones de la cuenta: borrar" on public.personal_songs for delete to authenticated using (owner_id = auth.uid());

-- Tiempo real: un cambio en un dispositivo avisa a los demás de la misma cuenta (con las mismas reglas de acceso).
do $$ begin
  alter publication supabase_realtime add table public.personal_songs;
exception when duplicate_object then null; end $$;
