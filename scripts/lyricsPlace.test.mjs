// Pruebas de cómo se pone la letra en una voz y se copia a las que van a su ritmo (src/editor/lyricsPlace.ts), y de
// qué voz lleva la letra (lyricsVoice, src/model.ts). Se ejecutan con: node --test scripts/lyricsPlace.test.mjs
// (Node 24 quita los tipos de TypeScript solo; con Node 22.15 o posterior, añade --experimental-strip-types.)
// Las letras y las melodías son inventadas.
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
const { assignLyrics, copyLyrics, copyNotices, heardFrom, lyricsCopied, placeHeard, placeHeardPreview } = await import("../src/editor/lyricsPlace.ts");
const { lyricsVoice, onsetPartner } = await import("../src/model.ts");
const { splitSyllables } = await import("../src/lyrics.ts");

const voz = (name, notes, extra = {}) => ({ id: name, name, color: "#fff", notes, muted: false, solo: false, hidden: false, volume: 0.8, ...extra });
const cancion = (voices) => ({ id: "s", title: "Prueba", bpm: 120, beatsPerBar: 4, keyFifths: 0, voices, chords: [], chordsAuto: true, createdAt: 0, updatedAt: 0 });
/** Notas de `dur` segundos que empiezan en `inicios`. */
const notasEn = (inicios, dur = 0.45, midi = 60) => inicios.map((start) => ({ midi, start, dur }));
/** La letra de una voz nota a nota («·» sin sílaba, «?» en ámbar). */
const letra = (v) => v.notes.map((n) => (n.lyric ?? "·") + (n.lyricDoubt ? "?" : "")).join(" ");
const sinMarca = (v) => v.notes.map((n) => n.lyric ?? "·").join(" ");

const DIEZ = Array.from({ length: 10 }, (_, i) => i * 0.5);
const GATO = "Mi gato escucha la canción del mar"; // «Mi ga- to‿es- cu- cha la can- ción del mar»: 10 sílabas

/** Melodía de 10 negras con la letra en orden, y otra voz con `notas`. */
function dos(notas, texto = GATO) {
  const mel = voz("Melodía", notasEn(DIEZ, 0.45, 64));
  const otra = voz("Otra", notas);
  const song = cancion([mel, otra]);
  assignLyrics(song, mel, splitSyllables(texto), 0, false);
  return { song, mel, otra };
}

// Dos frases de 8 negras (0,5 s) con un respiro de una negra; la otra voz canta las notas `cuales` de la 1.ª frase
// (con `largas`, las que duran más) y la 2.ª entera. La letra se pone en orden y se copia.
const OCHO = "Pin-ta-mos cie-los de co-lor\nSue-ña la ga-vio-ta en el mar";
function callando(cuales, largas = {}) {
  const ini = [...Array(8).keys(), ...[...Array(8).keys()].map((i) => i + 9)];
  const mel = voz("Alta", ini.map((i) => ({ midi: 72, start: i * 0.5, dur: 0.48 })));
  const baja = voz("Baja", ini.filter((i) => i > 8 || cuales.includes(i)).map((i) => ({ midi: 60, start: i * 0.5, dur: (largas[i] ?? 1) * 0.5 - 0.02 })));
  const song = cancion([mel, baja]);
  return { song, mel, baja, r: assignLyrics(song, mel, splitSyllables(OCHO), 0, true) };
}
/** Los ataques de esas dos frases. */
const OCHO_INI = [...Array(8).keys(), ...[...Array(8).keys()].map((i) => i + 9)].map((i) => i * 0.5);

