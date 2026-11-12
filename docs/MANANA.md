# Lo que falta para tener Voces en la App Store (12/11/2026, noche)

## Ya está hecho

| Pieza | Estado | Dónde |
| --- | --- | --- |
| **Supabase** | ✅ Proyecto **Voces** en la organización **PABLO** (Fráncfort): tablas con RLS, Apple activado y URLs de retorno configuradas | ref `jmkzsrqygurhlukqswes` |
| **Web en Render** | ✅ Publicada, con grupos y cuentas | https://voces-web.onrender.com |
| **API en Render** | ✅ Desplegada en **modo espera** (`/health` responde; la IA y «Eliminar mi cuenta» esperan a las claves) | https://voces-api-0wt8.onrender.com |
| **Web en GitHub Pages** | ✅ La misma web, también conectada | https://alonsodelomask.github.io/voces/ |
| **App de iPhone (Expo)** | ✅ Lista para compilar con EAS (`movil/`) | `movil/app.json`, `movil/eas.json` |
| **Capturas App Store** | ✅ 4 capturas de 1320×2868 (iPhone de 6,9") | `docs/capturas-app-store/` |
| **Ficha, privacidad y notas para el revisor** | ✅ Redactadas | [APP_STORE.md](APP_STORE.md) |
| **Política de privacidad** | ✅ Publicada y enlazada dentro de la app | https://voces-web.onrender.com/privacidad.html |

## Lo que te toca (unos 30 minutos)

No lo he hecho porque hay que pegar claves secretas o entrar con tu Apple ID, y eso solo puedes hacerlo tú.

### 1. Conectar la API a la base de datos (2 minutos)

1. Supabase › proyecto **Voces** › **Project Settings › API Keys** › en *Secret keys*, copia la clave (`sb_secret_…`).
2. Render › **voces-api** › **Environment** › `SUPABASE_SERVICE_ROLE_KEY` › pega › **Save changes**.
3. En **Logs** debe desaparecer «MODO ESPERA».

### 2. Activar la IA (3 minutos)

1. https://console.anthropic.com › **API Keys** › crea «Voces Render» y añade saldo (con 5-10 € sobra para empezar).
2. Render › **voces-api** › **Environment** › `ANTHROPIC_API_KEY` › pega › **Save changes**.
3. En **Logs**: `IA: Claude (claude-opus-5-5)`.

Si Claude rechaza una petición, se reintenta sola con otro modelo (`fallbacks: "default"` en `server/src/ai.ts`). Se puede quitar si no lo quieres.

### 3. Cuenta de demostración para Apple (2 minutos)

Supabase › **Authentication › Users › Add user › Create new user**: un email tuyo de pruebas, una contraseña y marca **Auto Confirm User**. Apunta ambos datos para el paso 6.

### 4. Compilar la app en la nube (EAS, como Baulify)

```powershell
cd "C:\Users\Alonso de Lomas\Desktop\Voces\movil"
npm install
npx eas-cli@latest login
npx eas-cli@latest init
powershell -ExecutionPolicy Bypass -File .\configurar-eas.ps1
npx eas-cli@latest build -p ios --profile preview
```

- `configurar-eas.ps1` sube a EAS las tres variables públicas, sacadas de `..\.env.local`.
- El `build` te pedirá tu Apple ID: es la misma cuenta de desarrollador que Baulify. Crea el identificador `io.github.alonsodelomask.voces` con «Iniciar sesión con Apple», los certificados y el perfil.

### 5. Subirla a TestFlight

```powershell
npx eas-cli@latest submit -p ios --profile preview --latest
```

La primera vez te pregunta qué app de App Store Connect usar y la crea. Después pásame el número que sale (`ascAppId`) y lo dejo puesto en `eas.json`, como en Baulify.

En TestFlight, comprueba sobre todo **Tararear** (el micrófono dentro de la app) y que **suena con el iPhone en silencio**. Es lo único que no se ha podido probar sin un iPhone.

### 6. Ficha de App Store Connect

Copia los textos, las respuestas de privacidad y las notas para el revisor de [APP_STORE.md](APP_STORE.md), con la cuenta del paso 3, y sube las capturas de `docs/capturas-app-store/`. Después, **Enviar a revisión**.

### 7. (Opcional) Revocación de Apple al borrar la cuenta

Hazlo después de la primera compilación (paso 7 de [BACKEND.md](BACKEND.md)): crear la clave `.p8` y poner en Render las 4 variables `APPLE_…`. Sin ellas, «Eliminar mi cuenta» funciona igual, pero no revoca el acceso de Apple.

## Notas

- **Render gratuito:** `voces-api` se duerme tras 15 minutos sin uso; la primera petición a la IA tarda alrededor de 1 minuto. Cuando el grupo lo use a diario, pásalo a **Starter (7 $/mes)**, como hiciste con Baulify.
- **Correo:** sin SMTP propio, Supabase manda un **enlace** para entrar, que en la web funciona. En el iPhone se entra con Apple o con contraseña.
- **Organización de Supabase:** «Baulify» se llama ahora **PABLO** y es tu única organización. El proyecto Baulify sigue dentro, sin cambios en sus claves ni en su URL.
- **Render:** el Blueprint se llama `voces` y usa el repositorio público, así que no despliega solo al hacer `git push`. Para actualizar: Render › Blueprints › voces › **Manual sync**, o en cada servicio **Manual Deploy**. Igual que Baulify, que tenía `autoDeploy: false`.
