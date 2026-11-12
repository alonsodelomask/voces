# Voces en App Store Connect

Respuestas preparadas el 12/11/2026 a partir del código:

- App: `movil/` con la web de `src/` dentro.
- Servidor: `server/`.
- Base de datos: `supabase/migrations/`.

**Si cambia el código, revisa este documento** y la política (`public/privacidad.html`). La compilación y la subida se explican en [BACKEND.md](BACKEND.md), paso 6.

## 1. Privacidad de la app («App Privacy»)

### Respuesta general

- **¿Recoges datos de esta app?** Sí, pero solo de quien crea una cuenta: email, nombre, grupos y las canciones que comparte. Sin cuenta, todo se queda en el teléfono.
- **Seguimiento (tracking): No.** No hay publicidad, IDFA ni SDK de analítica. No hace falta el aviso de App Tracking Transparency.
- **Micrófono:** «Tararear» analiza el audio **en el teléfono** y solo guarda las notas resultantes. El audio no se envía ni se guarda, así que **no** se declara «Audio».

### Tipo por tipo

| Tipo de Apple | ¿Se recoge? | ¿Vinculado? | Finalidad | Dónde está en el código |
| --- | --- | --- | --- | --- |
| Información de contacto › Correo electrónico | Sí | Sí | Funcionalidad de la app | Inicio de sesión (Supabase Auth) |
| Información de contacto › Nombre | Sí | Sí | Funcionalidad de la app | `profiles.display_name`, y el nombre de Apple la primera vez |
| Contenido del usuario › Otro contenido | Sí | Sí | Funcionalidad de la app | Canciones compartidas (`songs`) y texto enviado a la IA |
| Identificadores › ID de usuario | Sí | Sí | Funcionalidad de la app | Id de la cuenta de Supabase |
| Audio | **No** | — | — | Se analiza en el dispositivo (`src/hum/`) |
| Uso, diagnóstico, ubicación, contactos, fotos | **No** | — | — | — |

## 2. Ficha de la tienda

| Campo | Propuesta |
| --- | --- |
| Nombre | **Voces** (si está cogido: «Voces – Armonías del grupo») |
| Subtítulo (30) | Ve y ensaya las voces del grupo |
| Categoría | Música (secundaria: Educación) |
| Edad | 4+ |
| URL de soporte | https://github.com/alonsodelomask/voces/issues |
| URL de privacidad | https://voces-web.onrender.com/privacidad.html |
| Palabras clave (100) | `coro,a cappella,armonía,voces,partitura,musicxml,midi,ensayo,tararear,acordes` |
| Copyright | 2026 Alonso de Lomas |

### Descripción

> Voces convierte las partituras de tu grupo en líneas de colores que se mueven con la música, como un sintetizador: cada voz con su color, la nota exacta en cada momento y el acorde que suena.
>
> • Importa MusicXML o MIDI desde MuseScore, Flat, Sibelius o Finale. Respeta las repeticiones.
> • Escucha cada voz sola o silénciala, y baja la velocidad para aprender tu parte.
> • Compón tarareando: cantas y Voces lo convierte en notas.
> • Edita notas y acordes en una rejilla, transpón y deshaz cuando quieras.
> • El asistente revisa las voces, propone acordes y crea armonías por ti. Con la IA, pídele cambios en lenguaje normal.
> • Crea el grupo de tu banda, invita con un código y trabajad todos sobre la misma canción, sincronizada al momento.
> • Exporta a MIDI o graba un vídeo vertical para redes.
>
> Sin anuncios. Funciona sin cuenta y sin conexión. La cuenta solo hace falta para compartir con el grupo y usar la IA.

### Capturas (iPhone de 6,9")

En este orden:

1. El visualizador con un acorde («Cada voz, su color»).
2. El panel de voces con Solo y Silencio («Ensaya tu parte»).
3. Tararear («Canta y se convierte en notas»).
4. El editor con la fila de acordes («Edita notas y acordes»).
5. El asistente («Armonías en un toque»).
6. El grupo con el código de invitación («Todo el grupo, la misma canción»).

## 3. Notas para el revisor (App Review Information)

Crea en Supabase un usuario de demostración con contraseña: *Authentication › Users › Add user › Create new user*, marcando *Auto Confirm User*. Ponlo en **Sign-in required**:

```
Email: (el de la cuenta de demostración)
Password: (su contraseña)

Voces works fully without an account: import a score (sample loaded on first launch), play it, edit it and hum.
An account is only needed for shared groups and the AI assistant. On the sign-in screen tap «Usar contraseña»
to use the demo account above. Sign in with Apple is also available.
Microphone: Editar → Tararear converts singing into notes; audio is analysed on-device and never stored or sent.
Account deletion: Menu (⋮) → Grupo y cuenta → Eliminar mi cuenta (also revokes Sign in with Apple).
```

## 4. Lista de comprobación de requisitos de Apple

| Norma | Estado |
| --- | --- |
| 4.2 Funcionalidad mínima (no ser «una web en una app») | Funciona sin conexión (la web va dentro de la app), usa el micrófono, el menú de compartir y «Iniciar sesión con Apple» nativos, y tiene editor, audio y grabación |
| 4.8 Iniciar sesión con Apple | Ofrecido en el iPhone junto al código por email |
| 5.1.1(v) Borrar la cuenta en la app | Grupo y cuenta › Eliminar mi cuenta → `DELETE /v1/account`, con revocación del token de Apple |
| 5.1.1 No exigir cuenta sin motivo | Todo funciona sin cuenta salvo grupos e IA |
| 5.1.2 Datos y privacidad | Política en `public/privacidad.html`, enlazada dentro de la app (Ayuda y pantalla de entrar); IA solo con texto de la canción |
| Permiso del micrófono | Texto en `movil/app.json` (plugin `expo-audio`) que explica el uso |
| Cifrado | `ITSAppUsesNonExemptEncryption = false` (solo HTTPS) |
| 2.1 Que no falle en la revisión | Probar antes en TestFlight (BACKEND.md, paso 6) y dejar la cuenta de demostración |

## 5. Qué falta comprobar en un iPhone real (TestFlight)

- **Tararear** dentro de la app (micrófono en el WebView con iOS 15 o posterior).
- **Sonido con el iPhone en silencio** (`playsInSilentMode`).
- **Grabar vídeo** (MediaRecorder en iOS) y compartirlo.
- **Rotación**: la app admite horizontal; si algo se ve mal, cambia `orientation` a `portrait` en `movil/app.json`.