describe("copyLyrics: a qué voces y frases se copia la letra", () => {
  test("la voz al mismo ritmo recibe cada sílaba, con su marca ámbar", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    mel.notes[3].lyricDoubt = true;
    const r = copyLyrics(song, mel, mel.notes);
    assert.equal(sinMarca(otra), "Mi ga- to‿es- cu- cha la can- ción del mar");
    assert.ok(otra.notes[3].lyricDoubt && otra.notes.filter((n) => n.lyricDoubt).length === 1);
    assert.deepEqual(r, { otras: 10, distintas: 0, cortadas: 0, otroRitmo: [], sinCopiar: [] });
  });

  test("la que entra a mitad de la frase recibe las de su parte", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ.slice(5)));
    copyLyrics(song, mel, mel.notes);
    assert.equal(sinMarca(otra), "la can- ción del mar");
  });

  test("una nota de paso de más alarga la sílaba anterior", () => {
    const { song, mel, otra } = dos([...notasEn(DIEZ, 0.2), { midi: 62, start: 1.25, dur: 0.2 }].sort((a, b) => a.start - b.start));
    copyLyrics(song, mel, mel.notes);
    assert.equal(sinMarca(otra), "Mi ga- to‿es- · cu- cha la can- ción del mar");
  });

  test("en un coral, las corcheas de paso de una frase no la dejan sin letra (como antes, en orden)", () => {
    // Cuatro frases de 4 negras (1 s) con un silencio de 1 s; la contralto parte las dos primeras de la 2.ª frase.
    const frase = (f) => [0, 1, 2, 3].map((i) => f * 5 + i);
    const sop = [0, 1, 2, 3].flatMap((f) => frase(f).map((start) => ({ midi: 72, start, dur: 1 })));
    const alt = [0, 1, 2, 3].flatMap((f) => frase(f).flatMap((start, i) => (f === 1 && i < 2 ? [{ midi: 65, start, dur: 0.5 }, { midi: 64, start: start + 0.5, dur: 0.5 }] : [{ midi: 65, start, dur: 1 }])));
    const s = voz("Soprano", sop);
    const c = voz("Contralto", alt);
    const r = assignLyrics(cancion([s, c]), s, splitSyllables("Ma-ña-na sol\nPa-lo-ma gris\nCa-mi-nos mil\nCan-ción de mar"), 0, true);
    assert.equal(sinMarca(c), "Ma- ña- na sol Pa- · lo- · ma gris Ca- mi- nos mil Can- ción de mar");
    assert.equal(r.otras, 16);
    assert.deepEqual(r.otroRitmo, []);
  });

  test("las voces de notas largas no reciben nada: blancas bajo negras, un «uuh» por frase, un bajo en las partes fuertes", () => {
    for (const [nombre, notas] of [
      ["blancas", notasEn(DIEZ.filter((_, i) => i % 2 === 0), 0.95)],
      ["una nota larga", [{ midi: 60, start: 0, dur: 4.9 }]],
      ["bajo cada cuatro", notasEn(DIEZ.filter((_, i) => i % 4 === 0), 0.3)],
    ]) {
      const { song, mel, otra } = dos(notas);
      const r = copyLyrics(song, mel, mel.notes);
      assert.ok(otra.notes.every((n) => !n.lyric), nombre);
      assert.deepEqual(r.otroRitmo, ["Otra"], nombre);
    }
  });

  test("una voz mucho más movida (corcheas bajo blancas) tampoco", () => {
    const mel = voz("Melodía", notasEn([0, 1, 2, 3], 0.95, 64));
    const otra = voz("Otra", notasEn(Array.from({ length: 16 }, (_, i) => i * 0.25), 0.22));
    const song = cancion([mel, otra]);
    assignLyrics(song, mel, splitSyllables("Ca-sa de sol"), 0, false);
    assert.deepEqual(copyLyrics(song, mel, mel.notes).otroRitmo, ["Otra"]);
  });

  test("sostener las 2 o 3 últimas sílabas de la frase no impide copiar", () => {
    const tres = dos([...notasEn(DIEZ.slice(0, 7)), { midi: 60, start: 3.5, dur: 1.45 }]);
    copyLyrics(tres.song, tres.mel, tres.mel.notes);
    assert.equal(sinMarca(tres.otra), "Mi ga- to‿es- cu- cha la can- ción");
    const dosUltimas = dos([...notasEn(DIEZ.slice(0, 8)), { midi: 60, start: 4, dur: 0.95 }]);
    copyLyrics(dosUltimas.song, dosUltimas.mel, dosUltimas.mel.notes);
    assert.equal(sinMarca(dosUltimas.otra), "Mi ga- to‿es- cu- cha la can- ción del");
  });

  test("una frase a contratiempo se queda sin copiar y las demás se copian", () => {
    const Q = 0.75;
    const sop = [];
    const alt = [];
    for (let f = 0; f < 3; f++)
      for (let i = 0; i < 8; i++) {
        const t = (f * 9 + i) * Q;
        sop.push({ midi: 72, start: t, dur: Q, lyric: `s${f * 8 + i}` });
        if (f === 1) alt.push({ midi: 65, start: t + Q / 2, dur: Q / 2 });
        else alt.push({ midi: 65, start: t, dur: Q });
      }
    const s = voz("Soprano", sop);
    const c = voz("Contralto", alt);
    const r = copyLyrics(cancion([s, c]), s, s.notes);
    assert.equal(c.notes.slice(0, 8).map((n) => n.lyric).join(" "), "s0 s1 s2 s3 s4 s5 s6 s7");
    assert.ok(c.notes.slice(8, 16).every((n) => !n.lyric));
    assert.equal(c.notes.slice(16).map((n) => n.lyric).join(" "), "s16 s17 s18 s19 s20 s21 s22 s23");
    assert.deepEqual(r.otroRitmo, []);
    assert.deepEqual(r.sinCopiar, [{ voz: "Contralto", frases: 1 }]); // y se cuenta, para avisarlo
  });

  test("si la otra voz calla una palabra entera a mitad de frase, el resto de la frase se copia", () => {
    const { baja, r } = callando([0, 1, 2, 5, 6, 7]); // calla «cie-los»
    assert.equal(sinMarca(baja), "Pin- ta- mos de co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.deepEqual(r.otroRitmo, []);
    assert.deepEqual(r.sinCopiar, []);
  });

  test("si calla en medio de una palabra, la última sílaba que recibe se queda sin guion y en ámbar", () => {
    // Canta «Pin- ta-», calla en «mos cie- los de» y sigue en «co- lor»: con el guion, el karaoke y el MIDI dirían
    // «Pintacolor».
    const { song, mel, baja, r } = callando([0, 1, 6, 7]);
    assert.equal(letra(baja), "Pin- ta? co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(letra(mel), "Pin- ta- mos cie- los de co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(r.cortadas, 1);
    assert.deepEqual(copyNotices(r), ["1 nota de las otras voces se queda con media palabra, en ámbar"]);
    assert.equal(lyricsCopied(song, mel), true); // sigue siendo copia
    // Volver a ponerla igual no cambia nada (el ámbar se queda: nadie lo ha revisado).
    assignLyrics(song, mel, splitSyllables(OCHO), 0, true);
    assert.equal(letra(baja), "Pin- ta? co- lor Sue- ña la ga- vio- ta‿en el mar");
    // Darla por buena (como «Dar por buenas» del diálogo) quita el ámbar, y ya no vuelve si la sílaba no cambia...
    copyLyrics(song, mel, mel.notes, new Map(mel.notes.map((n) => [n, n.lyric])), true);
    assert.equal(letra(baja), "Pin- ta co- lor Sue- ña la ga- vio- ta‿en el mar");
    assignLyrics(song, mel, splitSyllables(OCHO), 0, true);
    assert.equal(letra(baja), "Pin- ta co- lor Sue- ña la ga- vio- ta‿en el mar");
    // ...pero sí si cambia.
    const res = assignLyrics(song, mel, splitSyllables(OCHO.replace("Pin-ta-mos", "Bus-ca-mos")), 0, true);
    assert.equal(letra(baja), "Bus- ca? co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(res.cortadas, 1);
    assert.equal(res.distintas, 0);
  });

  test("pero si ahí canta otra sílaba suya (la cambió la persona), la palabra sigue: no se toca", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    copyLyrics(song, mel, mel.notes);
    otra.notes[4].lyric = "ah"; // «cha» → «ah»
    const r = assignLyrics(song, mel, splitSyllables("Mi perro escucha la canción del mar"), 0, true);
    assert.equal(letra(otra), "Mi pe- rro‿es- cu- ah la can- ción del mar");
    assert.deepEqual([r.otras, r.distintas, r.cortadas], [9, 1, 0]);
  });

  test("si solo adelanta o retrasa la sílaba siguiente (una síncopa, un puntillo), la palabra sigue: no pierde el guion", () => {
    // Una partitura con la misma letra en las dos voces (una SATB), pero la contralto canta «ta-» una corchea antes
    // (síncopa) o después (puntillo) que la soprano. La casilla «otras» viene marcada: la contralto es copia.
    const sil = splitSyllables(OCHO);
    for (const [caso, pin, ta] of [["síncopa", 0.23, 0.25], ["puntillo", 0.73, 0.75]]) {
      const sop = voz("Soprano", notasEn(OCHO_INI, 0.48, 72));
      const alt = voz("Contralto", OCHO_INI.map((start, i) => ({ midi: 65, start, dur: 0.48, lyric: sil[i] })));
      alt.notes[0].dur = pin;
      alt.notes[1].start = ta;
      alt.notes[1].dur = 0.98 - ta;
      const song = cancion([sop, alt]);
      assignLyrics(song, sop, sil, 0, false);
      assert.equal(lyricsCopied(song, sop), true, caso);
      const antes = letra(alt);
      // La misma letra otra vez, y luego otra palabra corregida: «Pin-» sigue con su guion y no hay aviso.
      assignLyrics(song, sop, sil, 0, true);
      assert.equal(letra(alt), antes, caso);
      let r = assignLyrics(song, sop, splitSyllables(OCHO.replace("cie-los", "cam-pos")), 0, true);
      assert.equal(letra(alt), antes.replace("cie- los", "cam- pos"), caso);
      assert.deepEqual([r.cortadas, copyNotices(r)], [0, []], caso);
      // Si cambia justo esa sílaba («ta» → «te»), la de la contralto ya no es la que sigue: «Pin» se queda sin guion y
      // en ámbar para revisarla, igual cada vez que se pone.
      const otra = splitSyllables(OCHO.replace("cie-los", "cam-pos").replace("Pin-ta", "Pin-te"));
      for (let vez = 1; vez <= 2; vez++) {
        r = assignLyrics(song, sop, otra, 0, true);
        assert.equal(letra(alt), "Pin? ta- mos cam- pos de co- lor Sue- ña la ga- vio- ta‿en el mar", `${caso}, vez ${vez}`);
        assert.equal(r.cortadas, 1, `${caso}, vez ${vez}`);
      }
    }
  });

  test("en un acorde de la voz (dos notas a la vez), las dos reciben la sílaba y la palabra sigue", () => {
    const sop = voz("Soprano", notasEn(OCHO_INI, 0.48, 72));
    const notas = notasEn(OCHO_INI, 0.48, 65);
    notas.splice(3, 0, { midi: 62, start: 1, dur: 0.48 }); // un acorde en «mos»,
    notas.splice(2, 0, { midi: 62, start: 0.5, dur: 0.48 }); // en «ta-»
    notas.splice(1, 0, { midi: 62, start: 0, dur: 0.48 }); // y en «Pin-»
    const alt = voz("Contralto", notas);
    const r = assignLyrics(cancion([sop, alt]), sop, splitSyllables(OCHO), 0, true);
    assert.equal(letra(alt), "Pin- Pin- ta- ta- mos mos cie- los de co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(r.cortadas, 0);
  });

  test("una copia de antes con el guion colgando lo pierde en ámbar: quitar un guion nunca pasa callado", () => {
    // «Baja» canta «Pin- ta-», calla en «mos cie- los de» y sigue en «co- lor»: así se quedó guardada antes de esta regla
    // («Pintacolor»). Al volver a poner la misma letra con «otras», «ta» pierde el guion y se queda en ámbar.
    const { song, mel, baja } = callando([0, 1, 6, 7]);
    baja.notes[1].lyric = "ta-";
    delete baja.notes[1].lyricDoubt;
    const r = assignLyrics(song, mel, splitSyllables(OCHO), 0, true);
    assert.equal(letra(baja), "Pin- ta? co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(r.cortadas, 1);
    assert.deepEqual(copyNotices(r), ["1 nota de las otras voces se queda con media palabra, en ámbar"]);
  });

  test("una nota que se sostiene sí cuenta en contra; la frase sin copiar se cuenta", () => {
    const { baja, r } = callando([0, 1, 2, 5, 6, 7], { 2: 3 }); // «mos» dura hasta «los»
    assert.equal(sinMarca(baja), "· · · · · · Sue- ña la ga- vio- ta‿en el mar");
    assert.deepEqual(r.otroRitmo, []);
    assert.deepEqual(r.sinCopiar, [{ voz: "Baja", frases: 1 }]);
  });

  test("empezando a mitad de una frase, se mira la frase entera (no solo el trozo desde esa nota)", () => {
    // La otra voz va en blancas hasta la 6.ª negra y en negras las dos últimas: la frase entera no va a su ritmo.
    const mel = voz("Melodía", notasEn([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 0.45, 64));
    const otra = voz("Otra", [...notasEn([0, 1, 2], 0.95), ...notasEn([3, 3.5])]);
    const song = cancion([mel, otra]);
    assignLyrics(song, mel, splitSyllables("Vue-la la ga-vio-ta so-bre"), 0, false);
    const r = assignLyrics(song, mel, splitSyllables("el mar"), 6, true);
    assert.equal(sinMarca(mel), "Vue- la la ga- vio- ta el mar");
    assert.ok(otra.notes.every((n) => !n.lyric));
    assert.deepEqual(r.otroRitmo, ["Otra"]);
  });

  test("los ataques hasta 30 ms antes o después también son a la vez, en la primera y la última nota de la frase", () => {
    const inicios = [0, 0.5, 1, 1.5, 2, 3.1, 3.6, 4.1, 4.6, 5.1];
    for (const desfase of [-0.025, 0.025, -0.035]) {
      const mel = voz("Melodía", notasEn(inicios, 0.45, 64));
      const otra = voz("Otra", notasEn(inicios.map((t) => t + desfase)));
      const r = assignLyrics(cancion([mel, otra]), mel, splitSyllables("Mi gato duerme junto\nLa luna brilla sobre"), 0, true);
      if (Math.abs(desfase) < 0.03) assert.equal(sinMarca(otra), sinMarca(mel), `desfase ${desfase}`);
      else assert.deepEqual(r.otroRitmo, ["Otra"], `desfase ${desfase}`);
    }
  });
});

describe("copyLyrics: lo que ya tenían las otras voces", () => {
  test("al volver a poner la letra, las copias de la anterior cambian, las distintas se quedan y las que pierden su sílaba se quitan", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    copyLyrics(song, mel, mel.notes);
    otra.notes[9].lyric = "sol"; // la cambia la persona: ya no es copia
    let r = assignLyrics(song, mel, splitSyllables("Mi perro escucha la canción del mar"), 0, true);
    assert.equal(sinMarca(otra), "Mi pe- rro‿es- cu- cha la can- ción del sol");
    assert.equal(r.otras, 9);
    assert.equal(r.distintas, 1);
    r = assignLyrics(song, mel, splitSyllables("Mi perro escucha la canción"), 0, true);
    assert.equal(sinMarca(otra), "Mi pe- rro‿es- cu- cha la can- ción · sol");
    assert.equal(r.distintas, 1);
  });

  test("sin saber la letra anterior, solo se rellenan las notas sin sílaba", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    copyLyrics(song, mel, mel.notes);
    delete otra.notes[0].lyric;
    assignLyrics(song, mel, splitSyllables("Tu perro escucha la canción del mar"), 0, false);
    const r = copyLyrics(song, mel, mel.notes);
    assert.equal(sinMarca(otra), "Tu ga- to‿es- cu- cha la can- ción del mar");
    assert.equal(r.otras, 1);
    assert.equal(r.distintas, 2);
  });

  test("desde una nota, solo cambian las copias de las notas que se tocan", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    copyLyrics(song, mel, mel.notes);
    assignLyrics(song, mel, splitSyllables("las olas"), 5, true);
    assert.equal(sinMarca(mel), "Mi ga- to‿es- cu- cha las o- las · ·");
    assert.equal(sinMarca(otra), "Mi ga- to‿es- cu- cha las o- las · ·");
  });

  test("una voz con su propia letra en la frase no se toca, aunque una sílaba coincida por casualidad", () => {
    const ini = [0, 0.5, 1, 1.5, 2];
    const sop = voz("Soprano", notasEn(ini, 0.45, 72));
    const alt = voz("Contralto", notasEn(ini, 0.45, 65));
    const song = cancion([sop, alt]);
    assignLyrics(song, sop, splitSyllables("Lu-na de pla-ta"), 0, false);
    assignLyrics(song, alt, ["Ah", "la", "de", "la", "la"], 0, false); // «de», igual que la de la soprano
    const r = assignLyrics(song, sop, splitSyllables("Lu-na sin pla-ta"), 0, true);
    assert.equal(sinMarca(alt), "Ah la de la la");
    assert.equal(r.otras, 0);
    assert.equal(r.distintas, 5);
  });

  test("una sola sílaba distinta en una frase corta no la vuelve propia: sus copias siguen a la melodía", () => {
    // La otra voz lleva la copia de las dos frases, pero en la 1.ª canta «oh» donde la melodía dice «de» (la cambió la
    // persona o venía así): 7 de 8 copias. Con el 90 % por frase, la frase entera se quedaba sin corregir.
    const { mel, baja, song } = callando([0, 1, 2, 3, 4, 5, 6, 7]);
    baja.notes[5].lyric = "oh";
    assert.equal(lyricsCopied(song, mel), true); // 15 de 16: la casilla viene marcada
    const r = assignLyrics(song, mel, splitSyllables(OCHO.replace("Pin-ta-mos", "Bus-ca-mos")), 0, true);
    assert.equal(sinMarca(baja), "Bus- ca- mos cie- los oh co- lor Sue- ña la ga- vio- ta‿en el mar");
    assert.equal(r.distintas, 1);
    assert.equal(r.otras, 15);
  });

  test("ni se rellenan sus notas sin sílaba (alargan la anterior)", () => {
    const ini = [0, 0.5, 1, 1.5, 2];
    const sop = voz("Soprano", notasEn(ini, 0.45, 72));
    const alt = voz("Contralto", notasEn(ini, 0.45, 65));
    const song = cancion([sop, alt]);
    assignLyrics(song, sop, splitSyllables("Va-mos a ca-sa"), 0, false);
    assignLyrics(song, alt, ["Oh", "_", "_", "_", "sí"], 0, false);
    assignLyrics(song, sop, splitSyllables("Ve-ni-mos a ti"), 0, true);
    assert.equal(sinMarca(alt), "Oh · · · sí");
  });

  test("en una frase que es copia, tampoco las que alargan una sílaba suya (un melisma hecho a mano)", () => {
    const ini = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const sop = voz("Soprano", notasEn(ini, 0.45, 72));
    const alt = voz("Contralto", notasEn(ini, 0.45, 65));
    const song = cancion([sop, alt]);
    assignLyrics(song, sop, splitSyllables("Pin-ta-mos cie-los de co-lor"), 0, false);
    // La contralto dice lo mismo, pero en vez de «de co-lor» canta un «Ah» largo (lo cambió la persona): 5 de 6 copias.
    assignLyrics(song, alt, ["Pin-", "ta-", "mos", "cie-", "los", "Ah", "_", "_"], 0, false);
    const r = assignLyrics(song, sop, splitSyllables("Pin-ta-mos cam-pos de co-lor"), 0, true);
    assert.equal(sinMarca(alt), "Pin- ta- mos cam- pos Ah · ·");
    assert.deepEqual([r.otras, r.distintas], [5, 1]);
    // Pero si estaban sin sílaba porque la melodía tampoco tenía (copiaban su melisma), siguen a la melodía.
    const sop2 = voz("Soprano", notasEn(ini, 0.45, 72));
    const alt2 = voz("Contralto", notasEn(ini, 0.45, 65));
    const song2 = cancion([sop2, alt2]);
    assignLyrics(song2, sop2, ["Pin-", "ta-", "mos", "_", "cie-", "los", "de", "sol"], 0, true);
    alt2.notes[2].lyric = "oh"; // la persona cambia «mos»
    assignLyrics(song2, sop2, ["Pin-", "ta-", "mos", "ya", "cie-", "los", "de", "sol"], 0, true);
    assert.equal(sinMarca(alt2), "Pin- ta- oh ya cie- los de sol");
  });
});

