// Pruebas de lo que la biblioteca hace sin pantalla (src/library/query.ts): buscar, filtrar, ordenar, fechas y miniatura.
// Las canciones y nombres son inventados.
// Se ejecutan con: node --test scripts/biblioteca.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { applyQuery, itemFromSong, matches, relativeDate, daysLeft, miniLines, fold } = await import("../src/library/query.ts");

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 10, 15, 12);
let n = 0;
function cancion(title, { voces = ["Soprano", "Bajo"], letra = [], grupo, grabacion = false, creada = AHORA - 10 * DIA, cambiada = AHORA - DIA, cantada = false } = {}) {
  n++;
  const voices = voces.map((name, i) => ({
    id: `v${n}-${i}`,
    name,
    color: "#ff2d6f",
    muted: false,
    solo: false,
    hidden: false,
    volume: 0.8,
    notes: [60 + i, 62 + i, 64 + i].map((midi, k) => ({ midi, start: k * 0.5, dur: 0.5, lyric: i === 0 ? letra[k] : undefined })),
  }));
  if (cantada) voices.push({ ...voices[0], id: `v${n}-s`, name: "🎙 Soprano", sungOf: voices[0].id });
  return {
    id: `s${n}`,
    title,
    bpm: 90,
    beatsPerBar: 4,
    keyFifths: 0,
    voices,
    chords: [],
    chordsAuto: true,
    createdAt: creada,
    updatedAt: cambiada,
    groupId: grupo,
    audioTrack: grabacion ? { name: "toma.wav", offset: 0, duration: 3, volume: 0.8, muted: false, solo: false } : undefined,
  };
}

const A = itemFromSong(cancion("Árbol de la plaza", { voces: ["Tenor", "Barítono"], letra: ["Can-", "ción", "del"], cambiada: AHORA - 3 * DIA, creada: AHORA - 30 * DIA }));
const B = itemFromSong(cancion("barca en el río", { grupo: "g1", grabacion: true, cambiada: AHORA - 5 * DIA, creada: AHORA - 2 * DIA }));
const C = itemFromSong(cancion("Calle mayor", { cantada: true, cambiada: AHORA - DIA, creada: AHORA - 20 * DIA }));
const TODAS = [A, B, C];
const titulos = (xs) => xs.map((x) => x.title);

describe("itemFromSong", () => {
  test("voces sin las «🎙», grabación, letra y grupo", () => {
    assert.deepEqual(C.voices, ["Soprano", "Bajo"]);
    assert.equal(C.audio, true, "una voz 🎙 cuenta como grabación");
    assert.equal(B.audio, true);
    assert.equal(A.audio, false);
    assert.equal(A.lyrics, true);
    assert.equal(A.lyricText, "Canción del");
    assert.equal(B.groupId, "g1");
  });
});

describe("buscar", () => {
  test("sin tildes ni mayúsculas, en título, voces y letra; varias palabras, todas", () => {
    assert.equal(fold("Árbol CANCIÓN"), "arbol cancion");
    assert.ok(matches(A, "arbol"));
    assert.ok(matches(A, "baritono"), "por el nombre de una voz");
    assert.ok(matches(A, "cancion"), "por la letra, con las sílabas juntas");
    assert.ok(matches(A, "plaza tenor"));
    assert.ok(!matches(A, "plaza soprano"));
    assert.ok(matches(A, "   "));
  });
});

describe("filtrar y ordenar", () => {
  test("por omisión: la modificada más reciente primero", () => {
    assert.deepEqual(titulos(applyQuery(TODAS, {})), ["Calle mayor", "Árbol de la plaza", "barca en el río"]);
  });
  test("por nombre: de la A a la Z sin mirar tildes ni mayúsculas; y al revés", () => {
    assert.deepEqual(titulos(applyQuery(TODAS, { sort: "title" })), ["Árbol de la plaza", "barca en el río", "Calle mayor"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { sort: "title", desc: true })), ["Calle mayor", "barca en el río", "Árbol de la plaza"]);
  });
  test("por creación, y la más antigua primero", () => {
    assert.deepEqual(titulos(applyQuery(TODAS, { sort: "created" })), ["barca en el río", "Calle mayor", "Árbol de la plaza"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { sort: "updated", desc: false })), ["barca en el río", "Árbol de la plaza", "Calle mayor"]);
  });
  test("dónde: solo en el dispositivo o de un grupo; con grabación; con letra", () => {
    assert.deepEqual(titulos(applyQuery(TODAS, { where: "local", sort: "title" })), ["Árbol de la plaza", "Calle mayor"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { where: "g1" })), ["barca en el río"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { audio: true, sort: "title" })), ["barca en el río", "Calle mayor"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { lyrics: true })), ["Árbol de la plaza"]);
    assert.deepEqual(titulos(applyQuery(TODAS, { audio: true, where: "local" })), ["Calle mayor"]);
  });
  test("no cambia la lista de entrada", () => {
    const copia = [...TODAS];
    applyQuery(TODAS, { sort: "title" });
    assert.deepEqual(TODAS, copia);
  });
});

describe("fechas", () => {
  test("relativas, en español", () => {
    assert.equal(relativeDate(AHORA - 10_000, AHORA), "ahora mismo");
    assert.equal(relativeDate(AHORA - 5 * 60_000, AHORA), "hace 5 minutos");
    assert.equal(relativeDate(AHORA - 3 * 3_600_000, AHORA), "hace 3 horas");
    assert.equal(relativeDate(AHORA - DIA, AHORA), "ayer");
    assert.equal(relativeDate(AHORA - 4 * DIA, AHORA), "hace 4 días");
    assert.equal(relativeDate(AHORA - 60 * DIA, AHORA), "hace 2 meses");
    assert.equal(relativeDate(AHORA - 400 * DIA, AHORA), "el año pasado");
  });
  test("días que quedan en la papelera", () => {
    assert.equal(daysLeft(AHORA, 30, AHORA), 30);
    assert.equal(daysLeft(AHORA - 29.5 * DIA, 30, AHORA), 1);
    assert.equal(daysLeft(AHORA - 31 * DIA, 30, AHORA), 0);
  });
});

describe("miniatura", () => {
  test("una línea por voz visible, dentro de la caja", () => {
    const s = cancion("x", { voces: ["A", "B", "C"] });
    s.voices[2].hidden = true;
    const l = miniLines(s);
    assert.equal(l.length, 2);
    for (const { d } of l) {
      const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
      assert.ok(nums.every((v) => v >= 0 && v <= 64), d);
    }
  });
  test("sin notas: nada", () => {
    const s = cancion("x");
    s.voices.forEach((v) => (v.notes = []));
    assert.deepEqual(miniLines(s), []);
  });
  test("muchas notas: como mucho `max` trazos por voz", () => {
    const s = cancion("x", { voces: ["A"] });
    s.voices[0].notes = Array.from({ length: 1000 }, (_, i) => ({ midi: 60 + (i % 12), start: i * 0.25, dur: 0.25 }));
    assert.ok((miniLines(s, 64, 36, 100)[0].d.match(/M/g) ?? []).length <= 100);
  });
});
