# Servidor y nube de Voces

Decisión del usuario (12/11/2026): Voces se despliega con **el mismo proceso que Baulify**:

- **Supabase** (UE): cuentas, grupos y canciones compartidas.
- **Render** (UE, Fráncfort): la API `voces-api` y la web `voces-web`.
- **Expo + EAS**: la app de iPhone se compila y se sube a App Store Connect en la nube, sin necesidad de Mac.

Este documento explica qué hay preparado en el repositorio y qué tienes que hacer tú. **Nada está desplegado todavía** (salvo la web de GitHub Pages, que funciona sin nube). No se ha llamado a Claude ni a Apple de verdad: el servidor se ha probado con proveedores simulados y datos ficticios (`cd server; npm test`).

## Cómo encaja todo

```
iPhone (app Expo: la web de Voces dentro de un WebView)
   │  sesión de Supabase (código por email o «Iniciar sesión con Apple» nativo)
   ├──────────────▶ Supabase (UE): Auth, grupos, canciones (RLS) y tiempo real
   └─HTTPS + JWT──▶ voces-api (Render, Fráncfort) ──▶ Claude (Anthropic)   ← ideas de arreglo
                         │  verifica la sesión (JWKS)                       ──▶ Apple   ← revocar al borrar la cuenta
                         └──── service role ───▶ Supabase
Navegador ─────────▶ voces-web (Render, sitio estático): la misma web + política de privacidad
```

- La **app** es la misma web: `npm run build:movil` la compila en un único HTML que va dentro de la app (`movil/`). Así funciona sin conexión y cada versión de la App Store lleva su web.
- Las claves de Anthropic, Apple y la *service role* de Supabase **solo viven en Render**. La app y la web solo conocen la URL de Supabase, su clave pública (*publishable*) y la URL de `voces-api`.
- La sincronización de canciones va directa entre la app y Supabase, protegida con RLS (cada persona solo ve los grupos en los que está). Comprobado con PGlite: alguien de fuera no puede ver, crear ni cambiar canciones de un grupo ajeno.

## Qué guarda cada tabla

| Tabla | Qué guarda | Quién la lee |
| --- | --- | --- |
| `profiles` | Nombre visible | Tú y tus compañeros de grupo |
| `groups` | Nombre, código de invitación, máximo de miembros | Miembros |
| `group_members` | Quién está en cada grupo y si es propietario | Miembros |
| `songs` | Canciones compartidas (notas, acordes, título) | Miembros del grupo |
| `ai_usage` | Fecha de cada petición a la IA (para el límite diario) | Solo el servidor |
| `apple_tokens` | Token de Apple **cifrado** (AES-256-GCM) para revocarlo al borrar la cuenta | Solo el servidor |
| `apple_revocations` | Revocaciones pendientes si Apple no respondía (sin datos de la persona) | Solo el servidor |

## La API (`server/`)

Node 24 con TypeScript sin compilar, Hono, `jose`, `zod`, `@supabase/supabase-js` y el SDK oficial de Anthropic. Son las mismas versiones que `baulify-api`, más `@anthropic-ai/sdk` 1.8.0.

| Ruta | Qué hace |
| --- | --- |
| `GET /health` | `{"ok":true}` (comprobación de Render) |
| `POST /v1/ai` | Ideas de arreglo con Claude Opus 5.5 y salida estructurada (JSON validado). Como mucho 6 por minuto y `VOCES_AI_DAILY_LIMIT` (40) al día por persona |
| `POST /v1/apple/authorization` | Tras «Iniciar sesión con Apple»: canjea el código, **comprueba que es de esa cuenta** y guarda el token cifrado |
| `DELETE /v1/account` | Revoca el acceso de Apple (o lo deja en cola si Apple no responde) y borra la cuenta; el grupo pasa al miembro más antiguo |

Todas las rutas `/v1` exigen la sesión de Supabase (JWT verificado con las claves públicas del proyecto). Los errores llevan un mensaje en español que se puede enseñar tal cual; nunca claves ni respuestas de proveedores.

