// Pruebas de la revisión de las canciones que entran en la app (src/songCheck.ts) y del número de formato (src/model.ts).
// Se ejecutan con: node --test scripts/cancionRevisada.test.mjs
// Canciones, voces e ids inventados.
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
const { checkSong, checkSongOrFail, projectToOpen, safeColor, MAX_SECONDS } = await import("../src/songCheck.ts");
const { SONG_FORMAT, VOICE_COLORS, isNewerFormat, makeSong, songFormat } = await import("../src/model.ts");

const voz = (id, extra = {}) => ({ id, name: id, color: "#ff2d6f", notes: [{ midi: 60, start: 0, dur: 1 }], muted: false, solo: false, hidden: false, volume: 0.8, ...extra });
const cancion = (voces, extra = {}) => ({ id: "cancion-1", title: "Canción de prueba", bpm: 90, beatsPerBar: 4, keyFifths: 0, voices: voces, chords: [], chordsAuto: true, createdAt: 1, updatedAt: 2, ...extra });

describe("una canción bien hecha", () => {
  test("sale igual (y revisarla dos veces da lo mismo)", () => {
    const s = cancion([voz("soprano", { notes: [{ midi: 64, start: 0, dur: 0.5, name: "E4", lyric: "Ho-", bar: 1 }] }), voz("bajo")], { chords: [{ time: 0, name: "C" }], barStarts: [0, 2] });
    const r = checkSong(s);
    assert.deepEqual(r, s);
    assert.deepEqual(checkSong(r), r);
    assert.notEqual(r, s, "es una copia: no cambia la que se pasa");
  });

  test("conserva los campos que no conoce (pueden ser de una versión más nueva)", () => {
    const s = cancion([voz("tenor", { futuro: { a: 1 }, notes: [{ midi: 60, start: 0, dur: 1, otraCosa: "x" }] })], { secciones: [{ nombre: "Estribillo", pulso: 8 }], format: 2 });
    const r = checkSong(s);
    assert.deepEqual(r.secciones, s.secciones);
    assert.deepEqual(r.voices[0].futuro, { a: 1 });
    assert.equal(r.voices[0].notes[0].otraCosa, "x");
    assert.equal(r.format, 2);
  });
});

describe("lo que acabaría dentro del HTML", () => {
  test("un color con código se cambia por el de la paleta", () => {
    const r = checkSong(cancion([voz("a", { color: '#fff" onfocus="alert(1)' }), voz("b", { color: "red" }), voz("c", { color: "#ABC" })]));
    assert.equal(r.voices[0].color, VOICE_COLORS[0]);
    assert.equal(r.voices[1].color, VOICE_COLORS[1]);
    assert.equal(r.voices[2].color, "#ABC");
    assert.equal(safeColor(undefined, 9), VOICE_COLORS[1]);
  });

  test("un id de voz o de canción con código se cambia por uno nuevo; los repetidos también", () => {
    const r = checkSong(cancion([voz('x"><img src=x onerror=alert(1)>'), voz("dup"), voz("dup")], { id: "<script>", groupId: "g<b>", ownerId: 5 }));
    assert.match(r.id, /^[A-Za-z0-9_.:-]+$/);
    assert.match(r.voices[0].id, /^[A-Za-z0-9_.:-]+$/);
    assert.equal(r.voices[1].id, "dup");
    assert.notEqual(r.voices[2].id, "dup");
    assert.equal("groupId" in r, false);
    assert.equal("ownerId" in r, false);
  });

  test("el nombre escrito de una nota que no es un nombre de nota se quita (se calcula de su altura)", () => {
    const r = checkSong(cancion([voz("a", { notes: [{ midi: 60, start: 0, dur: 1, name: "<b>C4</b>" }, { midi: 61, start: 1, dur: 1, name: "C♯4" }] })]));
    assert.equal("name" in r.voices[0].notes[0], false);
    assert.equal(r.voices[0].notes[1].name, "C♯4");
  });
});

