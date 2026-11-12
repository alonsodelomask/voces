# Vocify en App Store Connect

Respuestas preparadas el 13/11/2026 a partir del código (la app se llamaba «Voces»; el repositorio y las claves internas siguen con ese nombre):

- App: `movil/` con la web de `src/` dentro. Identificador: **`es.vocify.app`**.
- Servidor: `server/`.
- Base de datos: `supabase/migrations/`.
- Web pública y textos legales: `scripts/sitio/` (se generan en `public/` con `node scripts/sitio/generar.mjs`).

**Si cambia el código, revisa este documento** y la política (`scripts/sitio/es.mjs` y `en.mjs`). La compilación y la subida se explican en [BACKEND.md](BACKEND.md), paso 6.

## 1. Privacidad de la app («App Privacy»)

### Respuesta general

- **¿Recoges datos de esta app?** Sí, pero solo de quien crea una cuenta: correo, nombre, grupos y las canciones que comparte. Sin cuenta, todo se queda en el teléfono.
- **Seguimiento (tracking): No.** No hay publicidad, IDFA ni SDK de analítica. No hace falta el aviso de App Tracking Transparency.
- **Micrófono y audio importado:** «Tararear» y «Convertir audio en voces» analizan el audio **en el teléfono** y solo guardan las notas resultantes. El audio no se envía ni se guarda, así que **no** se declara «Audio».

### Tipo por tipo

| Tipo de Apple | ¿Se recoge? | ¿Vinculado? | Finalidad | Dónde está en el código |
| --- | --- | --- | --- | --- |
| Información de contacto › Correo electrónico | Sí | Sí | Funcionalidad de la app | Inicio de sesión (Supabase Auth) |
| Información de contacto › Nombre | Sí | Sí | Funcionalidad de la app | `profiles.display_name`, y el nombre de Apple la primera vez |
| Contenido del usuario › Otro contenido | Sí | Sí | Funcionalidad de la app | Canciones compartidas (`songs`) y texto enviado a la IA |
| Identificadores › ID de usuario | Sí | Sí | Funcionalidad de la app | Id de la cuenta de Supabase |
| Audio | **No** | — | — | Se analiza en el dispositivo (`src/hum/`, `src/import/audio.ts`) |
| Uso, diagnóstico, ubicación, contactos, fotos | **No** | — | — | — |

### Accesibilidad («Accessibility Nutrition Labels», opcional)

Declara solo lo comprobado: **Modo oscuro** (la app es siempre oscura) y **Contraste suficiente**. VoiceOver funciona en menús y diálogos (botones con nombre), pero el visualizador y el editor son gráficos: no lo declares todavía.

## 2. Ficha de la tienda

