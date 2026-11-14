# Vocify

(El repositorio y las claves internas se siguen llamando «voces»; el nombre público es **Vocify**, dominio **vocify.es**.)

App para que un grupo vocal vea, escuche, componga y ensaye sus voces como líneas de neón de sintetizador.
Funciona en el navegador, se instala como app (PWA) y tiene app de iPhone/Android con Expo (la misma web dentro, compilada con EAS como Baulify).

**Web:** <https://vocify.es> (cuando el dominio apunte a Render, ver [docs/DOMINIO.md](docs/DOMINIO.md)) · <https://voces-web.onrender.com> (también <https://alonsodelomask.github.io/voces/>) · **API:** <https://voces-api-0wt8.onrender.com/health>

**Qué falta para la App Store:** [docs/MANANA.md](docs/MANANA.md)

## Funciones

- **Importar** MusicXML (`.musicxml`, `.xml`, `.mxl`) y MIDI. Respeta las repeticiones y las casillas de 1ª y 2ª vez, y usa el cifrado de la partitura si lo tiene.
- **Audio → voces**: importa una grabación (WAV, MP3, M4A, AAC, OGG, OPUS, FLAC, WEBM, AIFF, CAF) y la convierte en voces en el dispositivo con Basic Pitch (Spotify): limpia armónicos, calcula el tempo, ajusta a la rejilla y reparte las notas de aguda a grave.
- **Mezclar grabación y partitura** (menú, o los dos archivos a la vez): coloca las notas de la partitura donde se cantan en la grabación (DTW sobre cromas, `align.ts`). Detecta si se canta más alto o más bajo, en qué octava canta cada voz y qué toma de una grabación larga corresponde a la partitura. Con «Toda la grabación» (lo normal) busca con saltos entre compases (DTW con saltos) y coloca una copia de la partitura por cada vuelta que se canta; también se puede pedir una sola vuelta o toda la partitura una vez. Si una voz se canta una octava abajo, las de debajo bajan con ella para no cruzarse. Puede añadir la voz que mejor se oye tal como se canta («🎙 Tenor», enlazada a «Tenor» con `sungOf`) y guardar la grabación para **oírla junto a las voces** (`audio/track.ts`, en IndexedDB y solo en ese dispositivo). Las notas que en la partitura empiezan a la vez se mueven juntas («golpes»): cada golpe va al ataque que más claro se oye de sus voces (normalmente la melodía) y los que no se oyen siguen la desviación del grupo; los tramos que el DTW deja apretados (notas repetidas) se reparten como en la partitura, y la anacrusa del principio de cada toma entra aunque el modelo no la reconozca. El reloj del modelo es exacto: `basicPitchOutputs` trocea el audio en ventanas que avanzan justo lo que se quedan, y el fotograma f es el segundo f / `FRAME_RATE` (la librería adelantaba un 0,5 % y lo corregía a ojo). En *Asistente › Fusión* (`ai/fusion.ts`) se ve en qué compases lo cantado se aparta de la partitura, se limpia lo que es del detector y la IA decide lo dudoso.
- **Diagramas de acordes** opcionales para guitarra, ukelele y piano.
- **Visualizador** tipo sintetizador: transiciones suaves entre notas, nombre de cada nota, acorde actual y chispas.
- **Audio** sintetizado (4 sonidos), velocidad de 0.5× a 1.25× y silencio/solo/volumen por voz para ensayar.
- **Cuerda de cada voz** (soprano, mezzosoprano, contralto, tenor, barítono, bajo) a partir de su tesitura, aunque la voz se llame como quien la canta (`voiceType` en `music.ts`).
- **Editor**: rejilla de notas, fila de acordes editable (con «ajustar las voces al acorde»), transposición y deshacer/rehacer.
- **Letra**, la *aplicación del texto a la música*: una sílaba en cada nota, con *melismas* (una sílaba que se alarga varias notas) y *sinalefas* (dos vocales de palabras distintas en una nota, «se‿a»). Las notas se ven con letra o sin ella (casilla «Letra» del panel de voces, que la muestra o la oculta sin borrarla y se recuerda en el dispositivo): con letra, en el editor cada sílaba va bajo su nota (en ámbar las dudosas; un «?» ámbar marca una nota a la que quizá le falta sílaba) y, al reproducir, se ve como un karaoke. En el editor, «🔤 Letra» la pone de dos maneras:
  - **En orden**: parte en sílabas lo que se escribe (castellano, con sinalefa; `src/lyrics.ts`) y pone una en cada nota de la voz. Un guion suelto entre espacios une las sílabas tras una sílaba suelta («Can - ta», también «sol - mar» → «sol-mar»); tras una palabra de varias sílabas cuenta como un espacio (la sinalefa sigue: «hola - adiós» → «la‿a») y, al empezar una línea, es una raya de diálogo y se salta. Si sobran sílabas, la última nota no se queda con media palabra colgando: pierde el guion y va en ámbar.
  - **Donde se oye**, si la grabación está en el dispositivo (o ya se escuchó): «🎧 Escribir lo que se oye» la transcribe con Whisper en el dispositivo (Transformers.js en un hilo aparte, `import/lyricsWorker.ts` y `import/transcribe.ts`; la primera vez descarga unos 80 MB de Hugging Face y el motor WASM de jsDelivr). Solo escucha donde cantan las voces y quita lo que Whisper se inventa (créditos de subtítulos, «gracias por ver el vídeo», lo que va entre corchetes). Mientras escucha, el diálogo no deja tocar nada; «Cancelar» (o Esc) cierra el diálogo y para la escucha (y la descarga). Si no oye letra (un tarareo) y hay letra escrita, pone esa, sin tiempos y en ámbar. La persona corrige el texto y `casarLetra` (`src/lyricsAlign.ts`, programación dinámica con melismas, sinalefas, frases y silencios) pone cada sílaba en la nota en que se canta: cada palabra corregida hereda el tiempo de la que se oyó en su sitio (`heredarTiempos`), y lo que no se canta (una cabecera como «Coro:», una línea repetida o de más) se queda fuera.
  - Las sílabas dudosas quedan en **ámbar** (`lyricDoubt`) para revisarlas, y «Dar por buenas las sílabas en ámbar» las acepta. En orden, el ámbar se queda donde la sílaba no cambia.
  - **Las otras voces** (`editor/lyricsPlace.ts`): con la casilla «La misma sílaba en las voces que van al mismo ritmo», las que van a su ritmo, frase a frase, reciben la misma sílaba (con su ámbar) y se corrigen con ella. Una voz que en una frase canta su propia letra no se toca. Si una copia se queda con media palabra (esa voz calla el resto), pierde el guion y va en ámbar. Los avisos dicen qué voces o frases no se copian porque van a otro ritmo. «Quitar la letra», con esa casilla, quita también las copias (la letra propia de una voz, no) y el aviso dice cuántas notas la pierden; si se quedaran, el karaoke y el MIDI pasarían a una de esas voces y la letra que se pusiera después ya no se les copiaría. Sin la casilla, solo se quita la de esa voz. En una voz que solo lleva la copia de la melodía en algunas frases, la casilla viene sin marcar; si dos voces llevan exactamente la misma letra, cada una cuenta como copia de la otra y quitarla de una con la casilla la quita de las dos.
  - Al **mezclar**, la casilla «Poner la letra» lo hace sola sobre la melodía y la copia a las voces que van a su ritmo (si la partitura ya trae la letra de la melodía, se queda la suya). «Duplicar» copia también la grabación y lo oído. Una letra ya puesta se abre tal cual, sin volver a partirla, para corregirla.
  - La letra del MusicXML entra con la partitura (la estrofa que toca en cada vuelta de una repetición) y la mezcla la lleva a cada toma. El MIDI la guarda como eventos de letra de karaoke, de la voz que la lleva (`lyricsVoice` en `model.ts`: la melodía, no una voz que solo la copia en algunas frases o que canta «uh»; si dudan, la que se oye en la grabación).
