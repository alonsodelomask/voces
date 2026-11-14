// Pruebas de cómo se casa la letra (sacada de la grabación con Whisper) con las notas (src/lyricsAlign.ts).
// Se ejecutan con: node --test scripts/lyricsAlign.test.mjs
// (Node 24 quita los tipos de TypeScript solo; con Node 22.15 o posterior, añade --experimental-strip-types.)
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as modulo from "node:module";

// src/lyricsAlign.ts importa './lyrics' sin extensión, como el resto de src (así lo quieren Vite y tsc). Node
// necesita la extensión: se la ponemos al resolver lo que importe un archivo .ts.
if (typeof modulo.registerHooks !== "function") throw new Error("Hace falta Node 22.15 o posterior (module.registerHooks).");
modulo.registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (/^\.\.?\//.test(especificador) && !/\.[a-z]+$/i.test(especificador) && contexto.parentURL?.endsWith(".ts")) {
      return siguiente(`${especificador}.ts`, contexto);
    }
    return siguiente(especificador, contexto);
  },
});
const { AJUSTES_CASAR, casarLetra, heredarTiempos, palabrasDeTexto } = await import("../src/lyricsAlign.ts");
const { silabasConRasgos, splitSyllables } = await import("../src/lyrics.ts");

/** Notas de `dur` segundos que empiezan en `inicios`. */
const notasEn = (inicios, dur = 0.35) => inicios.map((t) => ({ ini: t, fin: t + dur }));

// «Asómate a la calle, por favor»: 11 sílabas en 10 notas, con un silencio antes de «por».
const NOTAS_CALLE = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 3.2, 3.6, 4.0]);
const PALABRAS_CALLE = [
  { texto: "Asómate", a: 0.0, b: 1.35, abreLinea: true },
  { texto: "a", a: 1.3, b: 1.55 },
  { texto: "la", a: 1.6, b: 1.95 },
  { texto: "calle,", a: 2.0, b: 2.75 },
  { texto: "por", a: 3.2, b: 3.55 },
  { texto: "favor", a: 3.6, b: 4.35 },
];
const CALLE = ["A-", "só-", "ma-", "te‿a", "la", "ca-", "lle,", "por", "fa-", "vor"];

describe("silabasConRasgos", () => {
  test("las mismas sílabas que splitSyllables sin sinalefa", () => {
    for (const texto of ["Asómate a la calle, por favor", "La noche es una barca de cristal", "¿Qué es eso?", "a-so-ma-te",
      "Glo_ria a Dios", "hielo y huevo", "poeta aéreo", "2 amigos", "hola,adiós"]) {
      const esperadas = splitSyllables(texto, { sinalefa: false }).filter((s) => s !== "_").map((s) => s.replace(/-$/, ""));
      assert.deepEqual(silabasConRasgos(texto).map((s) => s.texto), esperadas, texto);
    }
  });

  test("rasgos de «Asómate a la calle, por favor»", () => {
    const s = silabasConRasgos("Asómate a la calle, por favor");
    assert.deepEqual(s.map((x) => x.texto), ["A", "só", "ma", "te", "a", "la", "ca", "lle,", "por", "fa", "vor"]);
    assert.deepEqual(s.map((x) => x.sinalefa), [false, false, false, true, false, false, false, false, false, false, false]);
    assert.deepEqual(s.map((x) => x.abrePalabra), [true, false, false, false, true, true, true, false, true, true, false]);
    assert.deepEqual(s.map((x) => x.cierraPalabra), [false, false, false, true, true, true, false, true, true, false, true]);
    assert.deepEqual(s.map((x) => x.vocalAlEmpezar), [true, false, false, false, true, false, false, false, false, false, false]);
    assert.ok(s.every((x) => !x.hiato));
  });

  test("hiato dentro de la palabra, «h» muda, «y» y semivocales", () => {
    assert.deepEqual(silabasConRasgos("poeta").map((x) => x.hiato), [false, true, false]);
    assert.deepEqual(silabasConRasgos("ahí").map((x) => [x.texto, x.hiato, x.vocalAlEmpezar]), [["a", false, true], ["hí", true, true]]);
    assert.deepEqual(silabasConRasgos("reyes").map((x) => x.hiato), [false, false]);
    const h = silabasConRasgos("hielo y huevo");
    assert.deepEqual(h.map((x) => x.sinalefa), [false, true, false, false, false]); // «lo‿y», pero no «y‿hue»
    assert.equal(h[0].vocalAlEmpezar, false);
    assert.equal(h[2].vocalAlEmpezar, true);
    // un «_» entre dos palabras corta la sinalefa, como en splitSyllables
    assert.deepEqual(silabasConRasgos("canta _ a").map((x) => x.sinalefa), [false, false, false]);
  });

  test("melismas marcados con «_» y sílaba tónica", () => {
    const m = (t) => silabasConRasgos(t).map((x) => `${x.tonica ? x.texto.toUpperCase() : x.texto}${"_".repeat(x.melismas)}`).join(" ");
    assert.equal(m("A-le-lu-_-_-ya"), "A le LU__ ya");
    assert.equal(m("Glo_ria a Dios"), "GLO_ ria a DIOS");
    assert.equal(m("mar _ _ que"), "MAR__ que"); // «que», átona
    assert.equal(m("_hola"), "HO la"); // un «_» delante de todo no alarga nada
    assert.equal(m("canción caminante árbol amor país el sol"), "can CIÓN ca mi NAN te ÁR bol a MOR pa ÍS el SOL");
  });
});

describe("palabrasDeTexto", () => {
  test("los saltos de línea abren línea y los signos sueltos van con su palabra", () => {
    assert.deepEqual(palabrasDeTexto("¿ Qué es eso ?\n— Hola , amigo\n\n  canta"), [
      { texto: "¿Qué", abreLinea: true },
      { texto: "es", abreLinea: false },
      { texto: "eso?", abreLinea: false },
      { texto: "—Hola,", abreLinea: true },
      { texto: "amigo", abreLinea: false },
      { texto: "canta", abreLinea: true },
    ]);
    assert.deepEqual(palabrasDeTexto(""), []);
  });
});

describe("casarLetra: casos pequeños", () => {
  test("sinalefa: «Asómate a la calle, por favor» en 10 notas con buenos tiempos", () => {
    const r = casarLetra(NOTAS_CALLE, PALABRAS_CALLE);
    assert.deepEqual(r.porNota, CALLE);
    assert.deepEqual(r.descartadas, []);
    assert.deepEqual(r.dudosas, new Array(10).fill(false));
    assert.equal(r.silabas.length, 11);
    assert.equal(r.silabas[3].nota, 3);
    assert.equal(r.silabas[4].nota, 3); // «a», junto a «se»
  });

  test("melisma: una sílaba en dos notas seguidas", () => {
    const r = casarLetra(notasEn([0, 0.5, 1.0, 1.5, 2.0], 0.45), [
      { texto: "El", a: 0, b: 0.4, abreLinea: true },
      { texto: "sol", a: 0.5, b: 1.4 }, // se oye durante dos notas
      { texto: "brilla", a: 1.5, b: 2.4 },
    ]);
    assert.deepEqual(r.porNota, ["El", "sol", undefined, "bri-", "lla"]);
    assert.deepEqual(r.descartadas, []);
  });

  test("más sílabas que notas: las que no caben se descartan y la nota partida queda dudosa", () => {
    const r = casarLetra(notasEn([0, 0.5, 1.0, 1.5], 0.45), [
      { texto: "Canta", a: 0, b: 0.9, abreLinea: true },
      { texto: "la", a: 1.0, b: 1.4 },
      { texto: "noche", a: 1.5, b: 2.4 },
      { texto: "clara", a: 2.5, b: 3.4 },
    ]);
    // «no», sin guion: «che» no sigue en ninguna nota
    assert.deepEqual(r.porNota, ["Can-", "ta", "la", "no"]);
    assert.deepEqual(r.descartadas, ["che", "clara"]);
    assert.deepEqual(r.dudosas, [false, false, false, true]);
  });

  test("si lo que sigue de una palabra no cabe, su última nota no lleva guion (no se pega a la siguiente) y queda dudosa", () => {
    // «no-che» con sitio solo para «no», y «luna llena» en la frase siguiente: «no-» y «lu-na» se leerían «nolu-na»
    const notas = notasEn([0, 0.4, 0.8, 1.2, 2.4, 2.8, 3.2, 3.6], 0.37);
    const oidas = [{ texto: "Canta", a: 0, b: 0.77, abreLinea: true }, { texto: "la", a: 0.8, b: 1.17 }, { texto: "noche", a: 1.2, b: 1.97 },
      { texto: "luna", a: 2.4, b: 3.17, abreLinea: true }, { texto: "llena", a: 3.2, b: 3.97 }];
    for (const r of [casarLetra(notas, oidas), casarLetra(notas, heredarTiempos("Canta la noche\nluna llena", oidas, notas))]) {
      assert.deepEqual(r.porNota, ["Can-", "ta", "la", "no", "lu-", "na", "lle-", "na"]);
      assert.deepEqual(r.descartadas, ["che"]);
      assert.equal(r.dudosas[3], true);
    }
    // si la palabra sigue en otra nota (aunque una sílaba de en medio no quepa), el guion se queda
    const r = casarLetra(notasEn([0, 0.4, 0.8]), [{ texto: "A-le-lu-ya", a: 0, b: 1.2 }]);
    assert.deepEqual(r.porNota, ["A-", "lu-", "ya"]);
    assert.deepEqual(r.descartadas, ["le-"]);
  });

  test("menos sílabas que notas: las notas de más alargan la sílaba que suena", () => {
    const r = casarLetra(notasEn([0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0], 0.45), [
      { texto: "Ven", a: 0, b: 0.9, abreLinea: true },
      { texto: "al", a: 1.0, b: 1.4 },
      { texto: "mar", a: 1.5, b: 3.4 },
    ]);
    assert.deepEqual(r.porNota, ["Ven", undefined, "al", "mar", undefined, undefined, undefined]);
    assert.deepEqual(r.descartadas, []);
  });

  test("sin tiempos (NaN): se guía por la sinalefa", () => {
    const r = casarLetra(NOTAS_CALLE, PALABRAS_CALLE.map((p) => ({ ...p, a: NaN, b: NaN })));
    assert.deepEqual(r.porNota, CALLE);
    assert.deepEqual(r.descartadas, []);
  });

  test("sin tiempos (NaN): cada línea empieza tras un silencio", () => {
    // «Canta la noche» (5 sílabas) en 6 notas; silencio; «sobre el agua» (5 sílabas, «bre‿el») en 4 notas
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 3.4, 3.8, 4.2, 4.6]);
    const palabras = palabrasDeTexto("Canta la noche\nsobre el agua").map((p) => ({ ...p, a: NaN, b: NaN }));
    const r = casarLetra(notas, palabras);
    // la nota de más alarga el final de la línea, que es donde más se alarga…
    assert.deepEqual(r.porNota, ["Can-", "ta", "la", "no-", "che", undefined, "so-", "bre‿el", "a-", "gua"]);
    assert.deepEqual(r.descartadas, []);
    // …pero sin tiempos no se sabe: se marca
    assert.ok(r.dudosas.slice(1, 5).some(Boolean));
    assert.ok(!r.dudosas.slice(6).some(Boolean));
  });

  test("palabras inventadas al final: «Subtítulos realizados por la comunidad de Amara.org» se descartan", () => {
    const palabras = [...PALABRAS_CALLE];
    let t = 4.35 + 1.5;
    for (const texto of "Subtítulos realizados por la comunidad de Amara.org".split(" ")) {
      palabras.push({ texto, a: t, b: t + 0.3 });
      t += 0.35;
    }
    const r = casarLetra(NOTAS_CALLE, palabras);
    assert.deepEqual(r.porNota, CALLE);
    assert.deepEqual(r.descartadas, ["Subtítulos", "realizados", "por", "la", "comunidad", "de", "Amara.org"]);
    assert.deepEqual(r.dudosas, new Array(10).fill(false));
  });

  test("una nota ligada sigue con la sílaba de la anterior", () => {
    const notas = [0, 0.5, 1.0, 1.5].map((t, q) => ({ ini: t, fin: t + 0.5, ligada: q === 2 }));
    const r = casarLetra(notas, [
      { texto: "Can-", a: 0, b: 0.4 },
      { texto: "ta-", a: 0.5, b: 1.4 },
      { texto: "ré", a: 1.0, b: 1.9 }, // Whisper la oye en la ligada, pero ahí no puede empezar
    ]);
    assert.deepEqual(r.porNota, ["Can-", "ta-", undefined, "ré"]);
  });

  test("sin notas o sin palabras", () => {
    assert.deepEqual(casarLetra([], PALABRAS_CALLE).descartadas, ["Asómate", "a", "la", "calle,", "por", "favor"]);
    const r = casarLetra(NOTAS_CALLE, []);
    assert.deepEqual(r.porNota, new Array(10).fill(undefined));
    assert.deepEqual(r.descartadas, []);
  });
});