describe("assignLyrics: la marca ámbar", () => {
  test("se queda donde la sílaba no cambia y se va donde cambia o se quita la letra", () => {
    const { song, mel } = dos(notasEn(DIEZ));
    mel.notes[1].lyricDoubt = true;
    mel.notes[7].lyricDoubt = true;
    // Corregir una palabra (como en el diálogo, en orden: la letra tal cual, con «canción» cambiada)
    assignLyrics(song, mel, splitSyllables("Mi gato escucha la camión del mar"), 0, false);
    assert.equal(letra(mel), "Mi ga-? to‿es- cu- cha la ca- mión del mar");
    assignLyrics(song, mel, [], 0, false);
    assert.ok(mel.notes.every((n) => !n.lyric && !n.lyricDoubt));
  });

  test("si sobran sílabas y la última palabra no cabe entera, su nota se queda sin guion y en ámbar", () => {
    const v = voz("Alta", notasEn([0, 0.5, 1, 1.5], 0.45, 67));
    const b = voz("Baja", notasEn([0, 0.5, 1, 1.5], 0.45, 60));
    const song = cancion([v, b]);
    let r = assignLyrics(song, v, splitSyllables("Can-ta-mos jun-tos"), 0, true);
    assert.equal(letra(v), "Can- ta- mos jun?");
    assert.equal(letra(b), "Can- ta- mos jun?"); // y su copia
    assert.deepEqual([r.puestas, r.sobran, r.dudosas], [4, 1, 1]);
    r = assignLyrics(song, v, splitSyllables("Can-ta-mos jun-tos"), 0, true); // otra vez igual: igual
    assert.equal(letra(v), "Can- ta- mos jun?");
    assert.equal(r.dudosas, 1);
    // Si la palabra cabe entera, o si el texto acaba así (la persona la sigue después), nada.
    r = assignLyrics(song, v, splitSyllables("Can-ta-mos sol y mar"), 0, false);
    assert.equal(letra(v), "Can- ta- mos sol");
    assert.equal(r.dudosas, 0);
    r = assignLyrics(song, v, splitSyllables("Can-ta-mos jun-"), 0, false);
    assert.equal(letra(v), "Can- ta- mos jun-");
    assert.equal(r.dudosas, 0);
    // Con «_» entre medias, la nota de la sílaba (no la que la alarga).
    r = assignLyrics(song, v, ["Can-", "ta-", "mos", "jun-", "_", "tos"], 0, false);
    assert.equal(letra(v), "Can- ta- mos jun?");
    r = assignLyrics(song, v, ["Can-", "ta-", "jun-", "_", "tos"], 0, false);
    assert.equal(letra(v), "Can- ta- jun? ·");
  });
});

