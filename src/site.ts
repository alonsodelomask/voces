// Páginas de la web pública (privacidad, condiciones, soporte…).
// En la web se enlazan en relativo (sirve igual en vocify.es, Render o GitHub Pages);
// dentro de la app nativa no hay servidor propio, así que se abre el dominio.
import { isNative } from './native';

export const SITE = 'https://vocify.es/';

export function siteUrl(path: string): string {
  if (isNative) return SITE + path;
  return new URL(path, document.baseURI).href;
}

/** Completa los enlaces `<a data-site="privacidad/">` del HTML. */
export function linkSitePages(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>('a[data-site]').forEach((a) => (a.href = siteUrl(a.dataset.site ?? '')));
}