describe("heredarTiempos", () => {
  // lo que oyó Whisper
  const oidas = [
    { texto: " Canta", a: 0, b: 0.9 },
    { texto: " la", a: 1.0, b: 1.4 },
    { texto: " noche", a: 1.5, b: 2.4 },
    { texto: " sobre", a: 3.0, b: 3.9 },
    { texto: " el", a: 4.0, b: 4.3 },
    { texto: " agua", a: 4.5, b: 5.4 },
    // aquí se cantó «tan», que Whisper no oyó
    { texto: " clara.", a: 6.0, b: 6.9 },
  ];

  test("una palabra cambiada, una añadida y una quitada", () => {
    // «noche» → «luna» (cambiada), sin «el» (quitada), «tan» (añadida)
    const r = heredarTiempos("Canta la luna\nsobre agua tan clara", oidas);
    assert.deepEqual(r.map((p) => p.texto), ["Canta", "la", "luna", "sobre", "agua", "tan", "clara"]);
    assert.deepEqual(r.map((p) => !!p.abreLinea), [true, false, false, true, false, false, false]);
    assert.deepEqual(r.map((p) => !!p.supuesta), [false, false, false, false, false, true, false]);
    assert.deepEqual([r[2].a, r[2].b], [1.5, 2.4]); // la cambiada se queda con el tiempo de la que había en su sitio
    assert.deepEqual([r[4].a, r[4].b], [4.5, 5.4]);
    assert.deepEqual([r[5].a, r[5].b], [5.4, 6.0]); // la añadida, entre sus vecinas
    assert.deepEqual([r[6].a, r[6].b], [6.0, 6.9]);
  });

  test("palabras nuevas al principio o al final, y sin nada transcrito", () => {
    const delante = heredarTiempos("Ay, canta la noche", oidas.slice(0, 3));
    assert.equal(delante[0].supuesta, true);
    assert.ok(delante[0].a < delante[0].b && delante[0].b <= 0);
    const detras = heredarTiempos("Canta la noche y el día", oidas.slice(0, 3));
    assert.deepEqual(detras.map((p) => !!p.supuesta), [false, false, false, true, true, true]);
    assert.ok(detras[3].a >= 2.4 && detras[3].a < detras[4].a && detras[4].a < detras[5].a);
    const nada = heredarTiempos("Canta la noche", []);
    assert.ok(nada.every((p) => p.supuesta && Number.isNaN(p.a) && Number.isNaN(p.b)));
  });

  test("lo que no son palabras («♪») no presta su tiempo ni ocupa notas", () => {
    const conMusica = [{ texto: " ♪", a: 0, b: 9 }, ...oidas.slice(0, 3), { texto: " ♪", a: 2.5, b: 2.9 }];
    assert.deepEqual(heredarTiempos("Canta la noche", conMusica), heredarTiempos("Canta la noche", oidas.slice(0, 3)));
    const notas = notasEn([0, 0.5, 1.0, 1.5, 2.0], 0.45);
    assert.deepEqual(casarLetra(notas, conMusica).porNota, ["Can-", "ta", "la", "no-", "che"]);
  });

  test("con el texto corregido, la letra cae en su sitio", () => {
    const notas = notasEn([0, 0.5, 1.0, 1.5, 2.0, 3.0, 3.5, 4.5, 5.0, 5.5, 6.0, 6.5], 0.45);
    const r = casarLetra(notas, heredarTiempos("Canta la luna\nsobre agua tan clara", oidas));
    assert.deepEqual(r.porNota, ["Can-", "ta", "la", "lu-", "na", "so-", "bre", "a-", "gua", "tan", "cla-", "ra"]);
    assert.deepEqual(r.descartadas, []);
  });
});

// ───────────── Canciones de coro, nota a nota, con lo que debería salir en cada nota ─────────────

/**
 * Una canción descrita nota a nota. Cada trozo, separado por espacios: «só-/1» (nota con esa letra, como en
 * Note.lyric, de 1 pulso), «_/2» (nota que alarga la sílaba anterior), «·/1» (nota sin letra), «R/2» (silencio) y «//»
 * (lo que sigue abre línea). Da las notas, lo que debería ir en cada una, el texto y las palabras con su tiempo
 * verdadero (lo que oiría un Whisper perfecto: desde que empieza su primera nota —un poco después si va en sinalefa—
 * hasta que acaba la última, melisma incluido).
 */
function partitura(spec, { pulso = 0.5, t0 = 1, legato = 0.92 } = {}) {
  const notas = [];
  const verdad = [];
  const palabras = [];
  let actual = null;
  let abre = true;
  let t = t0;
  for (const trozo of spec.trim().split(/\s+/)) {
    if (trozo === "//") { abre = true; continue; }
    const [, letra, pulsos] = /^(.*)\/([\d.]+)$/.exec(trozo);
    const dur = Number(pulsos) * pulso;
    if (letra === "R") { t += dur; continue; }
    const q = notas.length;
    notas.push({ ini: +t.toFixed(4), fin: +(t + dur * legato).toFixed(4) });
    t += dur;
    if (letra === "_" || letra === "·") {
      verdad.push(undefined);
      if (letra === "_") (actual ?? palabras[palabras.length - 1]).notaFin = q;
      continue;
    }
    verdad.push(letra);
    letra.split("‿").forEach((parte, k, partes) => {
      const sigue = parte.endsWith("-");
      const limpia = sigue ? parte.slice(0, -1) : parte;
      if (actual) {
        actual.texto += limpia;
        actual.notaFin = q;
      } else {
        actual = { texto: limpia, abreLinea: abre, notaIni: q, notaFin: q, enSinalefa: k > 0 };
        abre = false;
      }
      if (!sigue || k < partes.length - 1) {
        palabras.push(actual);
        actual = null;
      }
    });
  }
  if (actual) palabras.push(actual);
  const conTiempo = palabras.map((p) => {
    const n = notas[p.notaIni];
    return { texto: p.texto, a: n.ini + (p.enSinalefa ? 0.3 * (n.fin - n.ini) : 0), b: notas[p.notaFin].fin, abreLinea: p.abreLinea };
  });
  const texto = palabras.map((p, k) => (k === 0 ? "" : p.abreLinea ? "\n" : " ") + p.texto).join("");
  return { notas, verdad, palabras: conTiempo, texto };
}

/** Las notas en las que lo que sale no es lo que debería. */
const notasMal = (r, verdad) => r.porNota.flatMap((x, q) => (x === verdad[q] ? [] : [q]));
/** Sin tiempos: el texto con sus líneas. */
const sinTiempo = (texto) => palabrasDeTexto(texto).map((p) => ({ ...p, a: NaN, b: NaN }));
/** Todo lo oído, `d` segundos más tarde (o antes, si es negativo). */
const desplazar = (palabras, d) => palabras.map((p) => ({ ...p, a: p.a + d, b: p.b + d }));
/** Para leer un fallo: lo que sale y lo que debería, nota a nota. */
const mostrar = (r, verdad) => `\n  sale    ${r.porNota.map((x) => x ?? "·").join(" ")}\n  debería ${verdad.map((x) => x ?? "·").join(" ")}`;
const bien = (r, c, verdad = c.verdad) => assert.deepEqual(notasMal(r, verdad), [], mostrar(r, verdad));

// Villancicos y canciones populares de letra tradicional (de dominio público), con un ritmo aproximado. El resto de
// la letra de las pruebas es inventada.
const PECES = `
// La/1 Vir-/1 gen/1 se‿es-/1 tá/1 pei-/1 nan-/1 do/3 R/1
// en-/1 tre/1 cor-/1 ti-/1 na‿y/1 cor-/1 ti-/1 na/3 R/1
// los/1 ca-/1 be-/1 llos/1 son/1 de/1 o-/1 ro/3 R/1
// y‿el/1 pei-/1 ne/1 de/1 pla-/1 ta/1 fi-/1 na/3 R/2
// Pe-/1 ro/1 mi-/1 ra/1 có-/1 mo/1 be-/1 ben/1 los/1 pe-/1 ces/1 en/1 el/1 rí-/1 o/3 R/1
// pe-/1 ro/1 mi-/1 ra/1 có-/1 mo/1 be-/1 ben/1 por/1 ver/1 a/1 Dios/1 na-/1 ci-/1 do/3 R/1
// Be-/0.5 ben/0.5 y/0.5 be-/0.5 ben/0.5 y/0.5 vuel-/0.5 ven/0.5 a/0.5 be-/0.5 ber/2 R/1
// los/1 pe-/1 ces/1 en/1 el/1 rí-/1 o/1 por/1 ver/1 a/1 Dios/1 na-/1 cer/4`;
const CAMPANA = `
// Cam-/1 pa-/1 na/1 so-/1 bre/1 cam-/1 pa-/1 na,/2 R/2
// y/1 so-/1 bre/1 cam-/1 pa-/1 na/1 u-/1 na,/2 R/2
// a-/1 só-/1 ma-/1 te‿a/1 la/1 ven-/1 ta-/1 na,/2 R/2
// ve-/1 rás/1 al/1 Ni-/1 ño‿en/1 la/1 cu-/1 na./2 R/2
// Be-/1 lén,/3 cam-/1 pa-/1 nas/1 de/1 Be-/1 lén,/3 R/1
// que/1 los/1 án-/1 ge-/1 les/1 to-/1 can,/3 R/1
// ¿qué/1 nue-/1 vas/1 me/1 tra-/1 éis?/2 _/2 R/2`;
const ENCINA = `
// Hoy/1 co-/1 ma-/1 mos/1 y/1 be-/1 ba-/1 mos/2 _/1 R/1
// y/1 can-/1 te-/1 mos/1 y/1 hol-/1 gue-/1 mos,/2 _/1 R/1
// que/1 ma-/1 ña-/1 na‿a-/1 yu-/1 na-/1 re-/1 mos./3 R/2`;
const NOCHE = `
// No-/1.5 che/0.5 de/1 paz,/3 no-/1.5 che/0.5 de‿a-/1 mor,/3 R/1
// to-/2 do/1 duer-/3 me‿en/2 de-/1 rre-/1 dor./2 _/1 R/1
// En-/1.5 tre/0.5 los/1 as-/1.5 tros/0.5 que‿es-/1 par-/1.5 cen/0.5 su/1 luz,/3 R/1
// be-/1.5 lla‿a-/0.5 nun-/1 cian-/1.5 do‿al/0.5 ni-/1 ñi-/1.5 to/0.5 Je-/1 sús,/3 R/1
// bri-/2 lla/1 la‿es-/2 tre-/1 lla/1 de/1 paz,/4 _/2 R/2
// bri-/2 lla/1 la‿es-/2 tre-/1 lla/1 de/1 paz./4 _/2`;
const GLORIA = `
// Glo-/0.5 ${"_/0.5 ".repeat(15)} ria‿a/1 Dios/1 en/1 las/1 al-/1 tu-/1 ras./3 R/2
// Glo-/0.5 ${"_/0.5 ".repeat(15)} ria‿a/1 Dios/1 en/1 las/1 al-/1 tu-/1 ras./3`;
const INTRO = `
·/1 ·/1 ·/1 ·/2 R/2
// Can-/1 ta/1 la/1 no-/1 che/1 so-/1 bre‿el/1 a-/1 gua/3 R/1
// cla-/1 ra/1 y/1 el/1 vien-/1 to/1 lle-/1 va/3 R/1
// tu/1 can-/1 ción/1 al/1 mar./4`;
const ESTRIBILLO = `
// Be-/0.5 ben/0.5 y/0.5 be-/0.5 ben/0.5 y/0.5 vuel-/0.5 ven/0.5 a/0.5 be-/0.5 ber/2 R/1
// los/1 pe-/1 ces/1 en/1 el/1 rí-/1 o/1 por/1 ver/1 a/1 Dios/1 na-/1 cer/4 R/2
// Be-/0.5 ben/0.5 y/0.5 be-/0.5 ben/0.5 y/0.5 vuel-/0.5 ven/0.5 a/0.5 be-/0.5 ber/2 R/1
// los/1 pe-/1 ces/1 en/1 el/1 rí-/1 o/1 por/1 ver/1 a/1 Dios/1 na-/1 cer/4`;
const ALELUYAS = "// A-/1 le-/1 lu-/1 ya,/2 R/1 a-/1 le-/1 lu-/1 ya,/2 R/1 a-/1 le-/1 lu-/1 ya,/2 R/1 a-/1 le-/1 lu-/1 ya./3";

