// Capturas para la App Store (iPhone de 6,9": 1320×2868) con Chrome sin ventana y el protocolo DevTools.
// Requisitos: `npm run dev` en marcha (http://localhost:5173) y Google Chrome instalado.
//   node scripts/capturas.mjs
// Escenas: las de src/capturas.ts (?captura=…). Datos ficticios: la canción de ejemplo.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.VOCES_URL ?? 'http://localhost:5173/';
const ESCENAS = ['visualizar', 'voces', 'editar', 'asistente'];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'capturas-app-store');
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'voces-capturas-'))}`,
  '--no-first-run',
  '--hide-scrollbars',
  'about:blank',
]);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    /* aún arrancando */
  }
}
if (!target) throw new Error('Chrome no ha arrancado');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
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
// iPhone de 6,9": 440×956 puntos a 3× = 1320×2868 píxeles.
await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

for (const escena of ESCENAS) {
  await send('Page.navigate', { url: `${BASE}?captura=${escena}` });
  let lista = false;
  for (let i = 0; i < 60 && !lista; i++) {
    await sleep(150);
    const r = await send('Runtime.evaluate', { expression: "document.body && document.body.dataset.captura === 'lista'", returnByValue: true });
    lista = r.result.value === true;
  }
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = join(OUT, `${escena}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`${lista ? '✓' : '⚠ (sin señal de lista)'} ${file}`);
}
ws.close();
chrome.kill();
