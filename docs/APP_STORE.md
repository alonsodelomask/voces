# Vocify en App Store Connect

Respuestas preparadas el 13/11/2026 a partir del código (la app se llamaba «Voces»; el repositorio y las claves internas siguen con ese nombre):

- App: `movil/` con la web de `src/` dentro. Identificador: **`es.vocify.app`**.
- Servidor: `server/`.
- Base de datos: `supabase/migrations/`.
- Web pública y textos legales: `scripts/sitio/` (se generan en `public/` con `node scripts/sitio/generar.mjs`).

**Si cambia el código, revisa este documento** y la política (`scripts/sitio/es.mjs` y `en.mjs`). La compilación y la subida se explican en [BACKEND.md](BACKEND.md), paso 6.

## 0. Estado en App Store Connect (16/11/2026)

Versión 1.0 «En preparación para el envío». **No se ha enviado a revisión**: eso se hace después de probar la compilación en TestFlight.

**Ya está puesto:**

- Ficha en español y en inglés (EE. UU.): texto promocional, descripción, palabras clave, URL de soporte y de marketing (secciones 2 y 2.1).
- Copyright: `2026 Pablo M. Fdez. Alonso de Lomas`.
- Capturas (sección 2.2): las 4, en orden, en el tamaño obligatorio y en el de 6,9″. Sirven para los dos idiomas.
- Compilación **2 (1.0.0)** añadida a la versión. No pidió documentación de cifrado: `ITSAppUsesNonExemptEncryption` es `false` en `movil/app.json`.
- *Información de la app*: categoría Música, secundaria Educación; derechos sobre el contenido «No contiene, muestra ni accede a contenido de terceros» (la canción de ejemplo es nuestra; lo que importa cada usuario es suyo); contrato de licencia estándar de Apple.
- Clasificación por edades: todas las respuestas «No» o «Ninguna» → **4+**.
- Precio y disponibilidad: país base España (EUR), **gratis**, los 175 países o regiones. China continental exige un número de registro ICP y permisos para la IA generativa; si Apple lo pide, quítala en *Gestionar disponibilidad*.
- Publicación de la versión: **manual** (la publicas tú cuando Apple la apruebe).
- Revisión de la app: «Es necesario iniciar sesión» marcado, usuario `revision.apple@vocify.es` y las notas de la sección 3.
- Privacidad de la app: URL de la política en los dos idiomas y los 4 tipos de datos de la sección 1, guardados como borrador.

**Lo que falta y tienes que hacer tú** (al 16/11/2026, noche):

1. **Cuenta de demostración** (sección 3): créala en Supabase y escribe su contraseña en *Información de inicio de sesión* (página de la versión 1.0) › **Guardar**. El teléfono y los datos de contacto ya están guardados.
2. **Privacidad de la app › Publicar**: al publicar declaras que las respuestas son ciertas; revísalas (sección 1) y publícalas tú.
3. Opcional: *Accesibilidad de la app* (sección 1).
4. **Compilación 4 (1.0.0)**: lleva todo lo de la web del 16/11 (biblioteca, menú y ajustes de cuenta, se abre en la biblioteca). Pruébala en TestFlight (sección 5) y comprueba que es la elegida en *Compilación* de la versión 1.0.
5. **Añadir a revisión** y enviar. Las notas para el revisor ya están al día (sin la ruta antigua de la compilación 2).

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

Ninguno se usa para seguimiento. Así está guardado (sin publicar) en App Store Connect desde el 16/11/2026; falta que pulses **Publicar** en *Privacidad de la app*.

### Accesibilidad («Accessibility Nutrition Labels», opcional)

Declara solo lo comprobado: **Modo oscuro** (la app es siempre oscura) y **Contraste suficiente**. VoiceOver funciona en menús y diálogos (botones con nombre), pero el visualizador y el editor son gráficos: no lo declares todavía.

## 2. Ficha de la tienda

