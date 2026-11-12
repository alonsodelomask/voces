-- Voces · el nombre que se escribe al registrarse (13/11/2026).
-- Idempotente: solo vuelve a definir la función del disparador de perfiles. No cambia ni borra datos.
-- Antes el perfil nacía con lo que va delante de la @ del correo; ahora usa el nombre del registro
-- (o el que da «Iniciar sesión con Apple») y, si no hay, lo de antes.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare nombre text;
begin
  nombre := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(nombre, split_part(new.email, '@', 1), ''), 60))
  on conflict (id) do nothing;
  return new;
end $$;
