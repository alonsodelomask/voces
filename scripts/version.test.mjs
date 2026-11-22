// Texto de la versión al pie de la Ayuda (src/version.ts): en la app, versión y compilación reales; en la web, el commit.
// Se ejecutan con: node --test scripts/version.test.mjs
// Datos inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as modulo from "node:module";

// src importa sin extensión (así lo quieren Vite y tsc); Node la necesita: se la ponemos al resolver desde un .ts.
if (typeof modulo.registerHooks !== "function") throw new Error("Hace falta Node 22.15 o posterior (module.registerHooks).");
modulo.registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (/^\.\.?\//.test(especificador) && !/\.[a-z]+$/i.test(especificador) && contexto.parentURL?.endsWith(".ts")) {
      return siguiente(`${especificador}.ts`, contexto);
    }
    return siguiente(especificador, contexto);
  },
});
const { versionText } = await import("../src/version.ts");
const { heavyTask, restartNotice, appVersion } = await import("../src/native.ts");

test("en la app: versión, compilación y commit de la web", () => {
  assert.equal(versionText({ version: "1.0.0", build: "12" }, { commit: "1a2b3c4", date: "2026-11-22" }), "Versión 1.0.0 (compilación 12) · web 1a2b3c4");
  assert.equal(versionText({ version: "1.0.0", build: "?" }, null), "Versión 1.0.0 (compilación ?)");
});

test("en el navegador: commit y fecha, o «Versión web» si no se sabe", () => {
  assert.equal(versionText(null, { commit: "1a2b3c4", date: "2026-11-22" }), "Versión web 1a2b3c4 · 22/11/2026");
  assert.equal(versionText(null, { commit: "", date: "" }), "Versión web");
  assert.equal(versionText(null, null), "Versión web");
});

test("fuera de la app no hay versión nativa ni marcas de memoria", () => {
  assert.equal(appVersion, null);
  assert.equal(restartNotice(), null);
  const unmark = heavyTask("convertía el audio en notas");
  assert.equal(typeof unmark, "function");
  unmark();
});

test("en la app: aviso rojo solo si había tarea pesada; si no, uno neutro", () => {
  // Simula la app que ha vuelto a montar la web (isNative se lee al importar: módulo nuevo con otra URL).
  const datos = new Map();
  // defineProperty: en Node nuevos `localStorage` ya existe como propiedad de solo lectura.
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };
  Object.defineProperty(globalThis, "localStorage", { value: almacen, configurable: true, writable: true });
  globalThis.window = { VocesNative: { platform: "ios", apple: true, version: "1.0.0", build: "12", restarts: 1 }, ReactNativeWebView: { postMessage() {} } };
  return import("../src/native.ts?app").then(({ heavyTask: marca, restartNotice: aviso }) => {
    marca("convertía el audio en notas");
    assert.deepEqual(aviso(), { text: "Vocify se ha reiniciado porque el teléfono se quedó sin memoria mientras convertía el audio en notas.", error: true });
    assert.deepEqual(aviso(), { text: "Vocify se ha vuelto a abrir.", error: false });
    window.VocesNative.restarts = 0;
    marca("grababa el vídeo");
    assert.equal(aviso(), null);
    assert.equal(datos.size, 0);
    delete globalThis.window;
  });
});