**IA:** si Claude rechaza una petición, la API la reintenta automáticamente con otro modelo (`fallbacks: "default"`). Es una opción del SDK que se puede quitar en `server/src/ai.ts`.

## Costes

| Servicio | Plan | Coste |
| --- | --- | --- |
| Supabase | Free | 0 € (500 MB de base; de sobra para un grupo) |
| Render `voces-api` | Free | 0 €. Se duerme tras 15 minutos sin uso y la primera petición tarda ~1 minuto. **Starter: 7 $/mes** (no se duerme) |
| Render `voces-web` | Static | 0 € |
| Claude (Anthropic) | Pago por uso | Opus 5.5: 4 $/20 $ por millón de tokens. Una petición típica cuesta unos 0,05-0,15 $; con el límite de 40/día por persona, el peor caso para 5 personas es de unos 30 $/día |
| Apple Developer | Anual | 99 $/año (ya lo tienes por Baulify) |
| EAS (Expo) | Free | 0 € (compilaciones de iOS en cola gratuita) |

---

## Estado (12/11/2026)

- **Supabase: hecho.** Organización **PABLO** (la antigua «Baulify», renombrada: es la única organización y agrupa los proyectos; Baulify sigue dentro, sin cambios). Proyecto **Voces**, ref `jmkzsrqygurhlukqswes`, región *Central EU (Frankfurt)*, plan gratuito.
  - Migraciones `001_init.sql` y `002_servidor.sql` ejecutadas; las 7 tablas tienen RLS activado. Comprobado con la clave pública: sin sesión no se ve nada y las funciones de grupo y de borrado están bloqueadas.
  - Apple activado con el Client ID `io.github.alonsodelomask.voces`, sin *Secret Key*.
  - Site URL `https://alonsodelomask.github.io/voces/` y URL de retorno permitidas: GitHub Pages, `voces-web.onrender.com` y `localhost:5173`.
  - Correo: sin SMTP propio, Supabase no deja editar las plantillas y manda un **enlace**, no un código. En la web el enlace inicia la sesión. En el iPhone se entra con Apple o con contraseña. Para que llegue un código, configura un SMTP (paso 1.6) y añade `{{ .Token }}` a las plantillas.
- **Pendiente:** Render (paso 3), la clave de Anthropic (paso 4), EAS (paso 6) y la revocación de Apple (paso 7).

## Guía paso a paso para ti

### 1. Supabase: crear el proyecto y las tablas