describe("canciones de coro con tiempos exactos", () => {
  test("todas, nota a nota, con lo que oiría un Whisper perfecto, tal cual y a través de heredarTiempos", () => {
    for (const spec of [PECES, CAMPANA, ENCINA, NOCHE, GLORIA, INTRO]) {
      const c = partitura(spec);
      bien(casarLetra(c.notas, c.palabras), c);
      bien(casarLetra(c.notas, heredarTiempos(c.texto, c.palabras)), c);
    }
  });
});

describe("melismas dentro de la palabra, con tiempos exactos", () => {
  // Whisper solo da el comienzo y el final de cada palabra: dónde va el melisma dentro de ella lo dicen la música (la
  // última sílaba de una frase y la tónica se alargan; un melisma largo es más normal que dos cortos) y la sinalefa.
  test("«Aleluya» con «lu» en tres notas", () => {
    const notas = [0, 0.5, 1, 1.25, 1.5, 2].map((ini, q) => ({ ini, fin: [0.46, 0.96, 1.23, 1.48, 1.96, 2.92][q] }));
    const r = casarLetra(notas, [{ texto: "Aleluya", a: 0, b: 2.92, abreLinea: true }]);
    assert.deepEqual(r.porNota, ["A-", "le-", "lu-", undefined, undefined, "ya"]);
  });

  test("la última sílaba de la frase en una nota larga y una de melisma: «caminante», «bebamos», «derredor»", () => {
    for (const spec of [
      "// Ven/1 a/1 mi/1 la-/1 do/1 ca-/1 mi-/1 nan-/1 te/2 _/1",
      "// Ven/1 a/1 mi/1 la-/1 do/1 ca-/1 mi-/1 nan-/1 te/2 _/1 R/2 // por/1 el/1 sen-/1 de-/1 ro/3",
      ENCINA,
      NOCHE,
    ]) {
      const c = partitura(spec, { t0: 0 });
      bien(casarLetra(c.notas, c.palabras), c);
    }
  });

  test("melisma en medio de la palabra y antes de una sinalefa: «co-ra-zón», «Glo-ria‿a Dios»", () => {
    for (const spec of [
      "// Mi/1 co-/1 ra-/0.5 _/0.5 _/0.5 _/0.5 zón/2 can-/1 ta/1 por/1 ti/3",
      "// Glo-/0.5 _/0.5 _/0.5 _/0.5 ria‿a/1 Dios/1 en/1 las/1 al-/1 tu-/1 ras/3",
      "// A-/1 le-/1 lu-/0.5 _/0.5 _/0.5 _/0.5 _/0.5 _/0.5 ya,/2 R/1 // a-/1 le-/1 lu-/1 ya/3",
    ]) {
      const c = partitura(spec, { t0: 0 });
      bien(casarLetra(c.notas, c.palabras), c);
    }
  });

  test("un melisma largo: «Glo» en 16 notas y «ria‿in» en la siguiente", () => {
    const c = partitura(`// Glo-/0.5 ${"_/0.5 ".repeat(15)} ria‿in/1 ex-/1 cel-/1 sis/1 De-/1 o/3`, { t0: 0 });
    const r = casarLetra(c.notas, c.palabras);
    assert.equal(r.porNota[0], "Glo-");
    assert.deepEqual(r.porNota.slice(1, 16), new Array(15).fill(undefined));
    assert.equal(r.porNota[16], "ria‿in");
    bien(r, c);
  });

  test("si la persona marca el melisma con «_», se respeta (con tiempos y sin ellos)", () => {
    const c = partitura("// A-/1 le-/1 lu-/0.5 _/0.5 _/1 ya/2", { t0: 0 });
    for (const texto of ["A-le-lu-_-_-ya", "A-le-lu__-ya"]) {
      bien(casarLetra(c.notas, heredarTiempos(texto, c.palabras)), c);
      bien(casarLetra(c.notas, sinTiempo(texto)), c);
    }
    // y manda sobre lo que se esperaría sin la marca: aquí, el melisma en «le»
    const r = casarLetra(c.notas, heredarTiempos("A-le-_-_-lu-ya", c.palabras));
    assert.deepEqual(r.porNota, ["A-", "le-", undefined, undefined, "lu-", "ya"]);
  });
});

describe("Whisper lo oye todo igual de tarde o de pronto", () => {
  test("desfase en bloque de 0,3 a 1 s, sin más ruido: lo mismo que sin desfase", () => {
    for (const [spec, pulso] of [[PECES, 0.5], [PECES, 0.4], [NOCHE, 0.5], [CAMPANA, 0.4], [CAMPANA, 0.5], [ENCINA, 0.5]]) {
      const c = partitura(spec, { pulso });
      for (const d of [-1, -0.75, -0.5, -0.3, 0.3, 0.5, 0.75, 1]) bien(casarLetra(c.notas, heredarTiempos(c.texto, desplazar(c.palabras, d))), c);
    }
  });

  test("«Hoy comamos» 0,3 s tarde: mide el desfase verdadero", () => {
    const c = partitura(ENCINA);
    const r = casarLetra(c.notas, heredarTiempos(c.texto, desplazar(c.palabras, 0.3)));
    bien(r, c);
    assert.ok(Math.abs(r.medidas.desfaseConsonante + 0.3) < 0.05, `desfase ${r.medidas.desfaseConsonante}`);
  });

  test("dos tomas: Whisper escucha cada trozo por separado y la segunda le sale desplazada", () => {
    const c = partitura(`${CAMPANA} R/60 ${CAMPANA}`);
    const n = c.palabras.length / 2;
    for (const d of [0.3, 0.5, -0.5, 1]) {
      bien(casarLetra(c.notas, heredarTiempos(c.texto, c.palabras.map((p, i) => (i >= n ? { ...p, a: p.a + d, b: p.b + d } : p)))), c);
    }
  });
});

describe("heredarTiempos con letra repetida", () => {
  const aleluyas = partitura(ALELUYAS, { t0: 0 });
  const estribillo = partitura(ESTRIBILLO);
  const mitad = estribillo.palabras.length / 2;
  const tomas = partitura(`${CAMPANA} R/60 ${CAMPANA}`);
  const unaToma = tomas.palabras.length / 2;

  test("«Aleluya» cuatro veces y Whisper se salta la 2.ª, la 3.ª o la 4.ª: cada una en su sitio", () => {
    for (const k of [1, 2, 3]) bien(casarLetra(aleluyas.notas, heredarTiempos(aleluyas.texto, aleluyas.palabras.filter((_, i) => i !== k))), aleluyas);
    // la que no oyó, supuesta en su hueco
    const h = heredarTiempos(aleluyas.texto, aleluyas.palabras.filter((_, i) => i !== 1));
    assert.deepEqual(h.map((p) => !!p.supuesta), [false, true, false, false]);
    assert.ok(h[1].a >= h[0].b && h[1].b <= h[2].a);
  });

  test("estribillo escrito dos veces, Whisper solo oye la primera, o lo «oye» tres veces", () => {
    bien(casarLetra(estribillo.notas, heredarTiempos(estribillo.texto, estribillo.palabras.slice(0, mitad))), estribillo);
    const tresVeces = [...estribillo.palabras, ...desplazar(estribillo.palabras.slice(mitad), 9)];
    bien(casarLetra(estribillo.notas, heredarTiempos(estribillo.texto, tresVeces)), estribillo);
  });

  test("dos tomas con la letra escrita dos veces y Whisper solo oye la primera; o la letra escrita una vez", () => {
    bien(casarLetra(tomas.notas, heredarTiempos(tomas.texto, tomas.palabras.slice(0, unaToma))), tomas);
    const una = partitura(CAMPANA);
    const r = casarLetra(tomas.notas, heredarTiempos(una.texto, tomas.palabras));
    bien(r, tomas, tomas.verdad.map((x, q) => (q < una.notas.length ? x : undefined)));
  });

  test("con las notas, también cuando Whisper se salta la primera vuelta (sin ellas no se distingue de una introducción)", () => {
    for (const k of [0, 1, 2, 3]) {
      const oidas = aleluyas.palabras.filter((_, i) => i !== k);
      bien(casarLetra(aleluyas.notas, heredarTiempos(aleluyas.texto, oidas, aleluyas.notas)), aleluyas);
    }
    bien(casarLetra(estribillo.notas, heredarTiempos(estribillo.texto, estribillo.palabras.slice(mitad), estribillo.notas)), estribillo);
    bien(casarLetra(tomas.notas, heredarTiempos(tomas.texto, tomas.palabras.slice(unaToma), tomas.notas)), tomas);
  });
});

describe("frases que Whisper no oyó y la persona escribe", () => {
  test("«Los peces en el río» sin una línea: la línea en sus notas, tal como se canta", () => {
    const c = partitura(PECES);
    const inicios = c.palabras.flatMap((p, i) => (p.abreLinea ? [i] : []));
    for (const l of [0, 1, 3, 4, 5, 6, 7]) {
      const desde = inicios[l];
      const hasta = inicios[l + 1] ?? c.palabras.length;
      bien(casarLetra(c.notas, heredarTiempos(c.texto, c.palabras.filter((_, i) => i < desde || i >= hasta))), c);
    }
  });

  test("«Campana sobre campana» sin «asómate a la ventana,», y una introducción con la primera línea perdida", () => {
    const c = partitura(CAMPANA);
    bien(casarLetra(c.notas, heredarTiempos(c.texto, [...c.palabras.slice(0, 7), ...c.palabras.slice(11)])), c);
    const i = partitura(INTRO);
    const segunda = i.palabras.findIndex((p, k) => k > 0 && p.abreLinea);
    bien(casarLetra(i.notas, heredarTiempos(i.texto, i.palabras.slice(segunda))), i);
  });
});

describe("heredarTiempos cuando lo oído no se parece a lo corregido", () => {
  test("«con vidar demi»: Whisper parte y junta palabras", () => {
    const c = partitura("// A-/1 só-/1 ma-/1 te‿a/1 la/1 ca-/1 lle,/2 R/1 // por/1 fa-/1 vor/2 R/1 // os/1 quie-/1 ro/1 con-/1 vi-/1 dar/1 de/1 mi‿o-/1 sa-/1 dí-/1 a/3");
    const P = c.palabras;
    const oidas = [...P.slice(0, 8), { texto: "con", a: P[8].a, b: P[8].a + 0.45 }, { texto: "vidar", a: P[8].a + 0.5, b: P[8].b },
      { texto: "demi", a: P[9].a, b: P[10].b }, ...P.slice(11)];
    const h = heredarTiempos(c.texto, oidas);
    assert.equal(h[9].texto, "de");
    assert.ok(!h[9].supuesta && Math.abs(h[9].a - P[9].a) < 0.01, `«de» en ${h[9].a}`);
    bien(casarLetra(c.notas, h), c);
  });

  test("las sílabas mal agrupadas («Campa nasobre campa na isobre campanau na»): «na, y so- bre»", () => {
    const c = partitura(CAMPANA);
    const grupo = (texto, q0, q1) => ({ texto, a: c.notas[q0].ini, b: c.notas[q1].fin });
    const oidas = [grupo("Campa", 0, 1), grupo("nasobre", 2, 4), grupo("campa", 5, 6), grupo("na", 7, 7), grupo("isobre", 8, 10),
      grupo("campanau", 11, 14), grupo("na", 15, 15), ...c.palabras.slice(7)];
    const r = casarLetra(c.notas, heredarTiempos(c.texto, oidas));
    assert.deepEqual(r.porNota.slice(0, 11), c.verdad.slice(0, 11), mostrar(r, c.verdad));
    assert.deepEqual(r.descartadas, []);
  });

  test("la primera estrofa oída como «la la la…» y escrita bien: en su sitio, como sin tiempos", () => {
    const c = partitura(CAMPANA);
    const P = c.palabras;
    const lalala = [];
    for (let t = P[0].a; t < P[17].b; t += 0.5) lalala.push({ texto: "la", a: t, b: t + 0.4 });
    const h = heredarTiempos(c.texto, [...lalala, ...P.slice(17)]);
    assert.ok(h.slice(0, 17).every((p) => p.supuesta), "ninguna palabra de la estrofa se fía de una «la» suelta");
    bien(casarLetra(c.notas, h), c);
  });
});

describe("una sola palabra con el tiempo mal y lo demás exacto", () => {
  test("«y» oída 1 s tarde o pronto, «entre» 1,2 s tarde, «mira» 1 s tarde: en su nota, que está libre", () => {
    const c = partitura(PECES);
    const k = (texto) => c.palabras.findIndex((p) => p.texto === texto);
    const segundaY = k("Beben") + 3; // «Beben y beben y vuelven…»
    assert.equal(c.palabras[segundaY].texto, "y");
    for (const [w, d] of [[segundaY, 1], [segundaY, -1], [k("entre"), 1.2], [k("mira"), 1]]) {
      assert.ok(w >= 0);
      const oidas = c.palabras.map((p, i) => (i === w ? { ...p, a: p.a + d, b: p.b + d } : p));
      const r = casarLetra(c.notas, heredarTiempos(c.texto, oidas));
      bien(r, c);
      assert.deepEqual(r.descartadas, []);
    }
  });
});

