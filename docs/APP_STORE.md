# Vocify en App Store Connect

Respuestas preparadas el 13/11/2026 a partir del código (la app se llamaba «Voces»; el repositorio y las claves internas siguen con ese nombre):

- App: `movil/` con la web de `src/` dentro. Identificador: **`es.vocify.app`**.
- Servidor: `server/`.
- Base de datos: `supabase/migrations/`.
- Web pública y textos legales: `scripts/sitio/` (se generan en `public/` con `node scripts/sitio/generar.mjs`).

**Si cambia el código, revisa este documento** y la política (`scripts/sitio/es.mjs` y `en.mjs`). La compilación y la subida se explican en [BACKEND.md](BACKEND.md), paso 6.

## 0. Estado en App Store Connect (23/11/2026)

**Versión 1.0 enviada a revisión el 23/11/2026** con la compilación 6: estado «Pendiente de revisión». Apple avisa de que tarda hasta 48 horas y manda un correo al terminar. La publicación es **manual**: cuando la aprueben, la publicas tú. Mientras esté pendiente solo se puede editar parte de la ficha; para cambiar de compilación hay que sacarla del proceso de revisión.

Revisado el 21/11/2026 en App Store Connect, TestFlight, Render, Supabase y Expo (solo lectura, con una segunda pasada que lo contrastó).

**Ya está puesto:**

- Ficha en español y en inglés (EE. UU.): texto promocional, descripción, palabras clave, URL de soporte y de marketing (secciones 2 y 2.1).
- Copyright: `2026 Pablo M. Fdez. Alonso de Lomas`.
- Capturas (sección 2.2): las 4, en orden, en el tamaño obligatorio y en el de 6,9″. Sirven para los dos idiomas.
- **Compilación 6 (1.0.0)** elegida en la versión 1.0 (23/11/2026; antes, la 5). La 6 se subió el 22/11 desde `da0313e`: lleva las líneas de pentagrama y los arreglos urgentes de la auditoría (mezcla de ensayo de cada uno, ediciones a la vez en el grupo, canciones de fuera revisadas, número de formato, recuperación de la pantalla en blanco y versión real visible). En TestFlight las compilaciones 2 a 6 están «Lista para enviar».
- *Información de la app*: categoría Música, secundaria Educación; derechos sobre el contenido «No contiene, muestra ni accede a contenido de terceros» (la canción de ejemplo es nuestra; lo que importa cada usuario es suyo); contrato de licencia estándar de Apple.
- Clasificación por edades: todas las respuestas «No» o «Ninguna» → **4+**. Las dos preguntas nuevas de Apple (ubicación compartida; citas y relaciones) respondidas «No» el 21/11/2026.
- Precio y disponibilidad: país base España (EUR), **gratis**, **174 países o regiones**. China continental se quitó el 21/11/2026 (decisión del titular): para China, Apple pide un informe de evaluación de seguridad, una declaración de servicios de IA generativa (AIGC) con su registro y una licencia ICP, y su ayuda los ata a que la app esté disponible allí. Hong Kong, Macao y Taiwán siguen. Se puede volver a añadir en *Gestionar disponibilidad* cuando se tengan esos papeles.
- Publicación de la versión: **manual** (la publicas tú cuando Apple la apruebe).
- Revisión de la app: «Es necesario iniciar sesión» marcado, usuario `revision.apple@vocify.es` con su contraseña (la cuenta se creó en Supabase el 23/11/2026 con *Auto Confirm*), datos de contacto y las notas de la sección 3 (con la ruta nueva para borrar la cuenta).
- Privacidad de la app: URL de la política en los dos idiomas y los 4 tipos de datos de la sección 1, **publicada** el 23/11/2026.
- Acuerdos de Apple (apps gratuitas y de pago), banca, impuestos y comerciante del Reglamento de Servicios Digitales: todo «Activo».
- Revocación de «Iniciar sesión con Apple»: clave `9BLRBZK3TV` creada y Render arranca con `Apple: revocación activa` (último arranque visto: 21/11/2026).

**Pasos del envío** (hechos el 23/11/2026): privacidad publicada, cuenta de demostración creada y su contraseña guardada, «Añadir a revisión» y «Enviar para revisión». Los dos avisos de China siguen en la página de la versión, pero no impidieron el envío.