- **Tararear**: cantas y se convierte en notas (detección de tono YIN en el dispositivo), con metrónomo, cuenta atrás y la opción de oír las otras voces mientras grabas.
- **Asistente**: revisión de voces (paralelas, cruces, saltos, registros), propuesta de acordes para una melodía y armonización automática.
- **IA (Claude)**: pídele cambios en lenguaje natural; ves la propuesta antes de aplicarla.
- **Grupos en la nube**: cuentas con código por email, grupos con código de invitación y canciones compartidas que se sincronizan en tiempo real.
- **Exportar** MIDI, proyecto `.json` y vídeo vertical 1080×1920.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
npm run deploy     # compila y publica en GitHub Pages
npm run build:movil  # mete la web en la app (movil/)
cd server && npm test  # pruebas del servidor
node scripts/capturas.mjs  # capturas para la App Store (con npm run dev en marcha)
node scripts/probar.mjs    # pruebas de uso en Chrome sin ventana (con npm run dev en marcha)
node scripts/sitio/generar.mjs  # web pública y textos legales (public/conoce, privacidad, condiciones…)
```

- Servidor, nube y publicación (Supabase, Render, EAS): [docs/BACKEND.md](docs/BACKEND.md)
- Ficha de la App Store: [docs/APP_STORE.md](docs/APP_STORE.md)
- Reglas para agentes: [AGENTS.md](AGENTS.md)
- Dominio vocify.es: [docs/DOMINIO.md](docs/DOMINIO.md)
- Web pública y textos legales: `scripts/sitio/` → `public/` (privacidad, condiciones, soporte, borrar la cuenta, en español e inglés)

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/import/` | Lectores de MusicXML y MIDI, audio → voces (`audio.ts`), mezcla con la partitura (`align.ts`, `mixDialog.ts`) |
| `src/viz/visualizer.ts` | Visualizador (canvas) |
| `src/audio/engine.ts` | Síntesis, reproducción y metrónomo (Web Audio) |
| `src/editor/pianoroll.ts` | Editor de notas y acordes |
| `src/hum/` | Detección de tono y conversión del tarareo a notas |
| `src/ai/` | Asistente por reglas y panel de IA |
| `src/cloud/` | Cliente de Supabase y del servidor: cuentas, grupos, sincronización, IA |
| `src/native.ts` | Puente con la app nativa (compartir archivos, Apple) |
| `server/` | API en Render: IA con Claude, borrar la cuenta, revocación de Apple |
| `supabase/migrations/` | Esquema SQL con RLS |
| `movil/` | App Expo (iOS/Android) que lleva la web dentro |
| `render.yaml` | Blueprint de Render (API y web) |
| `assets/` | Icono y pantalla de carga originales |