describe("lyricsCopied", () => {
  test("sí si las otras voces con letra la tienen copiada; no si tienen la suya", () => {
    const { song, mel, otra } = dos(notasEn(DIEZ));
    assert.equal(lyricsCopied(song, mel), true); // ninguna otra tiene letra
    copyLyrics(song, mel, mel.notes);
    assert.equal(lyricsCopied(song, mel), true);
    otra.notes[9].lyric = "sol";
    assert.equal(lyricsCopied(song, mel), true); // casi toda
    otra.notes[8].lyric = "la";
    assert.equal(lyricsCopied(song, mel), false);
    assert.equal(lyricsCopied(song, otra), false);
  });

  test("las voces de la grabación no cuentan", () => {
    const { song, mel } = dos(notasEn(DIEZ));
    song.voices.push(voz("🎙 Melodía", notasEn(DIEZ).map((n) => ({ ...n, lyric: "la" })), { sungOf: "Melodía" }));
    assert.equal(lyricsCopied(song, mel), true);
  });

  test("con miles de notas no tarda: cada pareja se busca a saltos", () => {
    // 4 voces × 20 000 notas: buscando la pareja nota a nota tardaba segundos.
    const N = 20000;
    const voces = ["S", "A", "T", "B"].map((name) => voz(name, Array.from({ length: N }, (_, i) => ({ midi: 60, start: i * 0.4 + Math.floor(i / 8) * 0.5, dur: 0.38, lyric: `s${i}` }))));
    const song = cancion(voces);
    const t = performance.now();
    assert.equal(lyricsCopied(song, voces[0]), true);
    const r = assignLyrics(song, voces[0], voces[0].notes.map((n) => `${n.lyric}x`), 0, true);
    assert.equal(r.otras, 3 * N);
    assert.ok(performance.now() - t < 1500, `${Math.round(performance.now() - t)} ms`);
  });
});

describe("onsetPartner: la nota que ataca a la vez", () => {
  test("da la misma que buscándola nota a nota (la más cercana a menos de 30 ms; si empatan, la primera)", () => {
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let caso = 0; caso < 200; caso++) {
      const notas = [];
      for (let t = 0, i = 0; i < 40; i++) {
        t += [0, 0.01, 0.02, 0.03, 0.25, 0.5][Math.floor(azar() * 6)];
        notas.push({ midi: 60 + i, start: Math.round(t * 1000) / 1000, dur: 0.2 });
      }
      for (let q = 0; q < 30; q++) {
        const n = { midi: 50, start: Math.round(azar() * 1000 * (notas[notas.length - 1].start + 0.1)) / 1000, dur: 0.1 };
        let esperada;
        for (const x of notas) {
          const d = Math.abs(x.start - n.start);
          if (d < 0.03 && (!esperada || d < Math.abs(esperada.start - n.start))) esperada = x;
        }
        assert.equal(onsetPartner(notas, n), esperada, `caso ${caso}, ${n.start}`);
      }
    }
  });
});