describe("lo que congelaba el visualizador o el editor", () => {
  test("se quitan las notas sin tiempo, sin duración o con alturas imposibles", () => {
    const notas = [
      { midi: 60, start: 0, dur: 1 },
      { midi: 60, start: NaN, dur: 1 },
      { midi: 60, start: Infinity, dur: 1 },
      { midi: 60, start: 1, dur: 0 },
      { midi: 60, start: 1, dur: -2 },
      { midi: 1e9, start: 1, dur: 1 },
      { midi: "60", start: 1, dur: 1 },
      { midi: 62, start: 1e12, dur: 1 },
      null,
      "nota",
    ];
    const r = checkSong(cancion([voz("a", { notes: notas })]));
    assert.deepEqual(r.voices[0].notes, [{ midi: 60, start: 0, dur: 1 }]);
  });

  test("una nota que empieza antes del 0 se recorta; una que acaba antes, se quita; una larguísima se acorta", () => {
    const r = checkSong(cancion([voz("a", { notes: [{ midi: 60, start: -0.5, dur: 1 }, { midi: 62, start: -3, dur: 1 }, { midi: 64, start: 10, dur: 1e9 }] })]));
    assert.deepEqual(r.voices[0].notes, [{ midi: 60, start: 0, dur: 0.5 }, { midi: 64, start: 10, dur: MAX_SECONDS - 10 }]);
  });

  test("las notas desordenadas se ordenan por su ataque (el visualizador las busca a saltos)", () => {
    const r = checkSong(cancion([voz("a", { notes: [{ midi: 60, start: 2, dur: 1 }, { midi: 62, start: 0, dur: 1 }] })]));
    assert.deepEqual(r.voices[0].notes.map((n) => n.start), [0, 2]);
  });

  test("faltan listas, o no son listas: se ponen vacías; una voz que no es una voz se quita", () => {
    const r = checkSong({ id: "c", voices: [null, { id: "v" }], chords: "no" });
    assert.equal(r.voices.length, 1);
    assert.deepEqual(r.voices[0].notes, []);
    assert.equal(r.voices[0].name, "Voz 2");
    assert.deepEqual(r.chords, []);
    assert.equal(r.title, "Sin título");
    assert.equal(r.voices[0].volume, 0.8);
    assert.equal(r.voices[0].solo, false);
  });

  test("tempo, compás y armadura absurdos vuelven a valores que se pueden dibujar", () => {
    const r = checkSong(cancion([], { bpm: 0, beatsPerBar: 0, keyFifths: 99 }));
    assert.equal(r.bpm, 100);
    assert.equal(r.beatsPerBar, 4, "un compás de 0 pulsos dejaba colgado el editor");
    assert.equal(r.keyFifths, 7);
    const r2 = checkSong(cancion([], { bpm: 1e9, beatsPerBar: 1000, keyFifths: "do" }));
    assert.equal(r2.bpm, 600);
    assert.equal(r2.beatsPerBar, 32);
    assert.equal(r2.keyFifths, 0);
  });

  test("volumen y mezcla de ensayo raros: valores normales", () => {
    const r = checkSong(cancion([voz("a", { volume: Infinity, muted: "sí", solo: 1 })]));
    assert.equal(r.voices[0].volume, 0.8);
    assert.equal(r.voices[0].muted, false);
    assert.equal(r.voices[0].solo, false);
  });

  test("una grabación mal descrita se quita; acordes y compases raros, fuera", () => {
    const r = checkSong(cancion([], { audioTrack: { name: "toma.wav", offset: "x", duration: 3 }, chords: [{ time: -1, name: "C" }, { time: 1, name: 5 }, { time: 2, name: "G" }], barStarts: [0, NaN] }));
    assert.equal("audioTrack" in r, false);
    assert.deepEqual(r.chords, [{ time: 2, name: "G" }]);
    assert.equal("barStarts" in r, false);
  });

  test("lo que no es una canción", () => {
    assert.equal(checkSong(null), null);
    assert.equal(checkSong("hola"), null);
    assert.equal(checkSong([1, 2]), null);
    assert.throws(() => checkSongOrFail({ title: "sin voces" }), /no es un proyecto de Vocify/);
  });
});

