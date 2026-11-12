import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Dentro de la app no hay archivos sueltos: se quitan los enlaces al manifiesto e iconos de la web. */
function stripWebOnlyLinks(): Plugin {
  return {
    name: 'voces-strip-web-links',
    transformIndexHtml: (html) => html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, ''),
  };
}

export default defineConfig(({ mode }) =>
  mode === 'movil'
    ? {
        // Versión para la app de iPhone/Android: un único HTML con todo dentro (scripts/build-movil.mjs).
        base: './',
        plugins: [viteSingleFile(), stripWebOnlyLinks()],
        build: { outDir: 'dist-movil', emptyOutDir: true, copyPublicDir: false },
      }
    : {
        base: './',
        server: { host: true, port: 5173 },
      },
);
