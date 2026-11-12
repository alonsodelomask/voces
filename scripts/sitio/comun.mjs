// Cabecera, pie y datos comunes de la web pública de Vocify.
// Lo que falta por decidir (titular, NIF, domicilio) aparece marcado como «pendiente» hasta que se complete aquí.

export const DATOS = {
  marca: 'Vocify',
  dominio: 'https://vocify.es/',
  correo: 'soporte@vocify.es',
  // Completar antes de publicar la app (lo exige la LSSI): nombre y apellidos o razón social, NIF y domicilio.
  titular: null,
  nif: null,
  domicilio: null,
  actualizado: { es: '13 de noviembre de 2026', en: 'November 13, 2026' },
};

export const pendiente = (txt) => `<span class="pendiente">${txt}</span>`;
export const titular = (lang) => DATOS.titular ?? pendiente(lang === 'es' ? 'pendiente: nombre del titular' : 'pending: owner name');
export const nif = (lang) => DATOS.nif ?? pendiente(lang === 'es' ? 'pendiente: NIF' : 'pending: tax ID');
export const domicilio = (lang) => DATOS.domicilio ?? pendiente(lang === 'es' ? 'pendiente: domicilio' : 'pending: address');
export const correo = () => `<a href="mailto:${DATOS.correo}">${DATOS.correo}</a>`;

const NAV = {
  es: [
    ['conoce/', 'Qué es'],
    ['soporte/', 'Ayuda'],
    ['privacidad/', 'Privacidad'],
    ['condiciones/', 'Condiciones'],
    ['', 'Abrir la app'],
  ],
  en: [
    ['en/', 'About'],
    ['en/support/', 'Help'],
    ['en/privacy/', 'Privacy'],
    ['en/terms/', 'Terms'],
    ['', 'Open the app'],
  ],
};

/** Envuelve el contenido de una página. `ruta` es la carpeta (p. ej. «en/privacy/»); `otra` la misma página en el otro idioma. */
export function pagina({ lang, ruta, titulo, descripcion, cuerpo, otra, doc = true }) {
  const depth = ruta.split('/').filter(Boolean).length;
  const r = depth ? '../'.repeat(depth) : './';
  const nav = NAV[lang]
    .map(([p, t]) => `<a href="${r}${p}"${p === ruta ? ' aria-current="page"' : ''}>${t}</a>`)
    .join('');
  const pie =
    lang === 'es'
      ? `<a href="${r}privacidad/">Privacidad</a><a href="${r}condiciones/">Condiciones</a><a href="${r}soporte/">Ayuda</a><a href="${r}borrar-cuenta/">Borrar la cuenta</a><span>© 2026 ${DATOS.marca}</span>`
      : `<a href="${r}en/privacy/">Privacy</a><a href="${r}en/terms/">Terms</a><a href="${r}en/support/">Help</a><a href="${r}en/delete-account/">Delete account</a><span>© 2026 ${DATOS.marca}</span>`;
  const idioma = otra ? `<a class="langs" href="${r}${otra}" hreflang="${lang === 'es' ? 'en' : 'es'}">${lang === 'es' ? 'English' : 'Español'}</a>` : '';
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo}</title>
    <meta name="description" content="${descripcion}" />
    <meta name="theme-color" content="#14041a" />
    <link rel="canonical" href="${DATOS.dominio}${ruta}" />
    ${otra ? `<link rel="alternate" hreflang="${lang === 'es' ? 'en' : 'es'}" href="${DATOS.dominio}${otra}" />` : ''}
    <meta property="og:title" content="${titulo}" />
    <meta property="og:description" content="${descripcion}" />
    <meta property="og:image" content="${DATOS.dominio}conoce/img/visualizar.jpg" />
    <link rel="icon" href="${r}icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${r}apple-touch-icon.png" />
    <link rel="stylesheet" href="${r}sitio.css" />
  </head>
  <body>
    <!-- Generado por scripts/sitio/generar.mjs: edita allí, no aquí. -->
    <header class="top"><div class="in"><a class="brand" href="${r}${lang === 'es' ? 'conoce/' : 'en/'}"><img src="${r}icon.svg" alt="" />${DATOS.marca}</a><nav>${nav}</nav></div></header>
    ${doc ? `<main class="doc">\n${cuerpo}\n    </main>` : cuerpo}
    <footer class="pie"><div class="in">${pie}${idioma}</div></footer>
  </body>
</html>
`;
}