describe("sin tiempos, con frases sin letra", () => {
  test("un «uh» de cuatro notas antes de la primera línea: cada línea en su frase", () => {
    const c = partitura(INTRO);
    bien(casarLetra(c.notas, sinTiempo(c.texto)), c);
  });

  test("«Amén» después de dos frases sin letra: en las dos últimas notas", () => {
    const c = partitura("·/1 ·/1 ·/1 ·/2 R/1 ·/1 ·/1 ·/2 R/1 // A-/2 mén/4");
    const r = casarLetra(c.notas, sinTiempo(c.texto));
    assert.deepEqual(r.porNota, [...new Array(7).fill(undefined), "A-", "mén"]);
  });

  test("y las canciones que no tienen frases sin letra, igual que antes", () => {
    for (const spec of [PECES, CAMPANA, ENCINA]) {
      const c = partitura(spec);
      bien(casarLetra(c.notas, sinTiempo(c.texto)), c);
    }
  });
});

// ───────────── Fallos de la revisión: lo que sobra, los finales, las líneas y los guiones ─────────────

// «Canta la noche sobre mar / ven a mi lado ya» (letra inventada): 14 notas en dos frases y lo oído exacto.
const NOTAS_MAR = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 4.0, 4.4, 4.8, 5.2, 5.6, 6.0], 0.37);
const OIDAS_MAR = [["Canta", 0, 0.77], ["la", 0.8, 1.17], ["noche", 1.2, 1.97], ["sobre", 2.0, 2.77], ["mar", 2.8, 3.17],
  ["ven", 4.0, 4.37], ["a", 4.4, 4.77], ["mi", 4.8, 5.17], ["lado", 5.2, 5.97], ["ya", 6.0, 6.37]].map(([texto, a, b]) => ({ texto, a, b }));
const LETRA_MAR = "Canta la noche sobre mar\nven a mi lado ya";
const MAR = ["Can-", "ta", "la", "no-", "che", "so-", "bre", "mar", "ven", "a", "mi", "la-", "do", "ya"];
/** Lo oído, `d` segundos más tarde. */
const tras = (oidas, d) => oidas.map((p) => ({ ...p, a: p.a + d, b: p.b + d }));
const oir = (lista) => lista.map(([texto, a, b]) => ({ texto, a, b }));

describe("lo que sobra en la letra de la persona se descarta: no se mete a presión", () => {
  test("una cabecera, un título o una línea de más, delante o detrás: las mismas notas, y lo de más en descartadas", () => {
    assert.deepEqual(casarLetra(NOTAS_MAR, heredarTiempos(LETRA_MAR, OIDAS_MAR, NOTAS_MAR)).porNota, MAR);
    for (const [texto, sobra] of [
      [`[Estribillo]\n${LETRA_MAR}`, ["[Estribillo]"]],
      [`Coro:\n${LETRA_MAR}`, ["Coro:"]],
      [`vuela la paloma blanca\n${LETRA_MAR}`, ["vuela", "la", "paloma", "blanca"]],
      [`${LETRA_MAR}\ny canta conmigo la canción`, ["y", "canta", "conmigo", "la", "canción"]],
    ]) {
      const r = casarLetra(NOTAS_MAR, heredarTiempos(texto, OIDAS_MAR, NOTAS_MAR));
      assert.deepEqual(r.porNota, MAR, `${texto}${mostrar(r, MAR)}`);
      assert.deepEqual(r.descartadas, sobra, texto);
    }
  });

  test("con menos notas que sílabas, lo mismo que con lo oído tal cual: no caben «che» ni «clara»", () => {
    const notas = notasEn([0, 0.5, 1.0, 1.5], 0.45);
    const oidas = [{ texto: "Canta", a: 0, b: 0.9, abreLinea: true }, ...oir([["la", 1.0, 1.4], ["noche", 1.5, 2.4], ["clara", 2.5, 3.4]])];
    for (const r of [casarLetra(notas, oidas), casarLetra(notas, heredarTiempos("Canta la noche clara", oidas, notas))]) {
      assert.deepEqual(r.porNota, ["Can-", "ta", "la", "no"]);
      assert.deepEqual(r.descartadas, ["che", "clara"]);
    }
  });

  test("lo que canta otra voz mientras esta calla, y lo que se inventa Whisper tras la última nota, no le quita sitio", () => {
    // la melodía calla 1,8 s y otra voz canta «y canta conmigo», que Whisper oye
    const corto = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0], 0.37);
    const oidasCorto = [...OIDAS_MAR.slice(0, 5), ...oir([["y", 3.4, 3.6], ["canta", 3.6, 4.1], ["conmigo", 4.1, 4.8]]), ...tras(OIDAS_MAR.slice(5), 1)];
    let r = casarLetra(corto, heredarTiempos("Canta la noche sobre mar\ny canta conmigo\nven a mi lado ya", oidasCorto, corto));
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["y", "canta", "conmigo"]);
    // un silencio de 6 s con una línea llena de sinalefas («y‿en», «ba‿u», «na‿o»)
    const largo = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 9.0, 9.4, 9.8, 10.2, 10.6, 11.0], 0.37);
    const oidasLargo = [...OIDAS_MAR.slice(0, 5), ...oir([["y", 4.5, 4.7], ["en", 4.7, 4.9], ["el", 4.9, 5.1], ["alba", 5.1, 5.9], ["una", 6.0, 6.6],
      ["ola", 6.6, 7.4]]), ...tras(OIDAS_MAR.slice(5), 5)];
    r = casarLetra(largo, heredarTiempos("Canta la noche sobre mar\ny en el alba una ola\nven a mi lado ya", oidasLargo, largo));
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["y", "en", "el", "alba", "una", "ola"]);
    // lo que queda de «Subtítulos realizados por…» si la persona no lo borra
    const conRestos = [...OIDAS_MAR, ...oir([["realizados", 7.9, 8.2], ["por", 8.25, 8.55], ["la", 8.6, 8.9], ["comunidad", 8.95, 9.25], ["de", 9.3, 9.6]])];
    r = casarLetra(NOTAS_MAR, heredarTiempos(`${LETRA_MAR}\nrealizados por la comunidad de`, conRestos, NOTAS_MAR));
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["realizados", "por", "la", "comunidad", "de"]);
  });

  test("una cabecera o una línea de más entre dos cantadas no corre la frase siguiente, aunque su última nota se alargue", () => {
    // «ya» se alarga a una nota más: la frase tiene sitio para una sílaba de más, pero «Coro:» no se canta
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 8.0, 8.4, 8.8, 9.2, 9.6], 0.37);
    const oidas = [...OIDAS_MAR.slice(0, 9), ...oir([["ya", 6.0, 6.77], ["dime", 8.0, 8.77], ["que", 8.8, 9.17], ["vendrás", 9.2, 9.97]])];
    const esperado = [...MAR, undefined, "di-", "me", "que", "ven-", "drás"];
    for (const extra of ["Coro:", "[Estribillo]", "vuela la paloma blanca"]) {
      const r = casarLetra(notas, heredarTiempos(`Canta la noche sobre mar\n${extra}\nven a mi lado ya\ndime que vendrás`, oidas, notas));
      assert.deepEqual(r.porNota, esperado, `${extra}${mostrar(r, esperado)}`);
      assert.deepEqual(r.descartadas, palabrasDeTexto(extra).map((p) => p.texto), extra);
    }
  });

  test("una línea de otra voz en un silencio corto no se lleva una palabra oída en su nota; ni los restos justo tras la última", () => {
    // la melodía calla 1,2 s y otra voz canta «a ella»: dos sílabas en sinalefa no valen más que «mar», oída en su nota
    const f2 = 2.8 + 0.37 + 1.2;
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, ...[0, 0.4, 0.8, 1.2, 1.6, 2.0].map((d) => f2 + d)]);
    const oidas = [...OIDAS_MAR.slice(0, 5), ...oir([["a", 3.27, 3.75], ["ella", 3.77, 4.25]]), ...tras(OIDAS_MAR.slice(5), f2 - 4.0)];
    let r = casarLetra(notas, heredarTiempos("Canta la noche sobre mar\na ella\nven a mi lado ya", oidas, notas));
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["a", "ella"]);
    // lo que se inventa Whisper empieza 0,3 s tras la última nota: «ya» se queda en la suya
    const restos = (texto, desde) => texto.split(" ").map((p, k) => ({ texto: p, a: desde + 0.3 * k, b: desde + 0.3 * k + 0.25 }));
    r = casarLetra(NOTAS_MAR, heredarTiempos(`${LETRA_MAR}\nrealizados por la comunidad de`, [...OIDAS_MAR, ...restos("realizados por la comunidad de", 6.67)], NOTAS_MAR));
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["realizados", "por", "la", "comunidad", "de"]);
    // y a 0,1 s, lleno de vocales: lo más que hace es pegarse a «ya» por sinalefa, sin quitar «do» ni «ya»
    r = casarLetra(NOTAS_MAR, heredarTiempos(`${LETRA_MAR}\ny ahora a otra cosa`, [...OIDAS_MAR, ...restos("y ahora a otra cosa", 6.47)], NOTAS_MAR));
    assert.deepEqual(r.porNota.slice(0, 13), MAR.slice(0, 13), mostrar(r, MAR));
    assert.match(r.porNota[13], /^ya(‿|$)/u, mostrar(r, MAR));
    assert.ok(r.silabas.every((s) => s.nota >= 0 || s.palabra >= 10), JSON.stringify(r.descartadas));
  });

  test("una línea corta de verdad oída un poco tarde o pronto, en el silencio de al lado, no se tira («mar», «¡Ay!»)", () => {
    // «Ella canta / y la noche / mar»: todo exacto salvo la última palabra, sola en su línea, oída tras su nota
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.97, 2.37, 2.77, 3.17], 0.37);
    const esperado = ["E-", "lla", "can-", "ta‿y", "la", "no-", "che", "mar"];
    for (const tarde of [0.3, 0.5]) {
      const oidas = oir([["Ella", 0, 0.77], ["canta", 0.8, 1.4], ["y", 1.4, 1.57], ["la", 1.97, 2.34], ["noche", 2.37, 3.14], ["mar", 3.17 + tarde, 3.54 + tarde]]);
      const r = casarLetra(notas, heredarTiempos("Ella canta\ny la noche\nmar", oidas, notas));
      assert.deepEqual(r.porNota, esperado, `«mar» ${tarde} s tarde${mostrar(r, esperado)}`);
      assert.deepEqual(r.descartadas, []);
    }
    // dos «¡Ay!» de una nota entre frases, con silencios de 0,8 s: lo demás se oye 0,6 s pronto, y cada «¡Ay!», 0,5 s tarde
    const frase = (palabras, t0) => {
      const ini = [];
      const oidas = [];
      let t = t0;
      for (const [p, silabas] of palabras) {
        const a = t;
        for (let s = 0; s < silabas; s++, t += 0.4) ini.push(t);
        oidas.push([p, a - 0.6, t - 0.03 - 0.6]);
      }
      return { ini, oidas, fin: t };
    };
    const f1 = frase([["Canta", 2], ["la", 1], ["noche", 2], ["sobre", 2], ["el", 1], ["mar", 1]], 0);
    const ay1 = f1.fin + 0.8;
    const f2 = frase([["ven", 1], ["a", 1], ["mi", 1], ["lado", 2], ["que", 1], ["ya", 1], ["es", 1], ["tarde", 2]], ay1 + 0.45 + 0.8);
    const ay2 = f2.fin + 0.8;
    const f3 = frase([["dime", 2], ["que", 1], ["vendrás", 2]], ay2 + 0.45 + 0.8);
    const notasAy = [...notasEn(f1.ini, 0.37), { ini: ay1, fin: ay1 + 0.45 }, ...notasEn(f2.ini, 0.37), { ini: ay2, fin: ay2 + 0.45 }, ...notasEn(f3.ini, 0.37)];
    const oidasAy = oir([...f1.oidas, ["¡Ay!", ay1 + 0.5, ay1 + 0.95], ...f2.oidas, ["¡Ay!", ay2 + 0.5, ay2 + 0.95], ...f3.oidas]);
    const esperadoAy = ["Can-", "ta", "la", "no-", "che", "so-", "bre", "el", "mar", "¡Ay!", "ven", "a", "mi", "la-", "do", "que", "ya", "es", "tar-", "de",
      "¡Ay!", "di-", "me", "que", "ven-", "drás"];
    const textoAy = "Canta la noche sobre el mar\n¡Ay!\nven a mi lado que ya es tarde\n¡Ay!\ndime que vendrás";
    const r = casarLetra(notasAy, heredarTiempos(textoAy, oidasAy, notasAy));
    assert.deepEqual(r.porNota, esperadoAy, mostrar(r, esperadoAy));
    assert.deepEqual(r.descartadas, []);
  });

  test("ni una línea oída en el aire entre dos notas picadas: no es un silencio en el que cante otra voz", () => {
    // notas de 0,2 s cada 0,5 s, y «amor» oída muy corta, entre la 3.ª y la 4.ª
    const notas = [0.5, 1, 1.5, 2, 2.5, 3].map((t) => ({ ini: t, fin: t + 0.2 }));
    const oidas = oir([["cielo", 0.2, 1.3], ["amor", 1.8, 2.0], ["vuela", 2.1, 3.2]]);
    const esperado = ["cie-", "lo", "a-", "mor", "vue-", "la"];
    const r = casarLetra(notas, heredarTiempos("cielo\namor\nvuela", oidas, notas));
    assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
    assert.deepEqual(r.descartadas, []);
  });
});