| Campo | Propuesta |
| --- | --- |
| Nombre (30) | **Vocify: Ensaya voces** (puesto en App Store Connect el 16/11/2026; «Vocify» a secas estaba cogido. El usuario quería «Vocify: Ensaya voces con tu grupo de música», que tiene 43 caracteres: se repartió entre nombre y subtítulo) |
| Subtítulo (30) | **Con tu grupo de música** (puesto en App Store Connect) |
| Idioma principal | Español (España); también hay ficha en inglés (EE. UU.) con el mismo nombre y subtítulo |
| App Store Connect | ID de Apple `6835413894`, SKU `EX1794828482375` |
| Categoría | Música (secundaria: Educación) |
| Edad | 4+ |
| URL de soporte | https://vocify.es/soporte/ (inglés: https://vocify.es/en/support/) |
| URL de marketing | https://vocify.es/conoce/ (inglés: https://vocify.es/en/) |
| URL de privacidad | https://vocify.es/privacidad/ (inglés: https://vocify.es/en/privacy/) |
| Texto promocional (170) | Ve cada voz de tu grupo con su color, escucha tu parte sola, ensaya en bucle y compón tarareando. Sin anuncios y sin rastreo. |
| Contrato de licencia | El estándar de Apple (las condiciones propias están en https://vocify.es/condiciones/) |
| Palabras clave (100) | `coro,a cappella,armonía,voces,partitura,musicxml,midi,ensayo,tararear,acordes,transcribir` |
| Copyright | 2026 Pablo M. Fdez. Alonso de Lomas (el titular de las páginas legales) |

Las seis URL respondían bien el 16/11/2026.

«Novedades de esta versión» no aparece en la primera versión; se rellena a partir de la 1.0.1.

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

### 2.1 Ficha en inglés (EE. UU.)

Mismo nombre y subtítulo. La app solo está en español, y la descripción lo dice al final.

**Texto promocional:**

> See each voice of your group in its own color, hear your part alone, loop the hard bars and compose by humming. No ads, no tracking.

**Palabras clave:** `choir,a cappella,harmony,vocal,voices,sheet music,musicxml,midi,rehearsal,hum,chords,transcribe`

**Descripción:**

> Vocify turns your group's scores and recordings into colored lines that move with the music, like a synthesizer: each voice in its own color, the exact note at every moment and the chord that is sounding.
>
> • Import MusicXML or MIDI from MuseScore, Flat, Sibelius or Finale. Repeats are respected.
> • Only have a recording? Import the audio (WAV, MP3, M4A…) and Vocify turns it into voices, right on your phone.
> • Listen to each voice solo or mute it, slow it down and loop the hard bars with a metronome.
> • Compose by humming: you sing and Vocify turns it into notes.
> • Edit notes and chords with your finger, transpose and undo whenever you like.
> • The assistant checks the voices, suggests chords and creates harmonies. With AI, ask for changes in plain words.
> • If you play, it shows how to play each chord on guitar, ukulele or piano.
> • Create your group, invite with a code and work together on the same song, synced instantly.
> • Export to MIDI or record a vertical video for social media.
>
> No ads and no tracking. Works without an account and offline. You only need an account to share with your group and to use the AI.
>
> The app is currently in Spanish.

### 2.2 Capturas

Generadas con `node scripts/capturas.mjs` (con `npm run dev` en marcha) en `docs/capturas-app-store/`, a 1320×2868 (iPhone de 6,9″):

1. `visualizar.png` — el visualizador con un acorde («Cada voz, su color»).
2. `voces.png` — el panel de voces con Solo y Silencio («Ensaya tu parte»).
3. `editar.png` — el editor con la fila de acordes («Edita notas y acordes»).
4. `asistente.png` — el asistente («Armonías en un toque»).

Si quieres más: `ESCENAS=entrada,guitarra,piano node scripts/capturas.mjs`.

**Ojo con los tamaños (cambió en 2026):** en el *Gestor de recursos multimedia* el hueco **obligatorio** es ahora «iPhone con Dynamic Island (pantalla mediana)», de 6,1″ o 6,3″, y solo admite 1179×2556 o **1206×2622**. El de 6,9″ (1320×2868) es opcional («pantalla grande»). El 16/11/2026 se subieron:

- al hueco obligatorio, las 4 capturas reducidas a 1206×2622 (misma proporción; se redujeron con alta calidad, sin recortar);
- a «pantalla grande», las 4 originales de 1320×2868, para que se vean nítidas en los iPhone grandes.

Las de 1206×2622 no están en el repositorio. Si rehaces las capturas, genera también ese tamaño (o redúcelas) antes de subirlas.

## 3. Notas para el revisor (App Review Information)

### Cuenta de demostración

Correo: **`revision.apple@vocify.es`** (ficticio, de tu dominio; con *Auto Confirm* no hace falta que el buzón exista. Si algún día Apple pide recuperar la contraseña, crea ese buzón en Hostinger).

1. **Supabase** › proyecto Voces › *Authentication › Users › Add user › Create new user*. Correo `revision.apple@vocify.es`, una contraseña nueva y larga (guárdala en tu gestor), **Auto Confirm User** marcado › *Create user*.
2. **App Store Connect** › Vocify › App para iOS 1.0 › *Información para el equipo de revisión de apps*. «Es necesario iniciar sesión» ya está marcado y el usuario ya está escrito: escribe la **Contraseña**, rellena los **Datos de contacto** (nombre, apellidos, teléfono y correo, por ejemplo soporte@vocify.es) y pulsa **Guardar**.
3. Prueba a entrar con esa cuenta en la app de TestFlight antes de enviar.

No hace falta crearle grupo ni canciones: el revisor puede crear un grupo y usar la IA (límite diario de `VOCES_AI_DAILY_LIMIT`).

### Notas (ya puestas en App Store Connect)

```
Vocify works fully without an account: tap «Continuar sin cuenta» on the first screen. The welcome screen offers «Escuchar el ejemplo» (a sample song; also in Menu ⋮ → Cargar ejemplo). Play it, edit it, hum, or import a score or an audio recording.

An account is only needed for the group and the AI assistant: use the demo account above on the first screen (email + password). Sign in with Apple is also available. After signing in, the app opens the library (Biblioteca), where you pick a song; the library is also behind the Vocify logo.

Microphone: Editar → Tararear converts singing into notes; audio is analysed on-device and never stored or sent.
Audio import: Importar → choose a WAV/MP3 → converted on-device into voices; the file is not uploaded.

Account deletion (also revokes Sign in with Apple): tap the circle with your initials (top right) → Ajustes de cuenta → Tus datos → Eliminar mi cuenta. Also reachable from Menu (⋮) → Ajustes de cuenta.
Data download: same place → Descargar mis datos.

The app interface is in Spanish.
```

## 4. Lista de comprobación de requisitos de Apple

| Norma | Estado |
| --- | --- |
| 4.2 Funcionalidad mínima (no ser «una web en una app») | Funciona sin conexión (la web va dentro de la app), usa el micrófono, «Abrir con…» desde otras apps, el menú de compartir y «Iniciar sesión con Apple» nativos, y tiene editor, audio, transcripción y grabación |
| 4.8 Iniciar sesión con Apple | Ofrecido en el iPhone junto al correo y la contraseña |
| 5.1.1(v) Borrar la cuenta en la app | Círculo con las iniciales (o Menú) › Ajustes de cuenta › Tus datos › Eliminar mi cuenta (en la compilación 2: Menú › Grupo y cuenta) → `DELETE /v1/account`, con revocación del token de Apple (si el servidor no responde, la función `delete_my_account` de Supabase) |
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