describe("lyricsVoice: la voz que lleva la letra (MIDI y karaoke)", () => {
  test("no la que copia la letra en algunas frases (una de arriba), aunque vaya antes", () => {
    const f1 = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const f2 = f1.map((t) => t + 5);
    const tenor = voz("Tenor", [...notasEn(f1, 0.45, 67), { midi: 67, start: 5.25, dur: 0.95 }, { midi: 67, start: 6.25, dur: 0.95 }]);
    const lead = voz("Lead", notasEn([...f1, ...f2], 0.45, 64));
    const song = cancion([tenor, lead]);
    const r = assignLyrics(song, lead, splitSyllables("Mi gato duerme junto al sol\nLa luna brilla sobre mí"), 0, true);
    assert.ok(r.otras > 0 && tenor.notes.some((n) => n.lyric));
    assert.deepEqual(r.sinCopiar, [{ voz: "Tenor", frases: 1 }]);
    assert.equal(lyricsVoice(song), lead);
    assert.equal(lyricsVoice(song, [tenor]), tenor); // entre las que se ven
  });

  const silabas = (xs) => (n, i) => ({ ...n, ...(xs[i] ? { lyric: xs[i] } : {}) });

  test("con la misma letra en varias voces, la primera, aunque otra tenga más sílabas y palabras (un melisma)", () => {
    const ini = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    const sop = voz("Soprano", notasEn(ini, 0.45, 72).map(silabas(["Ma-", "", "", "", "ña-", "na‿al", "sol"])));
    const alt = voz("Contralto", notasEn(ini, 0.45, 65).map(silabas(["Ma-", "ña-", "na‿al", "sol", "can-", "ta-", "ré"])));
    assert.equal(lyricsVoice(cancion([sop, alt])), sop);
  });

  test("no la de arriba con sus «uh» y «dum» (un arreglo a capela), sino la melodía", () => {
    // Tres frases de 8 negras. El tenor dice la letra en la 1.ª frase (y en la 3.ª, en el segundo caso) y en las demás,
    // «uh» largos o «dum» en cada negra: no es una copia (menos de 9 de cada 10 sílabas), pero dice muchas menos
    // palabras que la melodía, y algunas que la melodía no dice.
    const LETRA3 = ["Can- ta- mos jun- tos a la luz", "Vo- ces que lle- nan to- do el", "Lle- ga la no- che sin ru- mor"].map((x) => x.split(" "));
    const frase = (f, n, midi, sil) => Array.from({ length: n }, (_, i) => ({ midi, start: (f * 9 + (i * 8) / n) * 0.5, dur: (4 / n) * 0.96, lyric: sil(i) }));
    const lead = () => voz("Lead", LETRA3.flatMap((l, f) => frase(f, 8, 64, (i) => l[i])));
    const dum = voz("Tenor", [...frase(0, 8, 67, (i) => LETRA3[0][i]), ...frase(1, 2, 67, () => "uh"), ...frase(2, 8, 67, () => "dum")]);
    const uh = voz("Tenor", [...frase(0, 8, 67, (i) => LETRA3[0][i]), ...frase(1, 2, 67, () => "uh"), ...frase(2, 8, 67, (i) => LETRA3[2][i])]);
    for (const tenor of [dum, uh]) {
      const ld = lead();
      assert.equal(lyricsVoice(cancion([tenor, ld])), ld);
    }
    // Ni una de arriba que solo dice «Ah».
    const ld = lead();
    assert.equal(lyricsVoice(cancion([voz("Alta", LETRA3.flatMap((_, f) => frase(f, 2, 70, () => "Ah"))), ld])), ld);
  });

  test("si varias llevan la letra entera, la que se oye en la grabación", () => {
    const ini = [0, 0.5, 1, 1.5, 2, 2.5];
    const letraDe = (dt) => notasEn(ini.map((t, i) => t + (i % 2 ? dt : 0)), 0.4, 65).map(silabas(["Lu-", "na‿y", "sol", "de", "pla-", "ta"]));
    const sop = voz("Soprano", letraDe(0));
    const alt = voz("Contralto", letraDe(0.1)); // a otro ritmo: no es copia
    const oida = voz("🎙 Contralto", notasEn(ini, 0.4, 65), { sungOf: "Contralto" });
    assert.equal(lyricsVoice(cancion([sop, alt])), sop);
    assert.equal(lyricsVoice(cancion([sop, alt, oida])), alt);
    assert.equal(lyricsVoice(cancion([sop, alt, oida]), [sop]), sop); // si no se ve, entre las que se ven
  });

  /** Una frase con las sílabas `sil` («_»: una nota sin sílaba) desde el pulso `p0` (0,5 s), cada `paso` pulsos y `dt`
   *  segundos más tarde (a otro ritmo: no es copia). */
  const frase = (p0, sil, midi, paso = 1, dt = 0) =>
    sil.split(" ").map((s, i) => ({ midi, start: (p0 + i * paso) * 0.5 + dt, dur: 0.45 * paso, ...(s !== "_" ? { lyric: s } : {}) }));
  const L1 = "Can- ta- mos jun- tos a la luz";
  const L2 = "Vo- ces que lle- nan to- do el mar";
  const L3 = "Lle- ga la no- che sin ru- mor";
  const L4 = "Bri- lla la lu- na so- bre el sol";
  /** Lo que se oye en la grabación, enlazado a la voz `de`. */
  const oida = (de) => voz(`🎙 ${de}`, notasEn([0, 0.5, 1], 0.45, 64), { sungOf: de });

  test("la que se oye, aunque otra diga más palabras con otra letra (un contracanto, otra lengua); no si solo dice parte de la misma", () => {
    // Un contracanto con otra letra y más palabras, a otro ritmo; o la letra en otra lengua (inventada).
    const otras = [
      () => voz("Contracanto", frase(0, "Bri- lla la lu- na so- bre el va- lle y can- ta el rí- o len- to ba- jo los pi- nos ver- des del mon- te", 67, 0.7)),
      () => voz("Otra lengua", frase(0, "Lo- ra ne ta si- vu ka- pe lo mi- ra dan to- si ke ba- ru po li- san vi ra- ke lu- mi", 60, 0.6)),
    ];
    for (const otra of otras) {
      const mel = voz("Melodía", [...frase(0, L1, 64), ...frase(9, L2, 64)]);
      const o = otra();
      assert.equal(lyricsVoice(cancion([mel, o])), o, o.name); // sin la grabación, la que dice más palabras
      assert.equal(lyricsVoice(cancion([mel, o, oida("Melodía")])), mel, o.name);
    }
    // Pero no si la que se oye solo dice parte de la misma letra (un coro que canta dos frases de tres), ni si dice
    // muchas menos palabras (unos «uh» y «dum»): la melodía la tiene entera.
    const mel = voz("Melodía", [...frase(0, L1, 64), ...frase(9, L2, 64), ...frase(18, L3, 64)]);
    const coro = voz("Coro", [...frase(0, L1, 72, 1.02), ...frase(9, L2, 72, 1.02)]);
    assert.equal(lyricsVoice(cancion([coro, mel, oida("Coro")])), mel);
    const tenor = voz("Tenor", [...frase(0, L1, 67, 1.02), ...frase(9, "uh", 67, 8), ...frase(18, "dum dum dum dum dum dum dum dum", 67)]);
    assert.equal(lyricsVoice(cancion([tenor, mel, oida("Tenor")])), mel);
  });

  test("ni la que se oye si solo añade «oh», «ah», «uh» o «doo» a parte de la misma letra (un coro, un eco, un doo-wop)", () => {
    // La grabación se parece más a una voz de acompañamiento que canta parte de la letra y unos vocablos de una sílaba:
    // eso no es otra letra, y la letra entera es la de la melodía.
    const melodia = (...frases) => voz("Melodía", frases.flatMap((l, f) => frase(9 * f, l, 64)));
    const casos = [
      // un coro que canta dos frases de tres y acaba con un «oh»
      [melodia(L1, L2, L3), voz("Coro", [...frase(0, L1, 72, 1, 0.1), ...frase(9, "Vo- ces que lle- nan to- do el oh", 72, 1, 0.1)])],
      // lo mismo con una palabra cambiada («cantan» por «llenan»): una sola de varias sílabas que la melodía no dice no es
      // otra letra
      [melodia(L1, L2, L3), voz("Coro", [...frase(0, L1, 72, 1, 0.1), ...frase(9, "Vo- ces que can- tan to- do el oh", 72, 1, 0.1)])],
      // una canción de dos frases: el coro canta la 2.ª, y «oh» y «ah» en la 1.ª
      [melodia(L1, L2), voz("Coro", [...frase(0, "oh _ ah _", 72, 2), ...frase(9, L2, 72, 1, 0.1)])],
      // el coro del estribillo (3.ª y 4.ª frase) con «uh», «ah», «oh» y «mm» en las estrofas
      [melodia(L1, L2, L3, L4), voz("Coro", [...frase(0, "uh _ ah _", 72, 2), ...frase(9, "oh _ mm _", 72, 2), ...frase(18, L3, 72, 1, 0.1), ...frase(27, L4, 72, 1, 0.1)])],
      // un eco que repite el final de cada frase y un «oh»
      [melodia(L1, L2, L3), voz("Eco", [...frase(8, "a la luz oh", 60, 0.5), ...frase(17, "to- do el mar oh", 60, 0.5), ...frase(26, "sin ru- mor oh", 60, 0.5)])],
      // un doo-wop: la 1.ª frase con la letra y luego cuatro vocablos
      [melodia(L1, L2, L3), voz("Tenor", [...frase(0, L1, 67, 1, 0.1), ...frase(9, "doo wop sha bam doo wop sha bam", 67), ...frase(18, "doo wop sha bam doo wop sha bam", 67)])],
    ];
    for (const [mel, otra] of casos) {
      assert.equal(lyricsVoice(cancion([otra, mel, oida(otra.name)])), mel, letra(otra));
      assert.equal(lyricsVoice(cancion([mel, otra, oida(otra.name)])), mel, letra(otra));
    }
    // Con dos grabaciones, una enlazada al coro y otra a la melodía, también la melodía.
    const [mel, coro] = casos[0];
    assert.equal(lyricsVoice(cancion([coro, mel, oida("Coro"), oida("Melodía")])), mel);
  });

  test("pero sí la que se oye si dice otra letra: dos palabras de varias sílabas que la otra no dice bastan", () => {
    // Un tenor que copia las dos primeras frases y en la 3.ª canta un contracanto con más palabras: la melodía, enlazada a
    // la grabación, dice menos palabras, pero su 3.ª frase es otra letra.
    const mel = voz("Melodía", [...frase(0, L1, 64), ...frase(9, L2, 64), ...frase(18, L3, 64)]);
    const contra = "Ven ven que ya vie- ne la fies- ta del pue- blo y can- ta- re- mos to- dos";
    const tenor = voz("Tenor", [...frase(0, L1, 67), ...frase(9, L2, 67), ...frase(18, contra, 67, 0.5)]);
    assert.equal(lyricsVoice(cancion([mel, tenor])), tenor); // sin la grabación, la que dice más palabras
    assert.equal(lyricsVoice(cancion([mel, tenor, oida("Melodía")])), mel);
    assert.equal(lyricsVoice(cancion([tenor, mel, oida("Melodía")])), mel);
    // Otra lengua (inventada) casi toda de palabras de una sílaba, con dos de dos sílabas.
    const otra = voz("Otra", frase(0, "Bri- lla la lu- na so- bre el va- lle y can- ta el rí- o len- to ba- jo los pi- nos ver- des del mon- te", 60, 0.7));
    const lengua = voz("Melodía", [...frase(0, "Ka lo mi ta ve- ru no", 64), ...frase(9, "Pa si do ne ra- mu ke", 64)]);
    assert.equal(lyricsVoice(cancion([lengua, otra])), otra);
    assert.equal(lyricsVoice(cancion([lengua, otra, oida("Melodía")])), lengua);
  });

  test("lo que se recuerda entre fotogramas no sirve si cambian las notas, las sílabas o las voces", () => {
    // «B» dice «Lu-na de pla-ta pla-ta»; «A», «Lu-na de pla-ta» un poco después (a otro ritmo): las dos, letra entera.
    const ini = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    const a = voz("A", notasEn(ini.slice(0, 5).map((t) => t + 0.1), 0.4, 70).map(silabas(["Lu-", "na", "de", "pla-", "ta"])));
    const b = voz("B", notasEn(ini, 0.4, 64).map(silabas(["Lu-", "na", "de", "pla-", "ta", "pla-", "ta"])));
    const song = cancion([a, b]);
    assert.equal(lyricsVoice(song, [a, b]), a);
    assert.equal(lyricsVoice(song, [a, b]), a);
    for (const n of a.notes) n.start -= 0.1; // ahora ataca a la vez que «B»: su letra es copia de la de «B», que tiene más
    assert.equal(lyricsVoice(song, [a, b]), b);
    delete b.notes[5].lyric; // «B» ya no repite: tienen las mismas sílabas
    delete b.notes[6].lyric;
    b.notes[4].lyric = "ta";
    assert.equal(lyricsVoice(song, [a, b]), a);
    assert.equal(lyricsVoice(song, [b]), b); // entre las que se ven
    song.voices.push(voz("🎙 B", notasEn(ini, 0.4, 64), { sungOf: "B" }));
    assert.equal(lyricsVoice(song, [a, b]), b); // la que se oye
  });

  test("si empatan, la primera; sin letra, ninguna; las de la grabación no cuentan", () => {
    const a = voz("A", notasEn([0, 1], 0.5).map((n) => ({ ...n, lyric: "la" })));
    const b = voz("B", notasEn([0, 1], 0.5).map((n) => ({ ...n, lyric: "la" })));
    const g = voz("🎙 A", notasEn([0, 1, 2], 0.5).map((n) => ({ ...n, lyric: "la" })), { sungOf: "A" });
    assert.equal(lyricsVoice(cancion([a, b, g])), a);
    assert.equal(lyricsVoice(cancion([voz("C", notasEn([0]))])), undefined);
  });
});

