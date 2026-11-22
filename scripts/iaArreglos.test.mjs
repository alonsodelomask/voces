// Arreglos de la IA: la letra se conserva al aplicar una propuesta (src/ai/keepLyrics.ts), «Afinar con IA» cabe en lo
// que admite el servidor (src/ai/fusion.ts) y el servidor dormido no parece «sin conexión» (src/cloud/serverWake.ts).
// Se ejecutan con: node --test scripts/iaArreglos.test.mjs
// Canciones, voces y direcciones inventadas.
import { describe, test } from "node:test";
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
const { keepLyrics } = await import("../src/ai/keepLyrics.ts");
const { fusionDiffs, fusionPrompt } = await import("../src/ai/fusion.ts");
const { ApiUnavailable, OFFLINE_MSG, SLOW_MSG, WAKING_MSG, isTimeout, noAnswerMessage, unavailableMessage, wakeServer } = await import("../src/cloud/serverWake.ts");

const nota = (start, dur, extra = {}) => ({ midi: 60, start, dur, ...extra });

describe("la letra al aplicar una propuesta de la IA", () => {
  test("cada sílaba va a la nota nueva que empieza a la vez (aunque la IA redondee el pulso)", () => {
    const vieja = [nota(0, 0.5, { lyric: "Can-" }), nota(0.5, 0.5, { lyric: "ta", lyricDoubt: true }), nota(1, 1, { lyric: "mar" })];
    const nueva = [nota(0, 0.5), nota(0.51, 0.49), nota(1, 1), nota(2, 1)];
    assert.deepEqual(keepLyrics(vieja, nueva, 0.0625), { kept: 3, lost: 0 });
    assert.deepEqual(nueva.map((n) => n.lyric), ["Can-", "ta", "mar", undefined]);
    assert.equal(nueva[1].lyricDoubt, true);
  });

  test("si la IA junta dos notas, la segunda sílaba se queda sin nota y se cuenta (no se pierde en silencio)", () => {
    const vieja = [nota(0, 0.5, { lyric: "o-" }), nota(0.5, 0.5, { lyric: "la" }), nota(1, 1, { lyric: "mar" })];
    const nueva = [nota(0, 1), nota(1, 1)];
    assert.deepEqual(keepLyrics(vieja, nueva, 0.0625), { kept: 2, lost: 1 });
    assert.deepEqual(nueva.map((n) => n.lyric), ["o-", "mar"]);
  });

  test("una nota nueva más larga que empieza antes recoge la sílaba que caía dentro", () => {
    const vieja = [nota(1, 0.5, { lyric: "luz" })];
    const nueva = [nota(0.5, 2)];
    assert.deepEqual(keepLyrics(vieja, nueva, 0.0625), { kept: 1, lost: 0 });
    assert.equal(nueva[0].lyric, "luz");
  });
});

describe("«Afinar con IA»", () => {
  test("con 120 diferencias, la petición sigue cabiendo en los 2.000 caracteres de antes; la lista va con la canción", () => {
    const score = { id: "tenor", name: "Tenor", color: "#1fd6f2", muted: false, solo: false, hidden: false, volume: 0.8, notes: [] };
    const sung = { ...score, id: "oido", name: "🎙 Tenor", sungOf: "tenor", notes: [] };
    for (let i = 0; i < 150; i++) {
      score.notes.push({ midi: 64, start: i * 0.5, dur: 0.5 });
      sung.notes.push({ midi: 65, start: i * 0.5, dur: 0.5 });
    }
    const song = { id: "c-1", title: "Canción de prueba", bpm: 120, beatsPerBar: 4, keyFifths: 0, voices: [score, sung], chords: [], chordsAuto: true, createdAt: 1, updatedAt: 2 };
    const pair = { score, sung };
    const peticion = fusionPrompt(pair);
    assert.ok(peticion.length < 2000, `la petición mide ${peticion.length}`);
    assert.match(peticion, /DIFERENCIAS/);
    const lista = fusionDiffs(song, pair);
    assert.equal(lista.split("\n").length, 121, "título y 120 líneas");
    assert.match(lista, /^DIFERENCIAS/);
    assert.match(lista, /c\.1 pulso 0\.00: partitura E4, se oye F4 \(\+1\)/);
  });
});

describe("servidor dormido", () => {
  const BASE = "https://api.ejemplo.invalid";
  const rapido = { firstMs: 50, totalMs: 400, everyMs: 10 };

  test("sin respuesta y con Internet: se está despertando; sin Internet: sin conexión", () => {
    assert.equal(noAnswerMessage(true), WAKING_MSG);
    assert.equal(noAnswerMessage(false), OFFLINE_MSG);
    assert.match(WAKING_MSG, /se está despertando, vuelve a intentarlo en unos segundos/);
    // Un 503 de Render (sin mensaje) es el servidor arrancando; el de Vocify trae el suyo.
    assert.equal(unavailableMessage(undefined), WAKING_MSG);
    assert.equal(unavailableMessage("La IA todavía no está activada en el servidor."), "La IA todavía no está activada en el servidor.");
  });

  test("se agota la espera (servidor ya despierto, IA lenta): no dice que se está despertando", async () => {
    // fetch con AbortSignal.timeout (como en api()) se corta con el motivo de la señal: un TimeoutError. Sin red.
    const senal = AbortSignal.timeout(1);
    await new Promise((r) => senal.addEventListener("abort", r));
    const error = senal.reason;
    assert.equal(isTimeout(error), true);
    assert.equal(isTimeout(new TypeError("Failed to fetch")), false);
    assert.equal(noAnswerMessage(true, true), SLOW_MSG);
    assert.notEqual(SLOW_MSG, WAKING_MSG);
    assert.equal(noAnswerMessage(true, false), WAKING_MSG);
    assert.equal(noAnswerMessage(false, true), OFFLINE_MSG);
  });

  test("despierto: no avisa ni espera", async () => {
    let avisos = 0;
    const urls = [];
    await wakeServer(BASE, () => avisos++, { ...rapido, online: () => true, fetch: async (u) => (urls.push(u), { ok: true }) });
    assert.equal(avisos, 0);
    assert.deepEqual(urls, [`${BASE}/health`]);
  });

  test("dormido: avisa una vez y espera hasta que contesta", async () => {
    let avisos = 0;
    let intentos = 0;
    const f = async () => {
      intentos++;
      if (intentos < 3) throw new TypeError("Failed to fetch"); // Render arrancando: sin CORS, el navegador no deja leerla
      return { ok: true };
    };
    await wakeServer(BASE, () => avisos++, { ...rapido, online: () => true, fetch: f });
    assert.equal(avisos, 1);
    assert.equal(intentos, 3);
  });

  test("no despierta a tiempo: «se está despertando»; sin Internet: «sin conexión», sin llamar", async () => {
    await assert.rejects(
      wakeServer(BASE, undefined, { ...rapido, online: () => true, fetch: async () => ({ ok: false }) }),
      (e) => e instanceof ApiUnavailable && e.message === WAKING_MSG,
    );
    let llamadas = 0;
    await assert.rejects(
      wakeServer(BASE, undefined, { ...rapido, online: () => false, fetch: async () => (llamadas++, { ok: true }) }),
      (e) => e instanceof ApiUnavailable && e.message === OFFLINE_MSG,
    );
    assert.equal(llamadas, 0);
  });
});