| Campo | Propuesta |
| --- | --- |
| Nombre | **Vocify** (si está cogido: «Vocify – Voces del grupo») |
| Subtítulo (30) | Ve y ensaya las voces del grupo |
| Categoría | Música (secundaria: Educación) |
| Edad | 4+ |
| URL de soporte | https://vocify.es/soporte/ |
| URL de marketing | https://vocify.es/conoce/ |
| URL de privacidad | https://vocify.es/privacidad/ |
| Contrato de licencia | El estándar de Apple (las condiciones propias están en https://vocify.es/condiciones/) |
| Palabras clave (100) | `coro,a cappella,armonía,voces,partitura,musicxml,midi,ensayo,tararear,acordes,transcribir` |
| Copyright | 2026 (el nombre del titular, el mismo de las páginas legales) |

Las URL funcionan cuando el dominio apunte a Render ([DOMINIO.md](DOMINIO.md)). Mientras tanto, las mismas páginas están en `https://voces-web.onrender.com/soporte/`, `/privacidad/`…

### Descripción

> Vocify convierte las partituras y las grabaciones de tu grupo en líneas de colores que se mueven con la música, como un sintetizador: cada voz con su color, la nota exacta en cada momento y el acorde que suena.
>
> • Importa MusicXML o MIDI desde MuseScore, Flat, Sibelius o Finale. Respeta las repeticiones.
> • ¿Solo tenéis una grabación? Importa el audio (WAV, MP3, M4A…) y Vocify lo convierte en voces, en tu propio teléfono.
> • Escucha cada voz sola o silénciala, baja la velocidad y repite en bucle los compases difíciles con metrónomo.
> • Compón tarareando: cantas y Vocify lo convierte en notas.
> • Edita notas y acordes con el dedo, transpón y deshaz cuando quieras.
> • El asistente revisa las voces, propone acordes y crea armonías. Con la IA, pídele cambios en lenguaje normal.
> • Si tocas, muestra cómo se hace cada acorde en guitarra, ukelele o piano.
> • Crea el grupo, invita con un código y trabajad todos sobre la misma canción, sincronizada al momento.
> • Exporta a MIDI o graba un vídeo vertical para redes.
>
> Sin anuncios y sin rastreo. Funciona sin cuenta y sin conexión. La cuenta solo hace falta para compartir con el grupo y usar la IA.

### Capturas (iPhone de 6,9", 1320×2868)

Generadas con `node scripts/capturas.mjs` (con `npm run dev` en marcha) en `docs/capturas-app-store/`:

1. `visualizar.png` — el visualizador con un acorde («Cada voz, su color»).
2. `voces.png` — el panel de voces con Solo y Silencio («Ensaya tu parte»).
3. `editar.png` — el editor con la fila de acordes («Edita notas y acordes»).
4. `asistente.png` — el asistente («Armonías en un toque»).

Si quieres más: `ESCENAS=entrada,guitarra,piano node scripts/capturas.mjs`.

## 3. Notas para el revisor (App Review Information)

Crea en Supabase un usuario de demostración con contraseña: *Authentication › Users › Add user › Create new user*, marcando *Auto Confirm User*. Ponlo en **Sign-in required**:

```
Email: (el de la cuenta de demostración)
Password: (su contraseña)

Vocify works fully without an account: tap «Continuar sin cuenta» on the first screen, then load the sample
(Menu ⋮ → Cargar ejemplo), play it, edit it, hum, or import a score or an audio recording.
An account is only needed for shared groups and the AI assistant: use the demo account above on the first screen
(email + password). Sign in with Apple is also available.
Microphone: Editar → Tararear converts singing into notes; audio is analysed on-device and never stored or sent.
Audio import: Importar → choose a WAV/MP3 → converted on-device into voices; the file is not uploaded.
Account deletion: Menu (⋮) → Grupo y cuenta → Eliminar mi cuenta (also revokes Sign in with Apple).
Data download: Menu (⋮) → Grupo y cuenta → Descargar mis datos.
```

## 4. Lista de comprobación de requisitos de Apple

| Norma | Estado |
| --- | --- |
| 4.2 Funcionalidad mínima (no ser «una web en una app») | Funciona sin conexión (la web va dentro de la app), usa el micrófono, «Abrir con…» desde otras apps, el menú de compartir y «Iniciar sesión con Apple» nativos, y tiene editor, audio, transcripción y grabación |
| 4.8 Iniciar sesión con Apple | Ofrecido en el iPhone junto al correo y la contraseña |
| 5.1.1(v) Borrar la cuenta en la app | Grupo y cuenta › Eliminar mi cuenta → `DELETE /v1/account`, con revocación del token de Apple (si el servidor no responde, la función `delete_my_account` de Supabase) |
| 5.1.1 No exigir cuenta sin motivo | «Continuar sin cuenta» en la primera pantalla; todo funciona sin cuenta salvo grupos e IA |
| 5.1.2 Datos y privacidad | Política en https://vocify.es/privacidad/, enlazada dentro de la app (Ayuda y pantalla de entrar); IA solo con texto de la canción |
| 1.2 Contenido generado por usuarios | Solo se comparte dentro de grupos privados con código de invitación; no hay contenido público |
| Permiso del micrófono | Texto en `movil/app.json` (plugin `expo-audio`) que explica el uso |
| Cifrado | `ITSAppUsesNonExemptEncryption = false` (solo HTTPS) |
| 2.1 Que no falle en la revisión | Probar antes en TestFlight (BACKEND.md, paso 6) y dejar la cuenta de demostración |

## 5. Qué falta comprobar en un iPhone real (TestFlight)

- **Tararear** dentro de la app (micrófono en el WebView con iOS 15 o posterior).
- **Convertir audio en voces**: que el modelo cargue en el WebView (usa la tarjeta gráfica y, si falla, el procesador) y cuánto tarda una canción de 3 minutos.
- **Abrir un audio o una partitura** desde WhatsApp o Archivos con «Compartir → Vocify».
- **Sonido con el iPhone en silencio** (`playsInSilentMode`).
- **Grabar vídeo** (MediaRecorder en iOS) y compartirlo.
- **Rotación**: la app admite horizontal; si algo se ve mal, cambia `orientation` a `portrait` en `movil/app.json`.
