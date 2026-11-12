# Vocify (repositorio «Voces»)

Nombre público **Vocify**, dominio **vocify.es** (decisión del usuario, 12/11/2026). El código, las claves de almacenamiento (`voces.*`) y los servicios (`voces-api`, `voces-web`) conservan «voces»: no los renombres. Identificador de la app: `es.vocify.app`.

App para que un grupo vocal vea, escuche, componga y ensaye sus voces como líneas de neón de sintetizador. Web (Vite + TypeScript, `src/`) que también va dentro de una app de iPhone/Android con Expo (`movil/`).

Decisión del usuario (12/11/2026): **se despliega con el mismo proceso que Baulify** (repositorio privado `alonsodelomask/baulify`):

- **Supabase** en la UE: cuentas, grupos, canciones compartidas y RLS.
- **Render** en Fráncfort: `voces-api` (`server/`) y `voces-web`, desde `render.yaml`.
- **Expo + EAS**: la app de iPhone se compila y se sube en la nube. Guía: `docs/BACKEND.md`; ficha: `docs/APP_STORE.md`.

## Reglas (las mismas que en Baulify)

- Español llano en la interfaz y en la documentación; datos de ejemplo siempre ficticios.
- Los textos legales y la web pública se editan en `scripts/sitio/` y se generan con `node scripts/sitio/generar.mjs`; los datos del titular (nombre, NIF, domicilio) los pone el usuario.
- **Nada de claves en el repositorio.** Las secretas (service role, Anthropic, `.p8`, clave de cifrado) solo en Render. Las públicas (URL y clave *publishable* de Supabase, URL de la API) van en `.env.local` (ignorado) o en las variables de entorno de EAS y de Render.
- **No ejecutar** `supabase db push`, ni iniciar sesión en Supabase, Render o Expo, ni desplegar, ni `eas login`/`eas build`/`eas submit`: **lo hace el usuario** siguiendo `docs/BACKEND.md`. Sí se puede preparar todo y probarlo en local.
- Versiones exactas en todos los `package.json` (sin `^` ni `~`). Dentro de `movil/`, añade módulos con `npx expo install` y después fija la versión que instale.
- Antes de dar algo por terminado:
  - `npx tsc --noEmit -p .` (web);
  - `cd server; npm test; npx tsc -p tsconfig.json`;
  - `node scripts/probar.mjs` (con `npm run dev` en marcha);
  - si se toca la app: `npm run build:movil` y `cd movil; npx tsc --noEmit; npx expo-doctor`.
- Las migraciones de `supabase/migrations/` son aditivas e idempotentes; una nueva va con número siguiente y su paso en `docs/BACKEND.md`.

## Cómo está hecha la app nativa

- `npm run build:movil` compila la web en un único HTML (`vite --mode movil` + `vite-plugin-singlefile`) y lo escribe en `movil/src/generated/voces-html.ts` (generado, ignorado por Git). En EAS lo hace el gancho `eas-build-post-install` de `movil/package.json`.
- `movil/src/App.tsx` lo carga en un WebView con el origen fijo `https://app.voces.invalid/`: contexto seguro, almacenamiento persistente y admitido en el CORS del servidor. Hace de puente (`src/native.ts`) para guardar y compartir archivos, «Iniciar sesión con Apple» y abrir enlaces.
- No crear ni editar `movil/ios` ni `movil/android` a mano: se generan desde `movil/app.json` y los plugins.

## Expo ha cambiado: no te fíes de lo que recuerdas

Antes de tocar una API de Expo o de React Native, mira la versión de `expo` en `movil/package.json` (SDK 57) y sus tipos en `movil/node_modules`, o la documentación de esa versión: `https://docs.expo.dev/versions/v57.0.0/`.