describe("lo que sobra en la letra, en líneas enteras", () => {
  // las palabras del texto que heredan un tiempo oído
  const conTiempo = (h) => h.flatMap((p, i) => (p.supuesta ? [] : [i]));

  test("una línea que no se canta y empieza como la siguiente («y…» / «y…»): la «y» oída es la de la siguiente", () => {
    const f2 = 4.37;
    const f3 = f2 + 3.4;
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, ...[0, 0.4, 0.8, 1.2, 1.6, 2.0].map((d) => f2 + d), ...[0, 0.4, 0.8, 1.2].map((d) => f3 + d)]);
    const oidas = [...OIDAS_MAR.slice(0, 5), ...oir([["y", f2, f2 + 0.37], ["ven", f2 + 0.4, f2 + 0.77], ["a", f2 + 0.8, f2 + 1.17], ["mi", f2 + 1.2, f2 + 1.57],
      ["lado", f2 + 1.6, f2 + 2.37], ["dime", f3, f3 + 0.77], ["que", f3 + 0.8, f3 + 1.17], ["sí", f3 + 1.2, f3 + 1.57]])];
    const texto = "Canta la noche sobre mar\ny vuela la paloma al mar\ny ven a mi lado\ndime que sí";
    const h = heredarTiempos(texto, oidas, notas);
    assert.deepEqual(conTiempo(h), [0, 1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18]);
    const esperado = ["Can-", "ta", "la", "no-", "che", "so-", "bre", "mar", "y", "ven", "a", "mi", "la-", "do", "di-", "me", "que", "sí"];
    const r = casarLetra(notas, h);
    assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
    assert.deepEqual(r.descartadas, ["y", "vuela", "la", "paloma", "al", "mar"]);
  });

  test("media primera línea delante, como un título: los tiempos, para la línea entera", () => {
    const h = heredarTiempos(`Canta la noche\n${LETRA_MAR}`, OIDAS_MAR, NOTAS_MAR);
    assert.deepEqual(conTiempo(h), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const r = casarLetra(NOTAS_MAR, h);
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.dudosas, new Array(14).fill(false));
    assert.deepEqual(r.descartadas, ["Canta", "la", "noche"]);
  });

  test("una línea escrita dos veces y cantada una, oída a trozos: se empareja con una sola, y la otra sobra", () => {
    // Whisper no oye «noche»: «Canta la» puede ir con la primera y «sobre mar» con la segunda
    const oidas = OIDAS_MAR.filter((p) => p.texto !== "noche");
    const h = heredarTiempos(`Canta la noche sobre mar\n${LETRA_MAR}`, oidas, NOTAS_MAR);
    assert.deepEqual(conTiempo(h), [0, 1, 3, 4, 10, 11, 12, 13, 14]);
    const r = casarLetra(NOTAS_MAR, h);
    assert.deepEqual(r.porNota, MAR, mostrar(r, MAR));
    assert.deepEqual(r.descartadas, ["Canta", "la", "noche", "sobre", "mar"]);
  });

  test("una cabecera tras una línea cuya última palabra no oyó Whisper también sobra, y no corre la frase", () => {
    const oidas = OIDAS_MAR.filter((p) => p.texto !== "mar");
    for (const extra of ["Coro:", "[Estribillo]", "vuela la paloma blanca"]) {
      const r = casarLetra(NOTAS_MAR, heredarTiempos(`Canta la noche sobre mar\n${extra}\nven a mi lado ya`, oidas, NOTAS_MAR));
      assert.deepEqual(r.porNota, MAR, `${extra}${mostrar(r, MAR)}`);
      assert.deepEqual(r.descartadas, palabrasDeTexto(extra).map((p) => p.texto), extra);
    }
  });

  test("pero no una línea escrita y cantada dos veces, aunque lo que oyó Whisper la primera vez vaya a la segunda copia", () => {
    // Todo se canta. Whisper no oye «sobre mar», oye la primera vez de «ven a mi lado» y, sobre la segunda, palabras que
    // no están en el texto: heredarTiempos le da lo oído a la segunda copia, y la primera queda sin oír y sin sitio
    // delante. Pero cabe en las notas libres de detrás.
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 4.0, 4.4, 4.8, 5.2, 5.6, 7.0, 7.4, 7.8, 8.2, 8.6, 10.0, 10.4, 10.8, 11.2], 0.37);
    const texto = "Canta la noche sobre mar\nven a mi lado\nven a mi lado\ndime que sí";
    const esperado = ["Can-", "ta", "la", "no-", "che", "so-", "bre", "mar", "ven", "a", "mi", "la-", "do", "ven", "a", "mi", "la-", "do", "di-", "me", "que", "sí"];
    const oidas = oir([["Canta", 0, 0.77], ["la", 0.8, 1.17], ["noche", 1.2, 1.97], ["ven", 4.0, 4.37], ["a", 4.4, 4.77], ["mi", 4.8, 5.17], ["lado", 5.2, 5.97],
      ["rumor", 7.0, 7.6], ["cristal", 7.7, 8.3], ["tormenta", 8.35, 8.97], ["dime", 10.0, 10.77], ["que", 10.8, 11.17], ["sí", 11.2, 11.57]]);
    const r = casarLetra(notas, heredarTiempos(texto, oidas, notas));
    assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
    assert.deepEqual(r.descartadas, []);
    // y si llega así a casarLetra: la segunda copia con lo oído de la primera vez, y lo demás supuesto
    const asi = palabrasDeTexto(texto).map((p) => ({ ...p, a: NaN, b: NaN, supuesta: true, segura: true }));
    for (const [i, j] of [[0, 0], [1, 1], [2, 2], [9, 3], [10, 4], [11, 5], [12, 6], [13, 10], [14, 11], [15, 12]]) {
      asi[i] = { ...asi[i], a: oidas[j].a, b: oidas[j].b, supuesta: false };
    }
    const r2 = casarLetra(notas, asi);
    assert.deepEqual(r2.porNota, esperado, mostrar(r2, esperado));
    assert.deepEqual(r2.descartadas, []);
  });

  test("ni una que se canta porque lo que cierra su hueco es un «ancla falsa» (algo que Whisper se inventa y casa con el texto)", () => {
    // Una canción del simulador (letra inventada), en cuatro líneas. Whisper no oye «al», el final de la primera («mi
    // viejo») ni las dos líneas siguientes; pero sobre el final de la segunda se inventa «esperanza», y heredarTiempos la
    // empareja con «espuma casa», el comienzo de la tercera. Medido hasta ahí, la segunda línea no cabe; pero de la
    // tercera casi no se oyó nada, y ese hueco no es de fiar: la segunda se canta y no se tira.
    const notas = [[0.8, 1.45], [1.48, 2.14], [2.17, 3.04], [3.08, 3.3], [3.31, 3.74], [3.77, 3.98], [4, 4.65], [5.59, 6.24], [6.28, 7.15], [7.19, 7.62],
      [7.65, 8.08], [8.1, 8.54], [8.56, 8.99], [9.02, 9.45], [9.47, 10.34], [10.39, 10.82], [10.84, 11.28], [11.3, 11.73], [12.67, 12.89], [12.9, 13.11],
      [13.13, 13.99], [14.04, 14.47], [14.5, 14.71], [14.72, 15.59], [15.64, 16.07], [16.09, 16.53], [16.55, 17.2], [17.33, 17.77], [17.79, 18.22],
      [18.25, 19.11], [19.16, 20.03], [20.07, 20.72], [22.13, 22.78], [22.81, 23.25], [23.37, 23.8], [23.83, 24.69], [24.74, 24.96], [24.97, 25.4],
      [25.52, 25.96], [25.98, 26.2], [26.21, 26.86], [26.89, 27.54], [27.58, 28.45], [28.49, 29.14], [29.18, 29.61], [29.63, 30.28], [30.32, 30.75],
      [30.77, 31.21], [31.23, 31.66]].map(([ini, fin]) => ({ ini, fin }));
    const texto = "al mi una que mi viejo\ne cielo canción e los azul\nespuma casa una caminar remo\nescucho sueño hasta caminar lluvia semilla";
    const oidas = oir([["mi", 1.19, 2.05], ["una", 1.54, 2.87], ["que", 2.7, 3.19], ["fuego", 3.6, 4.45], ["esperanza", 9.3, 11.72],
      ["sueño", 23.69, 25.69], ["hasta", 25.85, 26.69], ["caminar", 26.62, 28.87], ["lluvia", 28.85, 30.07], ["ventana", 30.03, 31.52]]);
    const h = heredarTiempos(texto, oidas, notas);
    assert.deepEqual(conTiempo(h).filter((i) => i >= 6 && i < 17), [12, 13]); // «espuma casa», con el tiempo de «esperanza»
    const r = casarLetra(notas, h);
    assert.deepEqual(r.descartadas, []);
  });

  test("ni cuando lo último que se oyó de la línea de antes queda lejos de lo demás que se oyó de ella", () => {
    // Otra del simulador (letra inventada), en tres líneas. Whisper oye «amigo» donde se canta «verano», no oye «sin vela
    // ahora» ni la línea siguiente, y sobre ella se inventa «invierno», que heredarTiempos empareja con «verano»: más
    // de 7 s después de «tu». Desde ahí, la segunda línea no cabe; pero ese «verano» no es de fiar.
    const notas = [[0.8, 1.41], [1.44, 2.05], [2.08, 2.69], [2.72, 3.33], [3.46, 4.68], [4.75, 5.36], [5.39, 5.69], [5.71, 6.32], [6.35, 7.57], [7.63, 8.24],
      [8.27, 8.88], [8.92, 9.83], [9.88, 11.1], [11.16, 12.07], [12.76, 13.37], [13.4, 14.62], [14.69, 15.6], [15.65, 16.26], [16.29, 16.9], [16.93, 17.23],
      [17.25, 18.47], [18.53, 19.14], [19.17, 19.48], [19.5, 20.71], [20.78, 21.39], [21.42, 22.64], [22.7, 23.31], [23.34, 24.56], [24.62, 24.93],
      [26.87, 28.09], [28.15, 28.76], [28.79, 30.01], [30.08, 30.68], [30.72, 31.33], [31.36, 32.58], [32.64, 33.25], [33.28, 33.89], [33.92, 34.23],
      [34.24, 35.46], [35.53, 36.13], [36.17, 36.78], [36.81, 37.42], [37.45, 37.75], [37.77, 38.07], [38.19, 38.8]].map(([ini, fin]) => ({ ini, fin }));
    const texto = "tarde empieza tu verano sin vela ahora\nesperanza hoy cuando mi orilla aún otra\nvela llego noche triste mi con aún tarde";
    const oidas = oir([["tarde", 0.36, 1.99], ["empieza", 1.86, 4.53], ["tu", 4.39, 5.03], ["amigo", 5.14, 7.24], ["invierno", 12.38, 16.04], ["vela", 26.61, 28.57],
      ["llego", 28.6, 30.49], ["noche", 30.46, 32.35], ["triste", 32.51, 34], ["mi", 34.02, 35.14], ["con", 35.27, 35.97], ["aún", 36.07, 37.38]]);
    const h = heredarTiempos(texto, oidas, notas);
    assert.equal(h[3].a, 12.38); // «verano», con el tiempo de «invierno»
    const r = casarLetra(notas, h);
    assert.deepEqual(r.descartadas, []);
  });

  // «Canta la noche sobre mar / dime con tu voz que vendrás / lejos del mar» (letra inventada): una sílaba en cada nota,
  // en tres frases. En el texto, una línea de más tras la primera, que no se canta.
  const NOTAS_TRES = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 8.4, 8.8, 9.2, 9.6], 0.37);
  const TRES = ["Can-", "ta", "la", "no-", "che", "so-", "bre", "mar", "di-", "me", "con", "tu", "voz", "que", "ven-", "drás", "le-", "jos", "del", "mar"];
  const tresConDeMas = (extra) => `Canta la noche sobre mar\n${extra}\ndime con tu voz que vendrás\nlejos del mar`;

  test("y sí una línea de más tras una línea corta de la que Whisper solo oye el comienzo, aunque tampoco oiga la siguiente", () => {
    // De «Canta la noche sobre mar» (5 palabras) Whisper solo oye «Canta la», y de «dime con tu voz que vendrás», nada.
    // Que la línea se oyera a menos de la mitad no quiere decir que «la» esté mal oída: lo que no se oyó es la cola, que
    // va detrás. La línea de más sigue sobrando y no se mete a presión.
    const oidas = oir([["Canta", 0, 0.77], ["la", 0.8, 1.17], ["lejos", 8.4, 9.17], ["del", 9.2, 9.57], ["mar", 9.6, 9.97]]);
    for (const extra of ["Coro:", "nadie sabe dónde va"]) {
      const r = casarLetra(NOTAS_TRES, heredarTiempos(tresConDeMas(extra), oidas, NOTAS_TRES));
      assert.deepEqual(r.porNota, TRES, `${extra}${mostrar(r, TRES)}`);
      assert.deepEqual(r.descartadas, palabrasDeTexto(extra).map((p) => p.texto), extra);
    }
  });

  test("y también si de la línea de después solo oye la primera palabra, justo donde empieza su frase", () => {
    // De «Canta la noche sobre mar» oye «Canta la noche»; de «dime con tu voz que vendrás», nada; y de «lejos del mar»,
    // solo «lejos». Su línea se oyó a menos de la mitad, pero «lejos» se oye donde empieza una frase, como empieza una
    // línea de verdad: es de fiar para medir el hueco, y la línea de más sobra.
    const oidas = oir([["Canta", 0, 0.77], ["la", 0.8, 1.17], ["noche", 1.2, 1.97], ["lejos", 8.4, 9.17]]);
    for (const extra of ["Coro:", "nadie sabe dónde va"]) {
      const r = casarLetra(NOTAS_TRES, heredarTiempos(tresConDeMas(extra), oidas, NOTAS_TRES));
      assert.deepEqual(r.porNota, TRES, `${extra}${mostrar(r, TRES)}`);
      assert.deepEqual(r.descartadas, palabrasDeTexto(extra).map((p) => p.texto), extra);
    }
  });
});