**Pendiente:**

1. **Probar la compilación 6 en TestFlight** (sección 5): no consta ninguna instalación (último dato de TestFlight, del 21/11 y anterior a la 6; no se volvió a mirar al enviarla). Conviene probar ya entrar con la cuenta de demostración, entrar con Apple y borrar la cuenta; si algo falla, se puede sacar de revisión antes de que Apple la mire.
2. **Esperar la respuesta de Apple.** Si la rechazan, el motivo se lee en App Store Connect › *Revisión de apps*.
3. Cuando la aprueben: **publicarla** a mano.
4. Opcional: *Accesibilidad de la app* (sección 1).

**Riesgos conocidos que piden una compilación nueva** (no bloquean el envío; detalles en la sección 6):

- La ficha mostrará el idioma **inglés**: el binario no declara el español.
- Con el servidor dormido (plan gratuito de Render), el código de «Iniciar sesión con Apple» puede no llegar al servidor y entonces borrar la cuenta no revocaría el acceso.

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

Ninguno se usa para seguimiento. Así está publicado en App Store Connect desde el 23/11/2026 (guardado desde el 16/11).

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
2. **App Store Connect** › Vocify › App para iOS 1.0 › *Información para el equipo de revisión de apps*. «Es necesario iniciar sesión», el usuario y los datos de contacto ya están guardados: escribe la **Contraseña** y pulsa **Guardar**.
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
- **Entrar con la cuenta de demostración** y con **«Iniciar sesión con Apple»**, y **borrar la cuenta** por la ruta de las notas. Hazlo también una vez con el servidor dormido (sin usar la app ni la IA un buen rato) y comprueba después en *Ajustes › [tu nombre] › Iniciar sesión con Apple* que Vocify ya no aparece (sección 6).

## 6. Riesgos conocidos (21/11/2026)

Ninguno impide enviar la app a revisión; los dos piden una compilación nueva para arreglarlos.

### La ficha dirá que la app está en inglés

En TestFlight, los metadatos de las compilaciones 2 a 5 dicen «Información del Store › Idiomas: inglés». La App Store saca los idiomas de las localizaciones del binario, y `movil/app.json` no declara el español: solo tiene `CFBundleAllowMixedLocalizations: true`, sin `CFBundleDevelopmentRegion`, `CFBundleLocalizations` ni `locales`, así que queda el inglés que pone Expo por defecto. Arreglo: declarar el español en `movil/app.json` (mira cómo en la documentación de localización de Expo SDK 57) y compilar de nuevo. Comprueba después en TestFlight › compilación › *Metadatos de la compilación* que dice «español».

### «Iniciar sesión con Apple» con el servidor dormido

- `voces-api` está en el plan gratuito de Render: se duerme tras unos minutos sin uso y tarda unos 50 s o más en despertar. Del 16 al 21/11 solo arrancó una vez.
- Al entrar con Apple, la app manda el código de autorización a `POST /v1/apple/authorization` con un límite de **20 s** y sin avisar si falla (`signInWithApple` en `src/cloud/cloud.ts`). Ninguna otra llamada despierta antes al servidor: la app solo lo usa para eso, para la IA y para borrar la cuenta.
- Si el servidor está dormido, lo normal es que esa petición se corte. Entonces no se guarda el token de Apple y «Eliminar mi cuenta» borra la cuenta, pero **no puede revocar** el acceso de Apple (norma 5.1.1(v)). Borrar la cuenta no tiene el problema, porque espera hasta 150 s.
- No queda rastro: un canje rechazado por Apple (por ejemplo, con una `.p8` o un Key ID mal puestos) no se escribe en el registro, y en Render no se ve ningún canje ni ninguna revocación. Que salga `Apple: revocación activa` solo dice que las cuatro variables están puestas.
- Arreglos posibles: despertar el servidor al abrir la pantalla de entrar y dar a esa petición el mismo margen que a borrar la cuenta (el código de Apple vale 5 minutos), o reintentarla; escribir en el registro los fallos del canje, sin datos personales; y, mientras dure la revisión, tener `voces-api` despierto (plan de pago de Render, o una llamada periódica a `/health`). Los dos primeros piden compilación nueva.
