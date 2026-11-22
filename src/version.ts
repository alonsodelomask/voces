// Qué versión tiene cada cual, para el soporte: sin esto, cada queja obliga a preguntar qué tiene instalado.
import { appVersion } from './native';

/** Commit y fecha de la web compilada; los pone vite.config.ts al compilar (vacíos si no se saben). */
export type WebBuild = { commit: string; date: string };

// En las pruebas con Node no pasa por Vite y no existe: entonces no se sabe.
const WEB: WebBuild | null = typeof __VOCES_WEB__ !== 'undefined' ? __VOCES_WEB__ : null;

/**
 * El texto que se enseña al pie de la Ayuda. En la app: «Versión 1.0.0 (compilación 6) · web 1a2b3c4». En el
 * navegador: «Versión web 1a2b3c4 · 22/11/2026», o «Versión web» si no se sabe más.
 */
export function versionText(app = appVersion, web = WEB): string {
  const commit = web?.commit ? ` ${web.commit}` : '';
  if (app) return `Versión ${app.version} (compilación ${app.build})${commit ? ` · web${commit}` : ''}`;
  const date = web?.date ? ` · ${web.date.split('-').reverse().join('/')}` : '';
  return `Versión web${commit}${date}`;
}