describe("cuatro sílabas en sinalefa", () => {
  test("«co-mo‿y‿o‿a-mi-go»: caben en una nota, también con la letra de la persona, sin correr la frase", () => {
    const notas = notasEn([0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.5, 7.0, 7.5], 0.45);
    const oidas = oir([["como", 0, 0.95], ["y", 0.6, 0.7], ["o", 0.75, 0.85], ["amigo", 0.9, 1.95], ["se", 2.0, 2.45], ["va", 2.5, 2.95],
      ["lejos", 3.0, 3.95], ["muy", 4.0, 4.45], ["lejos", 4.5, 5.45], ["del", 6.5, 6.95], ["mar", 7.0, 7.95]]);
    const texto = "como y o amigo se va lejos muy lejos\ndel mar";
    const esperado = ["co-", "mo‿y‿o‿a-", "mi-", "go", "se", "va", "le-", "jos", "muy", "le-", "jos", "del", "mar", undefined];
    for (const [nombre, palabras] of [["con el texto", heredarTiempos(texto, oidas, notas)], ["sin tiempos", sinTiempo(texto)]]) {
      const r = casarLetra(notas, palabras);
      assert.deepEqual(r.porNota, esperado, `${nombre}${mostrar(r, esperado)}`);
      assert.deepEqual(r.descartadas, [], nombre);
    }
  });
});

describe("el final oído de una palabra vale para todas sus sílabas", () => {
  test("«hola», oída de 0 a 0,7 s en una frase de 7 notas: «ho- la», no «ho-» alargada y «la» fuera", () => {
    const r = casarLetra(notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 3.2, 3.6, 4.0]), [{ texto: "hola", a: 0, b: 0.7 }]);
    assert.deepEqual(r.porNota.slice(0, 3), ["ho-", "la", undefined]);
    assert.deepEqual(r.descartadas, []);
  });

  test("«Canta la noche» y seis notas que nadie oyó: «no- che» seguidas, con lo oído tal cual y con el texto", () => {
    const inicios = [];
    for (let q = 0; q < 11; q++) inicios.push(0.4 * q);
    for (let q = 0; q < 4; q++) inicios.push(5.4 + 0.4 * q);
    const notas = notasEn(inicios, 0.37);
    const oidas = [{ texto: "Canta", a: 0, b: 0.77, abreLinea: true }, ...oir([["la", 0.8, 1.17], ["noche", 1.2, 1.97]]),
      { texto: "luna", a: 5.4, b: 6.17, abreLinea: true }, { texto: "llena", a: 6.2, b: 6.97 }];
    const esperado = ["Can-", "ta", "la", "no-", "che", ...new Array(6).fill(undefined), "lu-", "na", "lle-", "na"];
    for (const r of [casarLetra(notas, oidas), casarLetra(notas, heredarTiempos("Canta la noche\nluna llena", oidas, notas))]) {
      assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
      assert.deepEqual(r.descartadas, []);
    }
  });
});

describe("heredarTiempos con palabras de más en un extremo", () => {
  test("una línea de más delante o detrás no les quita el tiempo a la primera ni a la última palabra oída", () => {
    for (const texto of [`vuela la paloma blanca\n${LETRA_MAR}`, `${LETRA_MAR}\ny canta conmigo la canción`]) {
      const h = heredarTiempos(texto, OIDAS_MAR, NOTAS_MAR);
      assert.deepEqual(h.filter((p) => !p.supuesta).map((p) => [p.texto, p.a]), OIDAS_MAR.map((p) => [p.texto, p.a]), texto);
    }
  });
});

describe("los saltos de línea de la persona", () => {
  // las mismas palabras, con la segunda frase 0,2 s más tarde
  const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2], 0.37);
  const oidas = [...OIDAS_MAR.slice(0, 5), ...tras(OIDAS_MAR.slice(5), 0.2)];

  test("un salto a media frase no esconde la palabra que abre la línea en la nota de la anterior", () => {
    for (const texto of [LETRA_MAR, "Canta la noche\nsobre mar ven a mi lado ya", "Canta la\nnoche sobre mar\nven a mi lado ya",
      "Canta la noche sobre\nmar ven a mi\nlado ya"]) {
      const r = casarLetra(notas, heredarTiempos(texto, oidas, notas));
      assert.deepEqual(r.porNota, MAR, `${JSON.stringify(texto)}${mostrar(r, MAR)}`);
    }
    const r = casarLetra(notas, sinTiempo("Canta la noche\nsobre mar ven a mi lado ya"));
    assert.deepEqual(r.porNota, MAR, `sin tiempos${mostrar(r, MAR)}`);
  });

  test("y si cae entre dos palabras que se cantan en sinalefa, siguen juntas: «ta‿a»", () => {
    const conA = [...oir([["Ella", 0, 0.77], ["canta", 0.8, 1.5], ["a", 1.3, 1.57], ["la", 1.6, 1.97], ["noche", 2.0, 2.77], ["mar", 2.8, 3.17]]),
      ...oidas.slice(5)];
    const esperado = ["E-", "lla", "can-", "ta‿a", "la", "no-", "che", "mar", "ven", "a", "mi", "la-", "do", "ya"];
    for (const texto of ["Ella canta a la noche mar\nven a mi lado ya", "Ella canta\na la noche mar\nven a mi lado ya"]) {
      const r = casarLetra(notas, heredarTiempos(texto, conA, notas));
      assert.deepEqual(r.porNota, esperado, `${JSON.stringify(texto)}${mostrar(r, esperado)}`);
      assert.deepEqual(r.dudosas, new Array(14).fill(false), JSON.stringify(texto));
    }
  });

  test("pero no a través de un respiro si la segunda se oye cantada tras él, aunque Whisper pegue su comienzo a la anterior", () => {
    // «a» se canta en la primera nota de la 2.ª frase y Whisper la oye desde el final de «canta»; hay más líneas que
    // frases y a la 3.ª le falta una nota: juntar «ta‿a» correría todo una nota, sin ámbar
    const f2 = 2.37;
    const f3 = 5.17;
    const notas = notasEn([0, 0.4, 0.8, 1.2, ...[0, 0.4, 0.8, 1.2, 1.6].map((d) => f2 + d), ...[0, 0.4, 0.8, 1.2].map((d) => f3 + d)]);
    const oidas = oir([["Ella", 0, 0.77], ["canta", 0.8, 1.57], ["a", 1.57, f2 + 0.37], ["la", f2 + 0.4, f2 + 0.77], ["noche", f2 + 0.8, f2 + 1.57],
      ["mar", f2 + 1.6, f2 + 1.97], ["ven", f3, f3 + 0.37], ["a", f3 + 0.4, f3 + 0.77], ["mi", f3 + 0.8, f3 + 1.17], ["lado", f3 + 1.2, f3 + 1.57]]);
    const esperado = ["E-", "lla", "can-", "ta", "a", "la", "no-", "che", "mar", "ven", "a", "mi", "la"];
    const r = casarLetra(notas, heredarTiempos("Ella canta\na la noche\nmar\nven a mi lado", oidas, notas));
    assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
    assert.deepEqual(r.descartadas, ["do"]);
    // y si Whisper alarga una palabra corta por encima del respiro y de la siguiente, su final no dice nada: «ta‿y»
    const notas2 = notasEn([0, 0.4, 0.8, 1.2, ...[0, 0.4, 0.8, 1.2].map((d) => f2 + d)]);
    const oidas2 = oir([["Ella", 0, 0.77], ["canta", 0.8, 1.4], ["y", 1.4, f2 + 0.6], ["la", f2, f2 + 0.37], ["noche", f2 + 0.4, f2 + 1.17], ["mar", f2 + 1.2, f2 + 1.57]]);
    const esperado2 = ["E-", "lla", "can-", "ta‿y", "la", "no-", "che", "mar"];
    for (const texto of ["Ella canta\ny la noche mar", "Ella canta\ny la noche\nmar"]) {
      const r2 = casarLetra(notas2, heredarTiempos(texto, oidas2, notas2));
      assert.deepEqual(r2.porNota, esperado2, `${JSON.stringify(texto)}${mostrar(r2, esperado2)}`);
    }
  });
});

