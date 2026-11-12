# Voces

App para que un grupo vocal vea, escuche, componga y ensaye sus voces como líneas de neón de sintetizador.
Funciona en el navegador, se instala como app (PWA) y tiene versión nativa para iOS y Android (Capacitor).

**Web:** <https://alonsodelomask.github.io/voces/>

## Funciones

- **Importar** MusicXML (`.musicxml`, `.xml`, `.mxl`) y MIDI. Respeta las repeticiones y las casillas de 1ª y 2ª vez, y usa el cifrado de la partitura si lo tiene.
- **Visualizador** tipo sintetizador: transiciones suaves entre notas, nombre de cada nota, acorde actual y chispas.
- **Audio** sintetizado (4 sonidos), velocidad de 0.5× a 1.25× y silencio/solo/volumen por voz para ensayar.
- **Editor**: rejilla de notas, fila de acordes editable (con «ajustar las voces al acorde»), transposición y deshacer/rehacer.
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
npm run ios        # (en un Mac) compila y abre Xcode
npm run android    # compila y abre Android Studio
```

- Nube (cuentas, grupos, IA): [docs/NUBE.md](docs/NUBE.md)
- Publicar en App Store / Google Play: [docs/APP_STORE.md](docs/APP_STORE.md)
- Política de privacidad: [public/privacidad.html](public/privacidad.html)

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/import/` | Lectores de MusicXML y MIDI |
| `src/viz/visualizer.ts` | Visualizador (canvas) |
| `src/audio/engine.ts` | Síntesis, reproducción y metrónomo (Web Audio) |
| `src/editor/pianoroll.ts` | Editor de notas y acordes |
| `src/hum/` | Detección de tono y conversión del tarareo a notas |
| `src/ai/` | Asistente por reglas y panel de IA |
| `src/cloud/` | Cliente de Supabase: cuentas, grupos y sincronización |
| `supabase/` | Esquema SQL (con RLS) y función de servidor de la IA |
| `ios/`, `android/`, `assets/` | Apps nativas, iconos y pantallas de carga |