// La canción de scripts/pruebas/14-letra-oida.js: 12 negras desde el segundo 0,8 y lo que «oye» Whisper.
const T = Array.from({ length: 13 }, (_, i) => 0.8 + 0.5 * i);
const p = (texto, a, b) => ({ texto, a, b });
const OIDAS = [p("Mi", T[0] + 0.02, T[1] - 0.05), p("gato", T[1] + 0.03, T[2] + 0.15), p("escucha", T[2] + 0.2, T[5] - 0.05),
  p("la", T[5] + 0.02, T[6] - 0.05), p("canción", T[6] + 0.03, T[9] - 0.05), p("del", T[9] + 0.02, T[10] - 0.05), p("mar", T[10] + 0.03, T[12] - 0.1)];
const ENTERA = "Mi ga- to‿es- cu- cha la can- ción · del mar ·";
const alta = () => voz("Alta", T.slice(0, 12).map((start) => ({ midi: 67, start, dur: 0.5 })));
const textos = (ps) => ps.map((x) => x.texto).join(" ");

describe("placeHeardPreview y heardFrom: empezar en una nota", () => {
  test("lo oído tal cual cae desde cualquier nota igual que al ponerlo desde la primera", () => {
    const notas = alta().notes;
    const entera = placeHeardPreview(notas, 0, OIDAS, null);
    assert.equal(entera.porNota.map((x) => x ?? "·").join(" "), ENTERA);
    for (let k = 1; k < notas.length; k++) {
      const c = placeHeardPreview(notas, k, OIDAS, null);
      assert.equal(c.porNota.length, notas.length - k);
      assert.deepEqual(c.porNota, entera.porNota.slice(k), `desde ${k}`);
      assert.deepEqual(c.dudosas, entera.dudosas.slice(k), `desde ${k}`);
      assert.deepEqual(c.descartadas, [], `desde ${k}`);
      assert.ok(c.silabas.every((s) => s.nota >= 0 && entera.porNota[s.nota + k]), `desde ${k}`);
    }
  });

  test("lo cantado justo antes del corte no entra en la primera nota", () => {
    const v = alta();
    const song = cancion([v]);
    placeHeard(song, v, OIDAS, null, 6, false);
    assert.equal(sinMarca(v), "· · · · · · can- ción · del mar ·");
  });

  test("heardFrom: las palabras que empiezan desde esa nota", () => {
    const notas = alta().notes;
    assert.equal(textos(heardFrom(notas, 0, OIDAS)), "Mi gato escucha la canción del mar");
    assert.equal(textos(heardFrom(notas, 3, OIDAS)), "la canción del mar"); // «escucha» empieza en la 2 («to‿es-»)
    assert.equal(textos(heardFrom(notas, 6, OIDAS)), "canción del mar");
    assert.deepEqual(heardFrom(notas, 11, OIDAS), []);
    assert.ok(heardFrom(notas, 6, OIDAS).every((x) => OIDAS.includes(x)));
  });

  test("la letra corregida desde una nota se casa con lo oído desde ella", () => {
    const v = alta();
    const song = cancion([v]);
    placeHeard(song, v, OIDAS, "canción del mar.", 6, false);
    assert.equal(sinMarca(v), "· · · · · · can- ción · del mar. ·");
    placeHeard(song, v, OIDAS, "Mi perro escucha la canción del mar", 0, false);
    assert.equal(sinMarca(v), "Mi pe- rro‿es- cu- cha la can- ción · del mar ·");
  });

  test("si la nota parte una palabra o alarga la sílaba de antes, sus notas siguen así y lo corregido va en su sitio", () => {
    // Desde la 7 («ción», de «can-ción»), el cuadro trae «del mar»; se cambia «mar» por «sol».
    const v = alta();
    const song = cancion([v]);
    assert.equal(textos(heardFrom(v.notes, 7, OIDAS)), "del mar");
    placeHeard(song, v, OIDAS, "del sol", 7, false);
    assert.equal(sinMarca(v), "· · · · · · · ción · del sol ·");
    // Desde la 4 («cha», de «es-cu-cha»), con un punto al final.
    const w = alta();
    placeHeard(cancion([w]), w, OIDAS, "la canción del mar.", 4, false);
    assert.equal(sinMarca(w), "· · · · cha la can- ción · del mar. ·");
    // Desde la 8, que alarga «ción»: «del» no se adelanta a ella.
    const x = alta();
    placeHeard(cancion([x]), x, OIDAS, "del mar.", 8, false);
    assert.equal(sinMarca(x), "· · · · · · · · · del mar. ·");
  });

  test("y si el texto ya empieza por ese final (la letra que tenían las notas), va desde la nota", () => {
    const v = alta();
    const song = cancion([v]);
    placeHeard(song, v, OIDAS, null, 0, false);
    placeHeard(song, v, OIDAS, "ción del mar", 7, false);
    assert.equal(sinMarca(v), ENTERA);
    placeHeard(song, v, OIDAS, "cu-cha la canción del mar", 3, false);
    assert.equal(sinMarca(v), ENTERA);
  });

  test("si se añade delante la palabra que Whisper no oyó, va en su nota (se casa desde la nota de inicio)", () => {
    // Al colocarlo todo, la nota de la palabra que falta se queda vacía (alarga la sílaba de antes) o con lo de antes.
    // La persona empieza en ella y escribe la palabra al principio del cuadro, en la misma línea.
    for (const [falta, k, texto] of [
      ["del", 9, "del mar"],
      ["gato", 1, "gato escucha la canción del mar"],
    ]) {
      const oidas = OIDAS.filter((x) => x.texto !== falta);
      const v = alta();
      const song = cancion([v]);
      placeHeard(song, v, oidas, null, 0, false);
      assert.notEqual(sinMarca(v), ENTERA, falta);
      placeHeard(song, v, oidas, texto, k, false);
      assert.equal(sinMarca(v), ENTERA, falta);
    }
  });

  test("lo que no cabe se cuenta desde la nota solo si es de ahí en adelante", () => {
    // Dos frases con un silencio: en él, Whisper «oye» una palabra que no canta nadie; y otra, justo tras el corte.
    const notas = notasEn([0, 0.5, 1, 1.5, 3, 3.5, 4, 4.5], 0.45, 64);
    const oidas = [p("Hola", 0.02, 0.45), p("amigo", 0.52, 1.4), p("mío", 1.5, 1.95), p("gracias", 2.3, 2.7), p("vuelve", 3.02, 3.95), p("ya", 3.96, 3.99), p("pronto", 4.02, 4.9)];
    const entera = placeHeardPreview(notas, 0, oidas, null);
    assert.deepEqual(entera.descartadas.filter((x) => x === "gracias" || x === "ya"), ["gracias", "ya"]);
    const c = placeHeardPreview(notas, 4, oidas, null);
    assert.deepEqual(c.porNota, entera.porNota.slice(4));
    assert.ok(!c.descartadas.includes("gracias") && c.descartadas.includes("ya"));
    assert.equal(textos(heardFrom(notas, 4, oidas)), "vuelve ya pronto");
    assert.equal(textos(heardFrom(notas, 5, oidas)), "ya pronto"); // «ya» va tras «ve», que cae en la nota 5
  });

  test("si cambian las notas, se vuelve a colocar", () => {
    const notas = alta().notes;
    assert.equal(placeHeardPreview(notas, 0, OIDAS, null).porNota.filter(Boolean).length, 10);
    for (const n of notas) n.start += 20;
    assert.equal(placeHeardPreview(notas, 0, OIDAS, null).porNota.filter(Boolean).length, 0);
  });

  test("desde fuera de la voz no se toca nada", () => {
    const v = alta();
    const song = cancion([v]);
    assert.equal(placeHeard(song, v, OIDAS, null, -1, false).puestas, 0);
    assert.equal(placeHeard(song, v, OIDAS, null, 12, false).puestas, 0);
    assert.ok(v.notes.every((n) => !n.lyric));
    assert.deepEqual(heardFrom(v.notes, 12, OIDAS), []);
  });
});