describe("un guion suelto en el texto", () => {
  test("entre dos palabras («Canta - la noche») separa, como un espacio; entre dos sílabas («Can - ta») las parte", () => {
    assert.deepEqual(palabrasDeTexto("Canta - la noche").map((p) => p.texto), ["Canta", "la", "noche"]);
    assert.deepEqual(palabrasDeTexto("hola ‐ adiós ­ amigo -\ny tú").map((p) => p.texto), ["hola", "adiós", "amigo", "y", "tú"]);
    assert.deepEqual(palabrasDeTexto("Can - ta la no - che").map((p) => p.texto), ["Can-", "ta", "la", "no-", "che"]);
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6], 0.37);
    for (const texto of ["Canta la noche", "Canta - la noche", "Canta -- la noche", "Canta -\nla noche", "Can - ta la no - che"]) {
      assert.deepEqual(casarLetra(notas, heredarTiempos(texto, OIDAS_MAR.slice(0, 3), notas)).porNota, ["Can-", "ta", "la", "no-", "che"], texto);
    }
    assert.deepEqual(casarLetra(notas, sinTiempo("Canta - la noche")).porNota, ["Can-", "ta", "la", "no-", "che"]);
  });

  test("tras una sílaba suelta, con lo oído: pega solo si juntas casan con una palabra oída («Can - ta»), si no separa («ven - ya»)", () => {
    // lo oído, palabra a palabra y exacto: 0,4 s por sílaba
    const oirSeguido = (texto) => {
      let t = 0;
      return texto.split(" ").map((p) => {
        const n = silabasConRasgos(p).length;
        const o = { texto: p, a: t, b: t + 0.4 * n - 0.03 };
        t += 0.4 * n;
        return o;
      });
    };
    for (const [texto, oido, esperado] of [
      ["ven - ya amigo", "ven ya amigo", ["ven", "ya", "a-", "mi-", "go"]],
      ["yo - te quiero", "yo te quiero", ["yo", "te", "quie-", "ro"]],
      ["tu - yo es", "tu yo es", ["tu", "yo", "es"]],
      ["tu - yo es", "tuyo es", ["tu-", "yo", "es"]],
      ["Can - ta la no - che", "canta la noche", ["Can-", "ta", "la", "no-", "che"]],
      ["A - le - lu - ya", "aleluia", ["A-", "le-", "lu-", "ya"]], // Whisper la escribe un poco distinta
      ["ven - Can - ta mar", "ven canta mar", ["ven", "Can-", "ta", "mar"]],
    ]) {
      const notas = notasEn(esperado.map((_, k) => 0.4 * k));
      const r = casarLetra(notas, heredarTiempos(texto, oirSeguido(oido), notas));
      assert.deepEqual(r.porNota, esperado, `«${texto}» con «${oido}»${mostrar(r, esperado)}`);
    }
    // sin lo oído, o donde no se oyó nada, como siempre: pega (las partituras traen «Can - ta»)
    assert.deepEqual(heredarTiempos("ven - ya amigo", []).map((p) => p.texto), ["ven-", "ya", "amigo"]);
    const notas = notasEn([0, 0.4, 0.8, 1.2, 1.6, 3.0, 3.4, 3.8, 4.2]);
    assert.deepEqual(heredarTiempos("Canta la noche\nven - ya", oirSeguido("Canta la noche"), notas).map((p) => p.texto), ["Canta", "la", "noche", "ven-", "ya"]);
  });

  test("y si Whisper oye mal la palabra partida («no - che» oída «nube»), sigue pegada: no sale partida en el karaoke", () => {
    // lo oído, cada palabra en tantas notas de 0,4 s como dice su número
    const oirEn = (lista) => {
      let t = 0;
      return lista.map(([texto, n]) => {
        const o = { texto, a: t, b: t + 0.4 * n - 0.03 };
        t += 0.4 * n;
        return o;
      });
    };
    for (const [texto, oido, esperado] of [
      ["Can - ta la no - che\nven a mi la - do", [["canta", 2], ["la", 1], ["nube", 2], ["ven", 1], ["a", 1], ["mi", 1], ["lado", 2]],
        ["Can-", "ta", "la", "no-", "che", "ven", "a", "mi", "la-", "do"]],
      ["Lu - na lle - na\nso - bre el mar", [["luna", 2], ["nieve", 2], ["sobre", 2], ["el", 1], ["mar", 1]], ["Lu-", "na", "lle-", "na", "so-", "bre", "el", "mar"]],
      // «ven - ya» se separa (las dos casan con lo oído), pero «a - mi - go», oída «abrigo», no
      ["ven - ya a - mi - go", [["ven", 1], ["ya", 1], ["abrigo", 3]], ["ven", "ya", "a-", "mi-", "go"]],
    ]) {
      const notas = notasEn(esperado.map((_, k) => 0.4 * k));
      const r = casarLetra(notas, heredarTiempos(texto, oirEn(oido), notas));
      assert.deepEqual(r.porNota, esperado, `«${texto}» con «${oido.map(([p]) => p).join(" ")}»${mostrar(r, esperado)}`);
    }
  });

  test("al empezar una línea («- hola amigo», raya de diálogo) no parte nada: se salta", () => {
    for (const texto of ["- hola amigo\n- adiós amigo", "-- hola amigo\n‐ adiós amigo"]) {
      assert.deepEqual(palabrasDeTexto(texto), palabrasDeTexto("hola amigo\nadiós amigo"), texto);
    }
    const notas = notasEn([0, 0.4, 0.8, 1.2, 2.4, 2.8, 3.2, 3.6, 4.0]);
    const oidas = oir([["hola", 0, 0.6], ["amigo", 0.5, 1.57], ["adiós", 2.4, 3.17], ["amigo", 3.2, 4.37]]);
    const esperado = ["ho-", "la‿a-", "mi-", "go", "a-", "diós", "a-", "mi-", "go"];
    for (const palabras of [heredarTiempos("- hola amigo\n- adiós amigo", oidas, notas), sinTiempo("- hola amigo\n- adiós amigo")]) {
      const r = casarLetra(notas, palabras);
      assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
    }
  });

  test("tras una sinalefa escrita («por - que‿a - mor») cuenta solo la palabra que sigue: «a - mor» sigue partida, como en orden", () => {
    const texto = "por - que‿a - mor de - ma - dre";
    const esperado = ["por-", "que‿a-", "mor", "de-", "ma-", "dre"];
    assert.deepEqual(palabrasDeTexto(texto).map((p) => p.texto), esperado);
    assert.deepEqual(splitSyllables(texto), esperado);
    const r = casarLetra(notasEn([0, 0.4, 0.8, 1.2, 1.6, 2.0]), sinTiempo(texto));
    assert.deepEqual(r.porNota, esperado, mostrar(r, esperado));
  });
});

// ───────────── El simulador del prototipo: canciones inventadas y lo que Whisper oiría de ellas ─────────────

