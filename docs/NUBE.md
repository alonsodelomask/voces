# Activar la nube: cuentas, grupos compartidos e IA

Sin nube, Voces funciona entera en cada dispositivo. Con la nube se activan:

- **Cuentas** con código por email (sin contraseñas).
- **Grupos de música**: creas el grupo, eliges cuántos miembros admite y compartes un código de invitación.
- **Canciones compartidas** que se sincronizan solas entre los miembros. Si alguien cambia la canción que tienes abierta, la ves actualizada.
- **IA (Claude)** en el asistente.

Se usa **Supabase** (base de datos y autenticación; el plan gratuito es suficiente para un grupo) y, para la IA, la **API de Anthropic** (de pago por uso).

## 1. Crear el proyecto de Supabase (10 minutos)

1. Crea una cuenta en <https://supabase.com> → **New project** (región: Europa, p. ej. *West EU (Ireland)*). Guarda la contraseña de la base de datos.
2. **SQL Editor → New query** → pega todo el contenido de [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql) → **Run**. Esto crea las tablas, la seguridad por filas (cada uno solo ve lo de sus grupos) y las funciones para crear grupos, unirse y borrar la cuenta.
3. **Authentication → Sign In / Providers → Email**: activado. Desactiva *Confirm email* si no quieres el email de confirmación (el código ya verifica el email).
4. **Authentication → Emails → Templates → Magic Link**: cambia el cuerpo para que envíe el **código** en vez de un enlace, por ejemplo:

   ```html
   <h2>Tu código para entrar en Voces</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Caduca en una hora. Si no lo has pedido tú, ignora este email.</p>
   ```

   Haz lo mismo en la plantilla **Confirm signup** (la usa la primera vez que alguien entra).
5. **Email por SMTP propio** (recomendado): el email de pruebas de Supabase solo envía unos pocos correos por hora. Para el grupo, configura un SMTP gratuito (por ejemplo, Resend o Brevo) en *Authentication → Emails → SMTP Settings*.

## 2. Conectar la app

En **Project Settings → API** copia la *Project URL* y la *anon public key*. En la carpeta del proyecto:

```bash
cp .env.example .env.local
# edita .env.local con esos dos valores
```

La *anon key* es pública por diseño: la seguridad la ponen las políticas RLS del paso 1.

Después:

```bash
npm run deploy      # publica la web con la nube activada
npm run cap:sync    # actualiza las apps de iOS/Android
```

## 3. Activar la IA (opcional)

1. Crea una clave en <https://console.anthropic.com> → *API Keys* y añade saldo.
2. Desde la carpeta del proyecto:

   ```bash
   npx supabase login
   npx supabase link --project-ref TU_REF      # la ref aparece en la URL del proyecto
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy ai
   ```

La clave de Anthropic se queda en el servidor de Supabase y nunca llega a la app.

**Coste orientativo:** se usa Claude Opus 5.5 (4 $/20 $ por millón de tokens de entrada/salida). Una petición típica, con una canción de 3-4 voces, sale por unos 0,05-0,15 $. Cada usuario tiene un límite de **40 peticiones al día**; puedes cambiarlo con:

```bash
npx supabase secrets set AI_DAILY_LIMIT=20
```

## 4. Cómo se usa (para el grupo)

1. Cada miembro: **Menú → Grupo y cuenta** → pone su email → recibe un código → entra y pone su nombre.
2. Quien organiza: **＋ Crear grupo** → nombre y número máximo de miembros → comparte el **código de invitación** (botón *Compartir*).
3. Los demás: **🔑 Unirme con código**.
4. Con una canción abierta: **⇪ Compartir con el grupo**. A partir de ahí, cualquier cambio de cualquiera se sincroniza. El punto de color junto al logo indica el estado: verde = sincronizada, amarillo = guardando, rojo = sin conexión o sin sesión.
5. Las canciones del grupo aparecen en ese mismo panel; tocar una la abre.

> Si dos personas editan la misma canción a la vez, se queda la última versión guardada. Si llega un cambio mientras estás editando, la app te avisa y no pisa lo que estás haciendo.