describe("placeHeard y la mezcla: las otras voces", () => {
  test("al mezclar, la voz al mismo ritmo recibe la letra y la marca; al corregir con «otras», sus copias cambian", () => {
    const v = alta();
    const baja = voz("Baja", T.slice(0, 12).map((start) => ({ midi: 55, start, dur: 0.5 })));
    const song = cancion([v, baja]);
    const r = placeHeard(song, v, OIDAS, null, 0, true);
    assert.equal(sinMarca(baja), ENTERA);
    assert.equal(letra(baja), letra(v));
    assert.equal(r.otras, 10);
    assert.equal(lyricsCopied(song, v), true);
    placeHeard(song, v, OIDAS, "Mi perro escucha la canción del mar", 0, true);
    assert.equal(sinMarca(baja), "Mi pe- rro‿es- cu- cha la can- ción · del mar ·");
  });

  test("la voz en blancas no recibe nada", () => {
    const v = alta();
    const baja = voz("Baja", [0, 2, 4, 6, 8, 10].map((i) => ({ midi: 55, start: T[i], dur: 1 })));
    const r = placeHeard(cancion([v, baja]), v, OIDAS, null, 0, true);
    assert.ok(baja.notes.every((n) => !n.lyric));
    assert.deepEqual(r.otroRitmo, ["Baja"]);
  });
});

