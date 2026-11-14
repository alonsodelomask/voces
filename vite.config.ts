import { defaultClientConditions, defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Dentro de la app no hay archivos sueltos: se quitan los enlaces al manifiesto e iconos de la web. */
function stripWebOnlyLinks(): Plugin {
  return {
    name: 'voces-strip-web-links',
    transformIndexHtml: (html) => html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, ''),
  };
}

// El motor de Whisper (onnxruntime-web, para la letra) se baja de jsDelivr al usarlo (src/import/lyricsWorker.ts):
// con esta condición no se mete en la compilación su WASM de 27 MB, que además no es el que usamos.
const resolve = { conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions] };

export default defineConfig(({ mode }) =>
  mode === 'movil'
    ? {
        // Versión para la app de iPhone/Android: un único HTML con todo dentro (scripts/build-movil.mjs).
        base: './',
        resolve,
        plugins: [viteSingleFile(), stripWebOnlyLinks()],
        build: { outDir: 'dist-movil', emptyOutDir: true, copyPublicDir: false },
        worker: { format: 'es' },
      }
    : {
        base: './',
        resolve,
        server: { host: true, port: 5173 },
        // El que escucha la letra (Whisper) se prepara al arrancar: si no, la primera vez que se usa Vite recarga la página.
        optimizeDeps: { include: ['@huggingface/transformers'] },
        worker: { format: 'es' },
      },
);
