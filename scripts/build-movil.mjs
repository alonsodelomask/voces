// Compila la web en un único HTML y lo deja dentro de la app Expo (movil/src/generated/voces-html.ts).
// Lo ejecuta `npm run build:movil` en tu PC y, en los servidores de EAS, el gancho `eas-build-post-install` de movil/.
// Las variables públicas (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL) salen de .env.local o del entorno.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx vite build --mode movil', { cwd: root, stdio: 'inherit' });
const html = readFileSync(join(root, 'dist-movil', 'index.html'), 'utf8');
const outDir = join(root, 'movil', 'src', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'voces-html.ts'),
  `// ARCHIVO GENERADO por scripts/build-movil.mjs: no lo edites a mano.\n` +
    `// Contiene la web de Voces entera (HTML, CSS y JS) para cargarla en el WebView de la app.\n` +
    `const html: string = ${JSON.stringify(html)};\nexport default html;\n`,
);
const cloud = /VITE_SUPABASE_URL|supabase\.co/.test(html) ? 'con' : 'sin';
console.log(`[voces] web para la app: ${(html.length / 1024).toFixed(0)} KB (${cloud} nube configurada) → movil/src/generated/voces-html.ts`);
