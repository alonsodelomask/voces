-- Voces · lo que necesita el servidor de Render (12/11/2026).
-- Aditiva e idempotente: dos tablas nuevas y vacías y una función sólo para el servidor. No cambia ni borra datos.
-- Ejecútala después de 001_init.sql.

-- Token de «Iniciar sesión con Apple», cifrado en el servidor (AES-256-GCM), para revocarlo al borrar la cuenta.
create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null check (char_length(token) < 4000),
  updated_at timestamptz not null default now()
);

-- Cola de revocaciones pendientes (Apple no respondía). Sin datos de la persona: sólo el token cifrado.
create table if not exists public.apple_revocations (
  id bigserial primary key,
  token text not null check (char_length(token) < 4000),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists apple_revocations_next_idx on public.apple_revocations (next_at);

-- RLS sin políticas: sólo el servidor (service role) puede leerlas o escribirlas.
alter table public.apple_tokens enable row level security;
alter table public.apple_revocations enable row level security;

-- Antes de borrar a alguien de Auth: sale de sus grupos (el más antiguo hereda la propiedad; un grupo vacío se borra).
create or replace function public.delete_account_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  for gid in select group_id from group_members where user_id = p_user loop
    delete from group_members where group_id = gid and user_id = p_user;
    if not exists (select 1 from group_members where group_id = gid) then
      delete from groups where id = gid;
    elsif not exists (select 1 from group_members where group_id = gid and role = 'owner') then
      update group_members set role = 'owner'
      where group_id = gid and user_id = (select user_id from group_members where group_id = gid order by joined_at limit 1);
    end if;
  end loop;
  delete from ai_usage where user_id = p_user;
end $$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