1. En [supabase.com](https://supabase.com) › **New project** › nombre **Voces**, región de la UE (la misma que Baulify, *Stockholm `eu-north-1`*, o *Frankfurt*). Guarda la contraseña de la base en tu gestor de contraseñas.
2. **SQL Editor** › **New query** › pega todo `supabase/migrations/001_init.sql` › **Run**. Debe decir «Success».
3. Nueva consulta con `supabase/migrations/002_servidor.sql` › **Run**. Es **aditiva** e idempotente.
4. **Table Editor**: deben aparecer `profiles`, `groups`, `group_members`, `songs`, `ai_usage`, `apple_tokens` y `apple_revocations`, todas con «RLS enabled».
5. **Authentication › Sign In / Providers › Email**: activado. Para que llegue un **código** en vez de un enlace, en **Authentication › Emails › Templates** cambia *Magic Link* y *Confirm signup* para que incluyan `{{ .Token }}`, por ejemplo:

   ```html
   <h2>Tu código para entrar en Voces</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Caduca en una hora. Si no lo has pedido tú, ignora este correo.</p>
   ```

6. **SMTP propio** (recomendado): el correo de pruebas de Supabase solo manda unos pocos correos por hora. Pon uno gratuito (Resend, Brevo…) en *Authentication › Emails › SMTP Settings*. Si en Baulify ya tienes uno, sirve el mismo.

### 2. Supabase: copiar las claves

En **Project Settings › API Keys**:

- **Project URL** (`https://xxxx.supabase.co`): pública. Va en Render (`SUPABASE_URL` en `voces-api`, `VITE_SUPABASE_URL` en `voces-web`) y en EAS (paso 6).
- **Publishable key** (`sb_publishable_…`): pública. Va en `voces-web` y en EAS como `VITE_SUPABASE_ANON_KEY`. Nunca en `voces-api`.
- **Secret / service_role key**: **SECRETA**. Solo en Render (`SUPABASE_SERVICE_ROLE_KEY` de `voces-api`). Nunca en la app, en el chat ni en Git.

### 3. Render: crear los servicios desde el Blueprint

1. Los commits ya están en GitHub (`alonsodelomask/voces`).
2. En [render.com](https://render.com) › **New › Blueprint** › repositorio **voces**. Render lee `render.yaml` y propone dos servicios: `voces-api` (Fráncfort, plan gratuito, carpeta `server`) y `voces-web` (sitio estático).
3. Te pedirá las variables sin valor:
   - `voces-api`: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (obligatorias). Deja vacías `SUPABASE_JWT_SECRET`, `ANTHROPIC_API_KEY` y las `APPLE_…` por ahora.
   - `voces-web`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_API_URL` = `https://voces-api.onrender.com` (si Render le da otro nombre, usa el que salga).
4. **Apply**. Abre `https://voces-api.onrender.com/health`: debe responder `{"ok":true}`. En **Logs** verás `IA: desactivada` hasta el paso 4.
5. Abre `https://voces-web.onrender.com`: es la web con la nube activada. Entra con tu email, crea el grupo y comparte el código.

> Si Render pone otros nombres a los servicios (porque `voces-api` o `voces-web` ya estén cogidos), cambia `VITE_API_URL` y, en `voces-api`, `VOCES_CORS_ORIGINS` por las URL que te dé.

### 4. Activar la IA

1. En [console.anthropic.com](https://console.anthropic.com) › **API Keys** › crea una clave (por ejemplo «Voces Render») y añade saldo.
2. Render › `voces-api` › **Environment** › `ANTHROPIC_API_KEY` = la clave. Guarda (Render reinicia).
3. En **Logs** debe salir `IA: Claude (claude-opus-5-5)`. En la web: Editar › ✨ Asistente › IA.

Para probar sin gastar, pon `VOCES_AI=simulated`: responde con una voz de ejemplo.

### 5. «Iniciar sesión con Apple» en Supabase

1. **Authentication › Sign In / Providers › Apple** › *Enable*.
2. En **Client IDs** escribe `io.github.alonsodelomask.voces` (el identificador de la app, en `movil/app.json`).
3. Deja vacíos *Services ID* y *Secret Key*: el inicio nativo del iPhone no los necesita (igual que en Baulify). **Save**.

### 6. Primera compilación para TestFlight (con EAS, como Baulify)

La app está en `movil/`. EAS sube el repositorio y, en sus servidores, el gancho `eas-build-post-install` compila la web (`scripts/build-movil.mjs`) y la mete dentro de la app. Las tres variables públicas tienen que estar en EAS:

```powershell
cd "C:\Users\Alonso de Lomas\Desktop\Voces\movil"
npx eas-cli@latest login                     # tu cuenta de expo.dev (la de Baulify: alonsodelomas)
npx eas-cli@latest init                      # solo la primera vez: crea el proyecto y añade projectId a app.json
npx eas-cli@latest env:create --environment preview --name VITE_SUPABASE_URL --value https://xxxx.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment preview --name VITE_SUPABASE_ANON_KEY --value sb_publishable_... --visibility plaintext
npx eas-cli@latest env:create --environment preview --name VITE_API_URL --value https://voces-api.onrender.com --visibility plaintext
npx eas-cli@latest build -p ios --profile preview      # te pedirá tu Apple ID; crea el identificador, certificados y perfil
npx eas-cli@latest submit -p ios --profile preview --latest   # la sube a App Store Connect
```

(Para la versión pública, repite los tres `env:create` con `--environment production` y usa `--profile production`.)

La primera vez, `eas submit` te pregunta qué app de App Store Connect usar y la crea si no existe. Después añade su id (`ascAppId`) en `movil/eas.json`, en `submit.preview.ios` y `submit.production.ios`, como en Baulify, para que no vuelva a preguntar.

En App Store Connect › **TestFlight**, añádete como probador (y al resto del grupo), instala TestFlight en el iPhone y abre Voces. Comprueba:

- Que suena con el iPhone en silencio.
- Que **Editar › 🎤 Tararear** pide permiso para el micrófono y detecta las notas. **Esto no se ha podido probar sin un iPhone**: es lo primero que hay que mirar.
- Que «Iniciar sesión con Apple» y el código por email funcionan.
- Que Exportar MIDI y Grabar vídeo abren el menú de compartir.

### 7. Revocar el token de Apple al borrar la cuenta

Apple exige que, al borrar la cuenta, se revoque también el acceso de «Iniciar sesión con Apple» (norma 5.1.1(v)). Ya está en el código y probado con un Apple simulado. Sin estas variables el servidor arranca igual, avisa en el registro y «Eliminar mi cuenta» funciona, pero sin revocar.

**a) Team ID:** el mismo que en Baulify (developer.apple.com › Membership details).

**b) Clave «Sign in with Apple» (.p8):**
1. developer.apple.com › **Certificates, Identifiers & Profiles › Keys › +**.
2. Nombre «Voces revocar Apple». Marca **Sign in with Apple** › **Configure** › *Primary App ID*: `io.github.alonsodelomask.voces` (aparece tras la primera compilación con EAS) › **Save › Continue › Register**.
3. Apunta el **Key ID** y descarga el `.p8`. **Solo se descarga una vez**: guárdalo en tu gestor de contraseñas, **nunca** en la carpeta del proyecto, en Git ni en un chat.

**c) Clave de cifrado** (32 bytes al azar, sin que aparezca en pantalla). En PowerShell:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | Set-Clipboard
```

Pégala en Render (paso d) y vacía el portapapeles con `Set-Clipboard -Value ' '`. Guarda una copia en tu gestor y **no la cambies nunca**: con otra clave no se podrían descifrar los tokens ya guardados.

**d) Render › `voces-api` › Environment:** `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (el `.p8` entero, con las líneas BEGIN y END) y `APPLE_TOKEN_ENCRYPTION_KEY`. Guarda. En **Logs** debe salir `Apple: revocación activa`.