describe("copyNotices: lo que se cuenta de las otras voces", () => {
  const sin = { distintas: 0, otroRitmo: [], sinCopiar: [] };
  test("en singular y en plural", () => {
    assert.deepEqual(copyNotices(sin), []);
    assert.deepEqual(copyNotices({ ...sin, distintas: 1 }), ["1 nota de las otras voces tiene otra sílaba y se queda como estaba"]);
    assert.deepEqual(copyNotices({ ...sin, distintas: 3 }), ["3 notas de las otras voces tienen otra sílaba y se quedan como estaban"]);
    assert.deepEqual(copyNotices({ ...sin, cortadas: 1 }), ["1 nota de las otras voces se queda con media palabra, en ámbar"]);
    assert.deepEqual(copyNotices({ ...sin, cortadas: 2 }), ["2 notas de las otras voces se quedan con media palabra, en ámbar"]);
    assert.deepEqual(copyNotices({ ...sin, otroRitmo: ["Baja"] }), ["no se copia a «Baja»: va a otro ritmo"]);
    assert.deepEqual(copyNotices({ ...sin, otroRitmo: ["Baja", "Tenor", "Bajo"] }), ["no se copia a «Baja», a «Tenor» ni a «Bajo»: van a otro ritmo"]);
    assert.deepEqual(copyNotices({ ...sin, sinCopiar: [{ voz: "Baja", frases: 1 }] }), ["no se copia a «Baja» en 1 frase: ahí va a otro ritmo"]);
    assert.deepEqual(copyNotices({ ...sin, sinCopiar: [{ voz: "Baja", frases: 2 }, { voz: "Tenor", frases: 1 }] }), [
      "no se copia a «Baja» en 2 frases ni a «Tenor» en 1: ahí van a otro ritmo",
    ]);
  });
});

// ---- Copias con síncopas, acordes y melismas hechos a mano. Letra inventada. ------------------------------------------

describe("copias con síncopas, acordes y melismas hechos a mano", () => {
  /** La contralto con la misma letra y la sílaba `k` adelantada una corchea (síncopa). */
  const sincopada = (k) => {
    const sil = splitSyllables(OCHO);
    const sop = voz("Soprano", notasEn(OCHO_INI, 0.48, 72));
    const notas = OCHO_INI.map((start, i) => ({ midi: 65, start, dur: 0.48, lyric: sil[i] }));
    notas[k].start -= 0.25;
    notas[k].dur += 0.25;
    notas[k - 1].dur -= 0.25;
    const alt = voz("Contralto", notas);
    const song = cancion([sop, alt]);
    assignLyrics(song, sop, sil, 0, false);
    return { song, sop, alt };
  };

  test("una coma o una tilde en la sílaba que la otra voz adelanta no corta la palabra (ni la marca)", () => {
    for (const [k, nuevo] of [[2, OCHO.replace("Pin-ta-mos", "Pin-ta-mos,")], [1, OCHO.replace("Pin-ta-mos", "Pin-tá-mos")]]) {
      const { song, sop, alt } = sincopada(k);
      assert.equal(lyricsCopied(song, sop), true);
      const antes = letra(alt);
      for (let vez = 1; vez <= 2; vez++) {
        const r = assignLyrics(song, sop, splitSyllables(nuevo), 0, true);
        assert.equal(letra(alt).split(" ").slice(0, 3).join(" "), antes.split(" ").slice(0, 3).join(" "), `${nuevo}, vez ${vez}`);
        assert.equal(r.cortadas, 0, `${nuevo}, vez ${vez}`);
      }
    }
  });

  test("un acorde de la voz con otra sílaba suya a la vez («Ah» con «Pin-») tampoco es la sílaba siguiente", () => {
    const sil = splitSyllables(OCHO);
    const sop = voz("Soprano", notasEn(OCHO_INI, 0.48, 72));
    const notas = OCHO_INI.map((start, i) => ({ midi: 65, start, dur: 0.48, lyric: sil[i] }));
    notas.splice(1, 0, { midi: 62, start: 0, dur: 0.48, lyric: "Ah" });
    const alt = voz("Contralto", notas);
    const song = cancion([sop, alt]);
    assignLyrics(song, sop, sil, 0, false);
    const r = assignLyrics(song, sop, splitSyllables(OCHO.replace("cie-los", "cam-pos")), 0, true);
    assert.equal(letra(alt).split(" ").slice(0, 4).join(" "), "Pin- Ah ta- mos");
    assert.equal(r.cortadas, 0);
  });

  test("el melisma hecho a mano sigue aunque pase por una nota en que la melodía tampoco tiene sílaba", () => {
    const ini = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    // a) «Ah» en 5 notas; la melodía tiene un melisma en la 2.ª de ellas.
    {
      const sop = voz("Soprano", notasEn(ini, 0.45, 72));
      const alt = voz("Contralto", notasEn(ini, 0.45, 65));
      const song = cancion([sop, alt]);
      assignLyrics(song, sop, ["Pin-", "ta-", "mos", "cie-", "_", "los", "de", "sol"], 0, true);
      alt.notes[3].lyric = "Ah";
      for (const i of [5, 6, 7]) delete alt.notes[i].lyric;
      assignLyrics(song, sop, ["Pin-", "ta-", "mos", "cam-", "_", "pos", "de", "sol"], 0, true);
      assert.equal(sinMarca(alt), "Pin- ta- mos Ah · · · ·");
    }
    // b) «Oh» en lugar de «mos», que la melodía alarga una nota; luego, hasta el final.
    {
      const sop = voz("Soprano", notasEn(ini, 0.45, 72));
      const alt = voz("Contralto", notasEn(ini, 0.45, 65));
      const song = cancion([sop, alt]);
      assignLyrics(song, sop, ["Pin-", "ta-", "mos", "_", "cie-", "los", "de", "sol"], 0, true);
      alt.notes[2].lyric = "Oh";
      for (const i of [4, 5, 6, 7]) delete alt.notes[i].lyric;
      assignLyrics(song, sop, ["Pin-", "ta-", "mos", "_", "cam-", "pos", "de", "sol"], 0, true);
      assert.equal(sinMarca(alt), "Pin- ta- Oh · · · · ·");
    }
  });
});
