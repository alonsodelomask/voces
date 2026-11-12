// Genera la web pública (public/conoce, privacidad, condiciones, soporte, borrar-cuenta y sus versiones en inglés).
//   node scripts/sitio/generar.mjs
// Vite copia public/ tal cual a dist/, así que se publica con la app (Render, GitHub Pages).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATOS, pagina } from './comun.mjs';
import { PAGINAS_EN } from './en.mjs';
import { PAGINAS_ES } from './es.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const paginas = [...PAGINAS_ES, ...PAGINAS_EN];
for (const p of paginas) {
  const dir = join(PUBLIC, p.ruta);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), pagina(p));
  console.log('✓', p.ruta);
}

// La dirección antigua de la política (enlazada en versiones anteriores) lleva a la nueva.
writeFileSync(
  join(PUBLIC, 'privacidad.html'),
  `<!doctype html><html lang="es"><head><meta charset="UTF-8" /><title>Política de privacidad</title><meta http-equiv="refresh" content="0; url=./privacidad/" /><link rel="canonical" href="${DATOS.dominio}privacidad/" /></head><body><p><a href="./privacidad/">Política de privacidad</a></p></body></html>\n`,
);
writeFileSync(join(PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${DATOS.dominio}sitemap.xml\n`);
const urls = ['', ...paginas.map((p) => p.ruta)];
writeFileSync(
  join(PUBLIC, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${DATOS.dominio}${u}</loc></url>`).join('\n')}\n</urlset>\n`,
);
console.log('✓ privacidad.html (redirección), robots.txt, sitemap.xml');
