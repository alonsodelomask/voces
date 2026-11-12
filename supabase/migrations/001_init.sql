-- Voces · esquema de la nube (Supabase / PostgreSQL)
-- Usuarios (auth.users lo gestiona Supabase), perfiles, grupos de música,
-- miembros y canciones compartidas por grupo. Todo protegido con RLS.

create extension if not exists pgcrypto;

-- ---------- Tablas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  max_members int not null default 30 check (max_members between 1 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.songs (
  id text primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists songs_group_idx on public.songs (group_id, updated_at desc);

-- Registro de uso de la IA (para limitar peticiones por usuario).
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

-- ---------- Funciones auxiliares ----------

create or replace function public.is_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_owner(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'owner');
$$;

-- Perfil automático al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before update on public.songs
  for each row execute function public.touch_updated_at();

-- ---------- RPC: crear grupo, unirse, invitación, borrar cuenta ----------

create or replace function public.create_group(p_name text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into groups (name, created_by) values (trim(p_name), auth.uid()) returning * into g;
  insert into group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g groups; n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'invalid_code'; end if;
  select count(*) into n from group_members where group_id = g.id;
  if n >= g.max_members and not exists (select 1 from group_members where group_id = g.id and user_id = auth.uid()) then
    raise exception 'group_full';
  end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create or replace function public.regenerate_invite(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_owner(p_group) then raise exception 'not_owner'; end if;
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  update groups set invite_code = code where id = p_group;
  return code;
end $$;

-- Al salir el último propietario, el miembro más antiguo pasa a ser propietario.
create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from group_members where group_id = p_group and user_id = auth.uid();
  if not exists (select 1 from group_members where group_id = p_group) then
    delete from groups where id = p_group;
  elsif not exists (select 1 from group_members where group_id = p_group and role = 'owner') then
    update group_members set role = 'owner'
    where group_id = p_group and user_id = (
      select user_id from group_members where group_id = p_group order by joined_at limit 1);
  end if;
end $$;

-- Exigido por Apple (5.1.1(v)): borrar la cuenta desde la propia app.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for gid in select group_id from group_members where user_id = auth.uid() loop
    perform leave_group(gid);
  end loop;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.leave_group(uuid), public.delete_my_account() from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.leave_group(uuid), public.delete_my_account() to authenticated;

-- ---------- Seguridad por filas (RLS) ----------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.songs enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "perfil propio o de compañeros" on public.profiles;
create policy "perfil propio o de compañeros" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
drop policy if exists "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "crear mi perfil" on public.profiles;
create policy "crear mi perfil" on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "ver mis grupos" on public.groups;
create policy "ver mis grupos" on public.groups for select to authenticated using (is_member(id));
drop policy if exists "renombrar grupo (propietario)" on public.groups;
create policy "renombrar grupo (propietario)" on public.groups for update to authenticated using (is_owner(id)) with check (is_owner(id));
drop policy if exists "borrar grupo (propietario)" on public.groups;
create policy "borrar grupo (propietario)" on public.groups for delete to authenticated using (is_owner(id));

drop policy if exists "ver miembros" on public.group_members;
create policy "ver miembros" on public.group_members for select to authenticated using (is_member(group_id));
drop policy if exists "expulsar (propietario)" on public.group_members;
create policy "expulsar (propietario)" on public.group_members for delete to authenticated using (is_owner(group_id) and user_id <> auth.uid());

drop policy if exists "canciones del grupo: ver" on public.songs;
create policy "canciones del grupo: ver" on public.songs for select to authenticated using (is_member(group_id));
drop policy if exists "canciones del grupo: crear" on public.songs;
create policy "canciones del grupo: crear" on public.songs for insert to authenticated with check (is_member(group_id) and updated_by = auth.uid());
drop policy if exists "canciones del grupo: editar" on public.songs;
create policy "canciones del grupo: editar" on public.songs for update to authenticated using (is_member(group_id)) with check (is_member(group_id) and updated_by = auth.uid());
drop policy if exists "canciones del grupo: borrar" on public.songs;
create policy "canciones del grupo: borrar" on public.songs for delete to authenticated using (is_member(group_id));
-- ai_usage: sin políticas → solo la función del servidor (service role) puede leer/escribir.

-- ---------- Tiempo real ----------
do $$ begin
  alter publication supabase_realtime add table public.songs;
exception when duplicate_object then null; end $$;
