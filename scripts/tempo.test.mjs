// Cambiar el tempo (src/tempo.ts): todo lo que va en segundos se mueve a la vez, también los inicios de compás.
// Se ejecutan con: node --test scripts/tempo.test.mjs
// Canción inventada.
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
const { changeTempo } = await import("../src/tempo.ts");

const cancion = () => ({
  id: "c-1",
  title: "Canción de prueba",
  bpm: 60,
  beatsPerBar: 4,
  keyFifths: 0,
  voices: [{ id: "soprano", name: "Soprano", color: "#ff2d6f", notes: [{ midi: 64, start: 4, dur: 1, lyric: "sol" }], muted: false, solo: false, hidden: false, volume: 0.8 }],
  chords: [{ time: 8, name: "G" }],
  chordsAuto: false,
  createdAt: 1,
  updatedAt: 2,
  barStarts: [0, 4, 8],
  audioPhase: 1.5,
  audioTrack: { name: "ensayo.wav", offset: 0.25, duration: 30, volume: 1, muted: false, solo: false },
});

test("de 60 a 120: la nota de 4 s pasa a 2 s y los compases (0, 4, 8) a 0, 2 y 4", () => {
  const s = cancion();
  const k = changeTempo(s, 120);
  assert.equal(k, 0.5);
  assert.equal(s.bpm, 120);
  assert.deepEqual(s.voices[0].notes[0], { midi: 64, start: 2, dur: 0.5, lyric: "sol" });
  assert.deepEqual(s.barStarts, [0, 2, 4]);
  assert.equal(s.chords[0].time, 4);
});

test("la grabación no cambia de velocidad: su desfase se queda igual", () => {
  const s = cancion();
  changeTempo(s, 120);
  assert.equal(s.audioPhase, 1.5);
  assert.equal(s.audioTrack.offset, 0.25);
});

test("ida y vuelta deja la canción como estaba; sin compases guardados, no se inventan", () => {
  const s = cancion();
  changeTempo(s, 90);
  changeTempo(s, 60);
  assert.ok(Math.abs(s.voices[0].notes[0].start - 4) < 1e-9);
  assert.ok(s.barStarts.every((t, i) => Math.abs(t - [0, 4, 8][i]) < 1e-9));
  const sin = cancion();
  delete sin.barStarts;
  changeTempo(sin, 120);
  assert.equal("barStarts" in sin, false);
});
