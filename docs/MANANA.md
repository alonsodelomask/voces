# Para mañana: Vocify (13/11/2026)

## Lo nuevo de esta noche

- **La app se llama Vocify.** Cambiados el nombre en la web, la app, la pantalla de entrada, el aviso de bienvenida, la IA, el manifiesto y la ficha. Identificador de la app: **`es.vocify.app`** (aún no se había compilado, así que era el momento). Lo interno (`voces.*`, `voces-api`, `voces-web`) no cambia y nadie pierde canciones.
- **Importar audio → voces** (WAV, MP3, M4A, AAC, OGG, OPUS, FLAC, WEBM, AIFF, CAF). Botón *Importar* de siempre: si es audio, pregunta cuántas voces se oyen, el ritmo, el tempo, el tramo y la sensibilidad, y lo convierte **en el dispositivo** (el audio no sale de él). También funciona dentro de la app del iPhone y al abrir un audio desde WhatsApp o Archivos.
  - Con voces sintetizadas acierta casi todo (grave 100 %, aguda 83 %, tempo exacto).
  - Con vuestra grabación de «La vida es una copa de licor» (primeros 72 s, comparada con la partitura): **el 88 % de las notas que saca son correctas** y acierta la melodía principal en 2 de cada 3 momentos, pero **solo encuentra 1 de cada 4 notas de la partitura** (las voces interiores se mezclan). Además, la grabación está **un tono más baja** que la partitura. Sirve como punto de partida para corregir en el editor; ninguna herramienta separa bien cinco voces a la vez en una sola pista.
  - **Una pista por voz:** si cada uno graba la suya (empezando todos en el mismo punto, p. ej. con el mismo clic), importa la primera y después las demás con «Añadir a «…» como voz nueva»: quedan juntas y alineadas en la misma canción, y con una sola voz por pista la precisión es mucho mayor.
- **Quitar una canción del grupo**: en *Mis canciones*, botón ⊘ (antes no se podía). Si alguien la quita, en los demás móviles se queda como canción propia y no vuelve a subirse sola.
- **Web pública** en `public/`, generada desde `scripts/sitio/`:
  - `/conoce/` (presentación con capturas), `/privacidad/`, `/condiciones/`, `/soporte/`, `/borrar-cuenta/`;
  - en inglés: `/en/`, `/en/privacy/`, `/en/terms/`, `/en/support/`, `/en/delete-account/`;
  - `robots.txt`, `sitemap.xml`; `privacidad.html` redirige a `/privacidad/`.
  - La app enlaza a privacidad, condiciones y ayuda (en el iPhone, a `https://vocify.es/…`).
- **Capturas nuevas** para la App Store (`docs/capturas-app-store/`) y para la web (`public/conoce/img/`).
- Documentos al día: [APP_STORE.md](APP_STORE.md) (URL de vocify.es, privacidad, notas para el revisor), [BACKEND.md](BACKEND.md), [DOMINIO.md](DOMINIO.md) (nuevo).

**No he desplegado nada** (ni Render ni GitHub Pages) ni he tocado Supabase, Hostinger o Apple: está todo guardado en Git y subido a GitHub.

## Lo que te toca

### 1. Tus datos en las páginas legales (5 minutos)

Las páginas muestran «pendiente» en titular, NIF y domicilio. Rellena `titular`, `nif` y `domicilio` en `scripts/sitio/comun.mjs` (o dímelo y lo hago) y ejecuta:

```powershell
node scripts/sitio/generar.mjs
```

### 2. Dominio vocify.es → Render (15 minutos + propagación)

Paso a paso en [DOMINIO.md](DOMINIO.md): *Manual sync* del Blueprint en Render, registros DNS en Hostinger (`A @ 216.24.57.1`, `CNAME www voces-web.onrender.com`, sin `AAAA`), URL en Supabase y el buzón `soporte@vocify.es`.

### 3. Publicar la web nueva

- Render: **Blueprints › voces › Manual sync** (aplica dominio y CORS) y **voces-web › Manual Deploy**.
- GitHub Pages (copia): `npm run deploy`.

### 4. Apple en Supabase: identificador nuevo (1 minuto)

Supabase › **Authentication › Sign In / Providers › Apple** › *Client IDs*: cambia `io.github.alonsodelomask.voces` por **`es.vocify.app`** › **Save**.

### 5. Lo que ya estaba pendiente

1. **Conectar la API a la base de datos:** Supabase › proyecto **Voces** › *Project Settings › API Keys* › copia la *Secret key* (`sb_secret_…`) → Render › **voces-api** › *Environment* › `SUPABASE_SERVICE_ROLE_KEY` › **Save changes**. En *Logs* debe desaparecer «MODO ESPERA».
2. **Activar la IA:** https://console.anthropic.com › *API Keys* › crea «Vocify Render» (con 5-10 € de saldo sobra para empezar) → Render › **voces-api** › `ANTHROPIC_API_KEY`.
3. **Cuenta de demostración para Apple:** Supabase › *Authentication › Users › Add user*, con contraseña y *Auto Confirm User*.
4. **Compilar con EAS** (como Baulify):

```powershell
cd "C:\Users\Alonso de Lomas\Desktop\Voces\movil"
npm install
npx eas-cli@latest login
npx eas-cli@latest init
powershell -ExecutionPolicy Bypass -File .\configurar-eas.ps1
npx eas-cli@latest build -p ios --profile preview
```

   El `build` te pedirá tu Apple ID: crea el identificador **`es.vocify.app`** con «Iniciar sesión con Apple». Como el *slug* ha pasado a `vocify`, `eas init` creará el proyecto «vocify» en Expo.

5. **TestFlight:** `npx eas-cli@latest submit -p ios --profile preview --latest` y pásame el `ascAppId`. Prueba sobre todo: Tararear, **convertir un audio**, abrir un audio desde WhatsApp, y que suene con el iPhone en silencio.
6. **Ficha de App Store Connect:** textos, privacidad y notas del revisor en [APP_STORE.md](APP_STORE.md); capturas en `docs/capturas-app-store/`.
7. (Opcional) **Revocación de Apple** al borrar la cuenta: paso 7 de [BACKEND.md](BACKEND.md).

## Notas

- **Render gratuito:** `voces-api` se duerme tras 15 minutos sin uso; la primera petición a la IA tarda alrededor de 1 minuto. Con uso diario, **Starter (7 $/mes)**, como Baulify.
- **Correo:** con el buzón de vocify.es puedes poner SMTP propio en Supabase ([DOMINIO.md](DOMINIO.md), paso 5): los correos saldrán de `@vocify.es` y sin el límite del correo gratuito.
- **Tamaño:** la conversión de audio añade ~1,7 MB a la app (el modelo y TensorFlow). En la web solo se descarga la primera vez que alguien convierte un audio.
