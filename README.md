# Voces

App web (instalable en móvil y escritorio como PWA) para que un grupo vocal vea y escuche sus voces
como líneas de neón de sintetizador.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173 (también accesible desde el móvil en la misma wifi)
npm run build      # genera dist/
npm run deploy     # compila y publica en https://alonsodelomask.github.io/voces/
```

## Qué hace

- **Importar** MusicXML (`.musicxml`, `.xml`, `.mxl`) y MIDI (`.mid`). Desde MuseScore o Flat: *Exportar → MusicXML*.
  - Cada parte / pentagrama / voz interna es una línea; si hay acordes dentro de una voz, cada nota del acorde es una línea.
  - Respeta repeticiones y casillas de 1ª/2ª vez (D.C./D.S./Coda aún no).
  - Usa los cifrados de acorde de la partitura si los tiene; si no, los detecta.
- **Visualizador**: líneas con transición suave entre notas, cabezal fijo, nombre de cada nota, acorde actual y chispas.
- **Audio** sintetizado (Sintetizador, Coro, Órgano, Suave) con velocidad 0.5×–1.25×, silencio/solo/volumen por voz.
- **Editor** tipo piano roll para componer a mano o retocar lo importado.
- **Exportar** MIDI, proyecto `.json` y **vídeo vertical 1080×1920** para redes.
- Las canciones se guardan en el propio navegador.

## Estructura

- `src/import/` – lectores de MusicXML y MIDI
- `src/viz/visualizer.ts` – dibujo del visualizador (canvas)
- `src/audio/engine.ts` – síntesis y reproducción (Web Audio)
- `src/editor/pianoroll.ts` – editor de notas
- `src/main.ts` – interfaz