let semilla = 1;
const setSemilla = (s) => { semilla = s; };
const rand = () => { semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0; return semilla / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

const VOCAB = `canta la noche sobre el agua clara y viento lleva tu canción al mar una estrella se asoma a ventana mientras
luna empieza caminar ven mi lado que tarde acaba en silencio aprenderé cantar todo lo tengo es esta voz amigo corazón madre
tierra fuego camino río montaña puerta casa siempre nunca ahora otra vez despacio alegre triste olvido recuerdo invierno
verano primavera hoja árbol semilla pan sal viejo nuevo cielo azul blanca verde nieve lluvia sol aire mirada palabra sueño
esperanza hermano pueblo orilla barca remo vela ola espuma arena piedra campana iglesia plaza fiesta baile mano beso abrazo
lejos cerca hoy mañana ayer porque cuando donde como quiero puedo vuelvo llego salgo miro escucho siento digo hablo sigo
espero a e o u y el los las un una mi tu su con sin por para hasta desde entre poeta oído aún reír`.split(/\s+/).filter(Boolean);

const memoSil = new Map();
const sil = (w) => {
  if (!memoSil.has(w)) memoSil.set(w, splitSyllables(w, { sinalefa: false }).map((s) => s.replace(/-$/, "")));
  return memoSil.get(w);
};
const memoSin = new Map();
const puedeSinalefa = (a, b) => {
  const k = `${a} ${b}`;
  if (!memoSin.has(k)) memoSin.set(k, splitSyllables(k).length < sil(a).length + sil(b).length);
  return memoSin.get(k);
};
const VOCAL_INI = /^h?[aeiouáéíóúüy]/i;

/** Una canción inventada: palabras, frases, notas (con melismas y alguna nota libre) y la nota de cada sílaba. */
function cancion(nPalabras, pMel, pMelFin) {
  const palabras = Array.from({ length: nPalabras }, () => pick(VOCAB));
  const finFrase = new Set();
  for (let k = 0, n = 0; k < nPalabras; k++) {
    n++;
    if (n >= 5 + Math.floor(rand() * 5) || k === nPalabras - 1) { finFrase.add(k); n = 0; }
  }
  const silabas = [];
  palabras.forEach((p, w) => sil(p).forEach((t, r) => silabas.push({ w, r, texto: t })));
  const grupos = [];
  for (let i = 0; i < silabas.length; i++) {
    const s = silabas[i], prev = silabas[i - 1];
    const une = prev && s.r === 0 && !finFrase.has(prev.w) && sil(palabras[prev.w]).length - 1 === prev.r &&
      puedeSinalefa(palabras[prev.w], palabras[s.w]) && rand() < 0.75;
    if (une) grupos[grupos.length - 1].push(i); else grupos.push([i]);
  }
  const b = 0.45 + rand() * 0.3;
  const notas = [];
  const inicioSilaba = new Array(silabas.length).fill(-1);
  const notasDeSilaba = new Array(silabas.length).fill(1);
  let t = 0.8;
  grupos.forEach((g, gi) => {
    const ultima = silabas[g[g.length - 1]];
    const cierra = finFrase.has(ultima.w) && sil(palabras[ultima.w]).length - 1 === ultima.r;
    const primera = silabas[g[0]];
    if (primera.r === 0 && (gi === 0 || finFrase.has(primera.w - 1)) && rand() < 0.05) {
      for (let q = 0; q < 2; q++) { const d = 0.5 * b; notas.push({ s: t, e: t + d * 0.95, tipo: "libre" }); t += d; }
    }
    const pm = cierra ? pMelFin : pMel;
    const r = rand();
    const k = r < 1 - pm ? 1 : r < 1 - pm * 0.35 ? 2 : r < 1 - pm * 0.1 ? 3 : 4;
    for (let q = 0; q < k; q++) {
      const d = (q === 0 ? pick([0.5, 1, 1, 1, 1.5, 2]) : pick([0.5, 0.5, 1])) * b;
      if (q === 0) g.forEach((i) => { inicioSilaba[i] = notas.length; notasDeSilaba[i] = k; });
      notas.push({ s: t, e: t + d * 0.95, tipo: q === 0 ? "ini" : "sigue" });
      t += d;
      if (rand() < 0.03) t += 0.1;
    }
    if (cierra) t += pick([1, 2, 3]) * b;
  });
  return { palabras, silabas, notas, inicioSilaba, notasDeSilaba, finFrase };
}

/** Lo que oiría Whisper: tiempos con ruido σ y un desfase común; palabras perdidas, cambiadas, metidas e inventadas. */
function whisper(c, o) {
  const g = (rand() * 2 - 1) * o.desfase;
  const out = [];
  let ids0 = 0;
  c.palabras.forEach((p, w) => {
    const n = sil(p).length, ids = Array.from({ length: n }, (_, k) => ids0 + k);
    ids0 += n;
    const nIni = c.notas[c.inicioSilaba[ids[0]]];
    const enSinalefa = ids[0] > 0 && c.inicioSilaba[ids[0] - 1] === c.inicioSilaba[ids[0]];
    let a = nIni.s + (enSinalefa ? 0.3 * (nIni.e - nIni.s) : 0);
    if (!VOCAL_INI.test(p) && !enSinalefa) a -= 0.02 + rand() * 0.1;
    let q = c.inicioSilaba[ids[n - 1]];
    while (q + 1 < c.notas.length && c.notas[q + 1].tipo === "sigue") q++;
    const A = a + g + gauss() * o.sigma, B = c.notas[q].e + g + gauss() * o.sigma * 0.7;
    const r = rand();
    if (r < o.pBorra) return;
    if (r < o.pBorra + o.pCambia) out.push({ texto: pick(VOCAB), a: A, b: B, origen: -1 });
    else out.push({ texto: p, a: A, b: B, origen: w });
    out[out.length - 1].abre = (w === 0 || c.finFrase.has(w - 1)) ? rand() < 0.85 : rand() < 0.03;
    if (rand() < o.pMete) out.push({ texto: pick(VOCAB), a: B + 0.05, b: B + 0.35, origen: -1 });
  });
  if (o.alucina) {
    let t = c.notas[c.notas.length - 1].e + 1.5;
    for (const p of "Subtítulos realizados por la comunidad de Amara.org".split(" ")) {
      out.push({ texto: p, a: t, b: t + 0.3, origen: -1 });
      t += 0.35;
    }
  }
  for (let k = 1; k < out.length; k++) out[k].a = Math.max(out[k].a, out[k - 1].a + 0.02);
  for (const x of out) x.b = Math.max(x.b, x.a + 0.08);
  return out;
}

/** Lo más simple: la sílaba k (con sinalefa) en la nota k. */
function enOrden(c) {
  const inicio = new Array(c.silabas.length).fill(-1);
  let i = 0;
  splitSyllables(c.palabras.join(" ")).forEach((s, q) => {
    for (let h = 0; h < s.split("‿").length && i < c.silabas.length; h++) inicio[i++] = q < c.notas.length ? q : -1;
  });
  return inicio;
}

const textoDe = (c) => c.palabras.map((p, w) => (w === 0 ? "" : c.finFrase.has(w - 1) ? "\n" : " ") + p).join("");
const notasDe = (c) => c.notas.map((n) => ({ ini: n.s, fin: n.e }));
const comoWhisper = (tr) => tr.map((x) => ({ texto: x.texto, a: x.a, b: x.b, abreLinea: x.abre }));
const ERRORES = { pBorra: 0.08, pCambia: 0.1, pMete: 0.04, desfase: 0.25, alucina: true };
const pc = (x) => `${(100 * x).toFixed(1)} %`;

/**
 * Las 25 canciones silábicas con las que se probó el prototipo (semilla 23; melisma en el 6 % de las sílabas y en el
 * 35 % de las que cierran frase), con ruido de tiempo `sigma`. Mide el acierto con el texto corregido, con lo que da
 * Whisper tal cual, sin tiempos y poniendo las sílabas en orden.
 */
function medir(sigma, { errores = ERRORES, pMel = 0.06, pMelFin = 0.35 } = {}) {
  setSemilla(23);
  const m = { corregido: [0, 0], transcrito: [0, 0], sinTiempos: [0, 0], enOrden: [0, 0], peorFrenteAOrden: Infinity, canciones: [],
    melisma: [0, 0], descartadas: 0 };
  const dud = { notas: 0, marcadas: 0, tramos: 0, pillados: 0 };
  for (let k = 0; k < 25; k++) {
    const c = cancion(60, pMel, pMelFin);
    const tr = whisper(c, { ...errores, sigma, alucina: errores.alucina && k % 2 === 0 });
    const notas = notasDe(c);

    // texto corregido: la letra buena, con los tiempos heredados de Whisper
    const B = casarLetra(notas, heredarTiempos(textoDe(c), comoWhisper(tr)));
    assert.equal(B.silabas.length, c.silabas.length);
    const bien = B.silabas.filter((s, i) => s.nota === c.inicioSilaba[i]).length;
    m.corregido[0] += bien;
    m.corregido[1] += c.silabas.length;
    const orden = enOrden(c).filter((q, i) => q === c.inicioSilaba[i]).length;
    m.enOrden[0] += orden;
    m.enOrden[1] += c.silabas.length;
    m.peorFrenteAOrden = Math.min(m.peorFrenteAOrden, bien - orden);
    m.canciones.push({ bien, orden, total: c.silabas.length });
    m.descartadas += B.descartadas.length;
    // las sílabas de las palabras de varias sílabas con algún melisma
    const dePalabra = [];
    c.silabas.forEach((s, i) => (dePalabra[s.w] ??= []).push(i));
    B.silabas.forEach((s, i) => {
      const ids = dePalabra[c.silabas[i].w];
      if (ids.length < 2 || !ids.some((h) => c.notasDeSilaba[h] > 1)) return;
      m.melisma[1]++;
      if (s.nota === c.inicioSilaba[i]) m.melisma[0]++;
    });

    // dudosas: tramos de sílabas mal puestas con alguna nota marcada cerca
    dud.notas += c.notas.length;
    dud.marcadas += B.dudosas.filter(Boolean).length;
    for (let i = 0; i < B.silabas.length; ) {
      if (B.silabas[i].nota === c.inicioSilaba[i]) { i++; continue; }
      const qs = [];
      for (; i < B.silabas.length && B.silabas[i].nota !== c.inicioSilaba[i]; i++) {
        if (B.silabas[i].nota >= 0) qs.push(B.silabas[i].nota);
        qs.push(c.inicioSilaba[i]);
      }
      dud.tramos++;
      if (B.dudosas.slice(Math.max(0, Math.min(...qs) - 1), Math.max(...qs) + 2).some(Boolean)) dud.pillados++;
    }

    // lo que da Whisper tal cual (sin corregir): solo cuentan las palabras que oyó bien
    const A = casarLetra(notas, comoWhisper(tr));
    const primera = [];
    c.palabras.reduce((i0, p, w) => { primera[w] = i0; return i0 + sil(p).length; }, 0);
    let r = 0;
    A.silabas.forEach((s, i) => {
      r = i > 0 && A.silabas[i - 1].palabra === s.palabra ? r + 1 : 0;
      const origen = tr[s.palabra].origen;
      if (origen < 0) return;
      m.transcrito[1]++;
      if (s.nota === c.inicioSilaba[primera[origen] + r]) m.transcrito[0]++;
    });

    // sin tiempos: solo el texto con sus líneas
    if (sigma === 0.3) {
      const C = casarLetra(notas, palabrasDeTexto(textoDe(c)).map((p) => ({ ...p, a: NaN, b: NaN })));
      m.sinTiempos[0] += C.silabas.filter((s, i) => s.nota === c.inicioSilaba[i]).length;
      m.sinTiempos[1] += c.silabas.length;
    }
  }
  const tasa = ([a, b]) => (b ? a / b : NaN);
  return {
    corregido: tasa(m.corregido),
    transcrito: tasa(m.transcrito),
    sinTiempos: tasa(m.sinTiempos),
    enOrden: tasa(m.enOrden),
    peorFrenteAOrden: m.peorFrenteAOrden,
    canciones: m.canciones,
    marcadas: dud.marcadas / dud.notas,
    tramosPillados: dud.pillados / dud.tramos,
    melisma: tasa(m.melisma),
    descartadas: m.descartadas,
  };
}

describe("simulador: canciones silábicas con el texto corregido", () => {
  const medidas = new Map();
  const de = (sigma) => {
    if (!medidas.has(sigma)) medidas.set(sigma, medir(sigma));
    return medidas.get(sigma);
  };

  test("σ = 0,3 s: al menos el 85 % de las sílabas en su nota exacta, y nunca peor que en orden", (t) => {
    const m = de(0.3);
    t.diagnostic(`corregido ${pc(m.corregido)} · Whisper tal cual ${pc(m.transcrito)} · sin tiempos ${pc(m.sinTiempos)} · en orden ${pc(m.enOrden)}`);
    assert.ok(m.corregido >= 0.85, `acierto ${pc(m.corregido)}`);
    m.canciones.forEach(({ bien, orden, total }, k) => assert.ok(bien >= orden, `canción ${k}: ${bien}/${total} frente a ${orden} en orden`));
  });

  test("con otro ruido (σ = 0,1, 0,2 y 0,5 s) tampoco baja de lo esperado ni de ponerlas en orden", (t) => {
    for (const [sigma, minimo] of [[0.1, 0.92], [0.2, 0.9], [0.5, 0.8]]) {
      const m = de(sigma);
      t.diagnostic(`σ ${sigma}: corregido ${pc(m.corregido)} · Whisper tal cual ${pc(m.transcrito)} · en orden ${pc(m.enOrden)}`);
      assert.ok(m.corregido >= minimo, `σ ${sigma}: acierto ${pc(m.corregido)}`);
      assert.ok(m.peorFrenteAOrden >= 0, `σ ${sigma}: alguna canción, peor que en orden`);
    }
  });

  test("sin corregir el texto y sin tiempos, mejor que en orden", (t) => {
    const m = de(0.3);
    assert.ok(m.transcrito >= 0.78, `Whisper tal cual: ${pc(m.transcrito)}`);
    assert.ok(m.sinTiempos >= 0.5 && m.sinTiempos > m.enOrden, `sin tiempos: ${pc(m.sinTiempos)}`);
  });

  test("las dudosas: pocas notas en ámbar y casi todos los tramos con errores tienen una al lado", (t) => {
    const m = de(0.3);
    t.diagnostic(`notas en ámbar ${pc(m.marcadas)} · tramos con errores con una marca cerca ${pc(m.tramosPillados)}`);
    assert.ok(m.marcadas <= 0.2, `marcadas ${pc(m.marcadas)}`);
    assert.ok(m.tramosPillados >= 0.8, `tramos pillados ${pc(m.tramosPillados)}`);
  });

  test("no tira nada de lo que escribió la persona por tener mal el tiempo (con σ = 0,3 y 0,5 s)", () => {
    for (const sigma of [0.3, 0.5]) assert.equal(de(sigma).descartadas, 0, `σ ${sigma}`);
  });

  test("con un Whisper perfecto (sin ruido ni palabras perdidas): casi todo en su sitio, también en las palabras con melisma", (t) => {
    const PERFECTO = { pBorra: 0, pCambia: 0, pMete: 0, desfase: 0, alucina: false };
    const silabico = medir(0, { errores: PERFECTO });
    const melismas = medir(0, { errores: PERFECTO, pMel: 0.2, pMelFin: 0.5 });
    t.diagnostic(`silábico ${pc(silabico.corregido)} (palabras con melisma ${pc(silabico.melisma)}) · con más melismas ${pc(melismas.corregido)} (${pc(melismas.melisma)})`);
    assert.ok(silabico.corregido >= 0.96, `silábico: ${pc(silabico.corregido)}`);
    assert.ok(melismas.corregido >= 0.9, `con más melismas: ${pc(melismas.corregido)}`);
    // antes caía en otra nota un tercio de las sílabas de estas palabras
    assert.ok(silabico.melisma >= 0.8 && melismas.melisma >= 0.78, `palabras con melisma: ${pc(silabico.melisma)}, ${pc(melismas.melisma)}`);
  });
});

describe("rapidez", () => {
  test("una canción de 600 notas y 500 sílabas, en menos de 300 ms, y la banda no cambia el resultado", (t) => {
    setSemilla(11);
    // 500 sílabas en palabras del vocabulario
    const palabras = [];
    for (let n = 0; n < 500; ) {
      let w = pick(VOCAB);
      if (n + sil(w).length > 500) w = VOCAB.find((v) => sil(v).length === 500 - n);
      palabras.push(w);
      n += sil(w).length;
    }
    // una nota por sílaba y 100 sílabas alargadas a una nota más: 600 notas; un silencio antes de cada línea
    const alargadas = new Set();
    while (alargadas.size < 100) alargadas.add(Math.floor(rand() * 500));
    const notas = [];
    const inicio = [];
    const lineas = [];
    let tiempo = 0.5;
    palabras.forEach((w, k) => {
      const abre = k === 0 || rand() < 0.15;
      if (abre && k > 0) tiempo += 1;
      lineas.push(abre);
      for (let r = 0; r < sil(w).length; r++) {
        inicio.push(notas.length);
        for (let q = 0; q < (alargadas.has(inicio.length - 1) ? 2 : 1); q++) {
          const d = 0.3 + rand() * 0.3;
          notas.push({ ini: tiempo, fin: tiempo + 0.9 * d });
          tiempo += d;
        }
      }
    });
    assert.equal(notas.length, 600);
    assert.equal(inicio.length, 500);
    let s = 0;
    const conTiempo = palabras.map((texto, k) => {
      const n = sil(texto).length;
      const primera = inicio[s];
      const ultima = s + n < 500 ? inicio[s + n] - 1 : notas.length - 1;
      s += n;
      return { texto, a: notas[primera].ini + 0.2 * gauss(), b: notas[ultima].fin + 0.15 * gauss(), abreLinea: lineas[k] };
    });

    const t0 = performance.now();
    const r = casarLetra(notas, conTiempo);
    const ms = performance.now() - t0;
    const bien = r.silabas.filter((x, i) => x.nota === inicio[i]).length / 500;
    t.diagnostic(`${ms.toFixed(0)} ms; ${pc(bien)} de las sílabas en su nota`);
    assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
    assert.ok(bien >= 0.8, `acierto ${pc(bien)}`);
    // sin banda (cada sílaba mira todas las notas) sale lo mismo, pero mucho más despacio
    const sinBanda = casarLetra(notas, conTiempo, { banda: Infinity });
    assert.deepEqual(sinBanda.porNota, r.porNota);
    // y sin tiempos, que mira todo, también acaba pronto
    const t1 = performance.now();
    casarLetra(notas, conTiempo.map((p) => ({ ...p, a: NaN, b: NaN })));
    const msSin = performance.now() - t1;
    t.diagnostic(`sin tiempos: ${msSin.toFixed(0)} ms`);
    assert.ok(msSin < 1000, `sin tiempos: ${msSin.toFixed(0)} ms`);
  });
});

describe("ajustes", () => {
  test("los recomendados: los del prototipo que siguen, y los que se añadieron por los fallos del revisor", () => {
    const { quita, libre, sigmaMin, sigmaMax, sigmaPorAnclas, factorDentro, tope, melisma, silencio, sinalefa, sineresis, junta, corte,
      frase, maxSilabas, banda } = AJUSTES_CASAR;
    // del prototipo (K, el máximo de notas de un melisma, ya no hace falta; las supuestas ya no usan su tiempo)
    assert.deepEqual(
      { quita, libre, sigmaMin, sigmaMax, sigmaPorAnclas, factorDentro, tope, melisma, silencio, sinalefa, sineresis, junta, corte, frase,
        maxSilabas, banda },
      { quita: 3, libre: 2, sigmaMin: 0.5, sigmaMax: 0.8, sigmaPorAnclas: 1.5, factorDentro: 2, tope: 6, melisma: 0.6, silencio: 3,
        sinalefa: 0.4, sineresis: 1.5, junta: 4, corte: 2, frase: 2.5, maxSilabas: 4, banda: 5 },
    );
    // (maxSilabas era 3 en el prototipo: con la letra de la persona, que no junta a la fuerza, cuatro sílabas en sinalefa
    // en una nota, «mo‿y‿o‿a», correrían la frase entera una nota)
    const A = AJUSTES_CASAR;
    // el tiempo supuesto de las sílabas de en medio solo desempata: no basta para llevarse una nota de melisma
    assert.ok(A.topeDentro < A.melisma);
    // un tiempo malo no tira una sílaba que ha escrito la persona: quitarla cuesta más que los dos topes y un melisma
    assert.ok(A.quitaSegura > A.tope + A.topeFin + A.melisma);
    // un melisma largo es más normal que dos cortos; al final de la frase, más que en la tónica
    assert.ok(A.melismaSigue < A.melisma && A.melismaFinal >= 2 * A.melismaTonica);
    // juntar con sinalefa es lo normal; una frase sin letra, más normal antes o después de la letra que en medio
    assert.ok(A.noSinalefa > 0 && A.fraseLibreBorde < A.fraseLibre && A.frase <= A.fraseMax);
    assert.ok(Object.isFrozen(AJUSTES_CASAR));
  });
});
