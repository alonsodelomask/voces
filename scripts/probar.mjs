// Pruebas de uso en un Chrome sin ventana (protocolo DevTools), contra `npm run dev` (http://localhost:5173).
//   node scripts/probar.mjs            → todas las pruebas de scripts/pruebas/*.js
//   node scripts/probar.mjs ensayo     → solo las que contienen «ensayo» en el nombre
// Cada prueba es un archivo que define `async () => { …; return resultado }` y se evalúa en la página.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.VOCES_URL ?? 'http://localhost:5173/';
const DIR = join(dirname(fileURLToPath(import.meta.url)), process.env.PRUEBAS_DIR ?? 'pruebas');
const PORT = 9334;
const filtro = process.argv[2] ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'voces-pruebas-'))}`,
  '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  'about:blank',
]);
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    /* arrancando */
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errores = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await send('Page.enable');
await send('Runtime.enable');
const movil = process.env.MOVIL === '1';
await send('Emulation.setDeviceMetricsOverride', movil ? { width: 400, height: 860, deviceScaleFactor: 2, mobile: true } : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

let fallos = 0;
for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.js') && f.includes(filtro)).sort()) {
  errores.length = 0;
  // Las pruebas «nativa» simulan la app del iPhone: el puente existe antes de cargar la web.
  let script;
  if (archivo.includes('nativa')) {
    script = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: "window.__msgs=[];window.ReactNativeWebView={postMessage:function(m){window.__msgs.push(JSON.parse(m));}};window.VocesNative={platform:'ios',apple:true,version:'1.0.0'};",
    });
  }
  await send('Page.navigate', { url: BASE });
  await sleep(1500);
  const codigo = readFileSync(join(DIR, archivo), 'utf8');
  try {
    const r = await send('Runtime.evaluate', { expression: `(${codigo})()`, awaitPromise: true, returnByValue: true, timeout: Number(process.env.TIMEOUT ?? 60_000) });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    const valor = r.result.value;
    const ok = valor && valor.ok !== false && errores.length === 0;
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✖'} ${archivo}`, JSON.stringify(valor));
    if (errores.length) console.log('   errores en la página:', errores.slice(0, 3));
  } catch (e) {
    fallos++;
    console.log(`✖ ${archivo}`, e.message.split('\n')[0]);
  }
}
ws.close();
chrome.kill();
process.exit(fallos ? 1 : 0);
