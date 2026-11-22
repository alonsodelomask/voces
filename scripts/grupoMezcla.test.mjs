// Pruebas de la mezcla de ensayo, que es de cada dispositivo y no de la canción del grupo (src/cloud/mix.ts).
// Canciones y voces inventadas.
// Se ejecutan con: node --test scripts/grupoMezcla.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
const { NEUTRAL_MIX, withNeutralMix, keepLocalMix, sameContent } = await import("../src/cloud/mix.ts");

const voz = (id, extra = {}) => ({ id, name: id, color: "#ff2d6f", notes: [{ midi: 60, start: 0, dur: 1 }], muted: false, solo: false, hidden: false, volume: 0.8, ...extra });
const cancion = (voces, extra = {}) => ({ id: "c-1", title: "Canción de prueba", bpm: 90, beatsPerBar: 4, keyFifths: 0, voices: voces, chords: [], chordsAuto: true, createdAt: 1, updatedAt: 2, ...extra });

describe("lo que se sube al grupo", () => {
  test("lleva los campos de la mezcla con su valor normal (la app 1.0 los necesita) y no toca la de aquí", () => {
    const aqui = cancion([voz("tenor", { solo: true, volume: 0.3 }), voz("bajo", { muted: true, hidden: true })]);
    const sube = withNeutralMix(aqui);
    for (const v of sube.voices) {
      assert.equal(v.muted, false);
      assert.equal(v.solo, false);
      assert.equal(v.hidden, false);
      assert.equal(v.volume, NEUTRAL_MIX.volume);
    }
    assert.deepEqual(sube.voices[0].notes, aqui.voices[0].notes);
    assert.equal(aqui.voices[0].solo, true, "la de este dispositivo sigue con su solo");
    assert.equal(aqui.voices[1].muted, true);
  });
});

describe("al traer la versión del grupo", () => {
  test("se queda la mezcla de aquí, voz por voz según su id, y la grabación de aquí", () => {
    const aqui = cancion([voz("tenor", { solo: true, volume: 0.5 }), voz("bajo", { muted: true })], { audioTrack: { name: "ensayo.wav", offset: 0, duration: 10, volume: 1, muted: false, solo: false } });
    const delGrupo = cancion([voz("bajo"), voz("tenor", { notes: [{ midi: 62, start: 0, dur: 1 }] }), voz("nueva")]);
    const r = keepLocalMix(delGrupo, aqui);
    const t = r.voices.find((v) => v.id === "tenor");
    assert.equal(t.solo, true);
    assert.equal(t.volume, 0.5);
    assert.equal(t.notes[0].midi, 62, "las notas son las del grupo");
    assert.equal(r.voices.find((v) => v.id === "bajo").muted, true);
    assert.equal(r.audioTrack.name, "ensayo.wav");
  });

  test("una voz que aquí no estaba (o una canción subida con el Solo puesto por una app anterior) llega con la mezcla normal", () => {
    const r = keepLocalMix(cancion([voz("tenor", { solo: true }), voz("bajo", { muted: true, volume: 0.1 })]));
    assert.ok(r.voices.every((v) => !v.solo && !v.muted && !v.hidden && v.volume === NEUTRAL_MIX.volume));
  });

  test("una voz guardada sin volumen recibe el normal", () => {
    const aqui = cancion([{ ...voz("tenor"), volume: undefined }]);
    const r = keepLocalMix(cancion([voz("tenor")]), aqui);
    assert.equal(r.voices[0].volume, NEUTRAL_MIX.volume);
  });
});

describe("sameContent", () => {
  test("no cuenta la mezcla, la grabación, las marcas de tiempo ni el orden de las claves", () => {
    const a = cancion([voz("tenor", { solo: true })], { updatedAt: 5, remoteUpdatedAt: "x" });
    const b = JSON.parse(JSON.stringify(cancion([voz("tenor")], { updatedAt: 9 })));
    const desordenada = { ...b, voices: b.voices.map((v) => Object.fromEntries(Object.entries(v).reverse())) };
    assert.equal(sameContent(a, desordenada), true);
  });
  test("sí cuenta las notas y el título", () => {
    assert.equal(sameContent(cancion([voz("tenor")]), cancion([voz("tenor", { notes: [] })])), false);
    assert.equal(sameContent(cancion([voz("tenor")]), cancion([voz("tenor")], { title: "Otra" })), false);
  });
});