**e) Prueba en TestFlight** con una cuenta de prueba: entra con Apple, borra la cuenta (Menú › Grupo y cuenta › Eliminar mi cuenta). En el iPhone, *Ajustes › [tu nombre] › Iniciar sesión con Apple* ya no debe mostrar Voces.

### 8. Ficha de la App Store

Textos, privacidad y notas para el revisor: [APP_STORE.md](APP_STORE.md).

---

## Desarrollo y pruebas

```powershell
# Servidor con datos en memoria y la IA simulada (puerto 10000):
cd server
npm test                      # 14 pruebas
copy .env.example .env        # y pon VOCES_DATA=memory, VOCES_AI=simulated
node --env-file=.env src/index.ts

# Web contra tu nube (crea .env.local en la raíz con VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_API_URL):
npm run dev

# App: compila la web para la app y comprueba el empaquetado
npm run build:movil
cd movil; npx tsc --noEmit; npx expo-doctor
```

En Expo Go **no** funciona «Iniciar sesión con Apple» (firma con otro identificador, igual que en Baulify): la prueba real es en TestFlight.

## Lo que tendrás que hacer tú (seguridad)

- Las claves secretas (service role, Anthropic, `.p8`, clave de cifrado) **solo en Render**. Si alguna se filtra, cámbiala en su servicio y en Render.
- `.env.local` y `server/.env` están en `.gitignore`: no los subas.
- Revisa de vez en cuando el gasto en console.anthropic.com y pon un límite mensual en *Limits*.