describe("número de formato", () => {
  test("sin número es el 1; las canciones nuevas llevan el de esta app", () => {
    assert.equal(SONG_FORMAT, 1);
    assert.equal(songFormat({}), 1);
    assert.equal(songFormat({ format: "2" }), 1);
    assert.equal(makeSong().format, SONG_FORMAT);
    assert.equal(isNewerFormat(makeSong()), false);
  });

  test("una canción con un número mayor es de una versión más nueva", () => {
    assert.equal(isNewerFormat({ format: SONG_FORMAT + 1 }), true);
    assert.equal(isNewerFormat({ format: 1 }), false);
  });

  test("un número de formato que no es un entero desde 1 se quita", () => {
    assert.equal("format" in checkSong(cancion([], { format: -3 })), false);
    assert.equal("format" in checkSong(cancion([], { format: 1.5 })), false);
    assert.equal(checkSong(cancion([], { format: 3 })).format, 3);
  });
});

describe("abrir un proyecto (.voces.json)", () => {
  test("si dice lo mismo que la de aquí, se abre la de aquí (aunque cambie la mezcla de ensayo)", () => {
    const aqui = cancion([voz("tenor", { solo: true })], { updatedAt: 50 });
    const archivo = cancion([voz("tenor")], { updatedAt: 10 });
    const r = projectToOpen(archivo, aqui);
    assert.equal(r.same, true);
    assert.equal(r.song, aqui);
  });

  test("si es otra versión de una que ya está aquí, entra como copia nueva y la de aquí no se toca", () => {
    const aqui = cancion([voz("tenor")], { groupId: "grupo-1", remoteUpdatedAt: "2026-11-01T10:00:00Z", ownerId: "cuenta-1" });
    const archivo = cancion([voz("tenor", { notes: [{ midi: 55, start: 0, dur: 1 }] })], { groupId: "grupo-1", remoteUpdatedAt: "2026-10-01T10:00:00Z", audioTrack: { name: "toma.wav", offset: 0, duration: 4, volume: 1, muted: false, solo: false } });
    const r = projectToOpen(archivo, aqui);
    assert.equal(r.same, false);
    assert.equal(r.copy, true);
    assert.notEqual(r.song.id, aqui.id);
    assert.equal(r.song.title, "Canción de prueba (copia)");
    for (const k of ["groupId", "remoteUpdatedAt", "ownerId", "audioTrack", "deletedAt"]) assert.equal(k in r.song, false, k);
    assert.equal(r.song.voices[0].notes[0].midi, 55);
    assert.equal(aqui.groupId, "grupo-1");
    assert.equal(archivo.groupId, "grupo-1", "no cambia el archivo leído");
  });

  test("uno que viene de un grupo o de una cuenta, sin copia aquí, también entra con otro id y fuera del grupo", () => {
    const r = projectToOpen(cancion([voz("a")], { groupId: "grupo-1", remoteUpdatedAt: "2026-11-01T10:00:00Z" }), undefined);
    assert.equal(r.copy, true);
    assert.notEqual(r.song.id, "cancion-1");
    assert.equal(r.song.title, "Canción de prueba");
    assert.equal("groupId" in r.song, false);
  });

  test("uno que nunca estuvo en la nube y no está aquí se abre tal cual", () => {
    const r = projectToOpen(cancion([voz("a")]), undefined);
    assert.equal(r.copy, false);
    assert.equal(r.song.id, "cancion-1");
    // Con la fecha del archivo: si la cuenta tiene esa canción más nueva, gana la de la cuenta al sincronizar.
    assert.equal(r.song.updatedAt, 2);
  });

  test("uno con fecha futura se queda con la de ahora como mucho (no ganaría siempre al sincronizar)", () => {
    const antes = Date.now();
    const r = projectToOpen(cancion([voz("a")], { updatedAt: antes + 365 * 864e5 }), undefined);
    assert.equal(r.copy, false);
    assert.ok(r.song.updatedAt >= antes && r.song.updatedAt <= Date.now());
  });

  test("si la de aquí está en la papelera, no se abre esa: entra como copia", () => {
    const aqui = cancion([voz("a")], { deletedAt: 5 });
    const r = projectToOpen(cancion([voz("a")]), aqui);
    assert.equal(r.same, false);
    assert.equal(r.copy, true);
    assert.notEqual(r.song.id, aqui.id);
  });
});
