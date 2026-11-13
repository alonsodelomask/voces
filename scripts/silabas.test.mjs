// Pruebas de la separación en sílabas cantadas (src/lyrics.ts).
// Se ejecutan con: node --test scripts/silabas.test.mjs
// (Node 24 quita los tipos de TypeScript solo; con Node 22, añade --experimental-strip-types.)
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { splitSyllables } from "../src/lyrics.ts";

/** Comprueba una tabla de casos [letra, sílabas esperadas]. */
function tabla(casos, opts) {
  for (const [letra, esperado] of casos) {
    const nombre = `«${letra.replace(/\n/g, "⏎").replace(/\t/g, "⇥")}» → ${esperado.join(" · ") || "(nada)"}`;
    test(nombre, () => {
      assert.deepEqual(splitSyllables(letra, opts), esperado);
    });
  }
}

const EJEMPLOS = [
  ["Acérquense a mi mesa, por favor", ["A-", "cér-", "quen-", "se‿a", "mi", "me-", "sa,", "por", "fa-", "vor"]],
  ["La vida es una copa de licor", ["La", "vi-", "da‿es", "u-", "na", "co-", "pa", "de", "li-", "cor"]],
  ["camión", ["ca-", "mión"]],
  ["país", ["pa-", "ís"]],
  ["poeta", ["po-", "e-", "ta"]],
  ["ciudad", ["ciu-", "dad"]],
  ["guitarra", ["gui-", "ta-", "rra"]],
  ["pingüino", ["pin-", "güi-", "no"]],
  ["hablar", ["ha-", "blar"]],
  ["instrumento", ["ins-", "tru-", "men-", "to"]],
  ["muy", ["muy"]],
  ["reyes", ["re-", "yes"]],
  ["chico", ["chi-", "co"]],
  ["calle", ["ca-", "lle"]],
  ["perro", ["pe-", "rro"]],
  ["aéreo", ["a-", "é-", "re-", "o"]],
  ["búho", ["bú-", "ho"]],
  ["ahí", ["a-", "hí"]],
  ["construir", ["cons-", "truir"]],
  ["a-cer-quen-se", ["a-", "cer-", "quen-", "se"]],
  ["a-cer-quen-se a", ["a-", "cer-", "quen-", "se‿a"]],
  ["de un año", ["de‿un", "a-", "ño"]],
  ["la y o", ["la‿y‿o"]],
  ["obstáculo", ["obs-", "tá-", "cu-", "lo"]],
  ["atlas", ["at-", "las"]],
  ["rey", ["rey"]],
  ["hoy", ["hoy"]],
  ["mayo", ["ma-", "yo"]],
  ["ya", ["ya"]],
  ["favor,", ["fa-", "vor,"]],
  ["¿Qué", ["¿Qué"]],
];

describe("ejemplos del encargo", () => {
  tabla(EJEMPLOS);

  test("sin sinalefa: «se a» → se · a", () => {
    assert.deepEqual(splitSyllables("se a", { sinalefa: false }), ["se", "a"]);
  });

  test("la letra del usuario da 10 sílabas: A cer quen sea mi me sa por fa vor", () => {
    const silabas = splitSyllables("Acérquense a mi mesa, por favor");
    assert.equal(silabas.length, 10);
    const limpias = silabas.map((s) => s.replace(/[-,]/g, "").replace("‿", "").toLowerCase());
    assert.deepEqual(limpias, ["a", "cér", "quen", "sea", "mi", "me", "sa", "por", "fa", "vor"]);
  });
});

describe("palabras sueltas", () => {
  tabla([
    ["corazón", ["co-", "ra-", "zón"]],
    ["cantemos", ["can-", "te-", "mos"]],
    ["alegría", ["a-", "le-", "grí-", "a"]],
    ["siempre", ["siem-", "pre"]],
    ["nuestro", ["nues-", "tro"]],
    ["tierra", ["tie-", "rra"]],
    ["Euskadi", ["Eus-", "ka-", "di"]],
    ["amigo", ["a-", "mi-", "go"]],
    ["oigo", ["oi-", "go"]],
    ["cuidado", ["cui-", "da-", "do"]],
    ["huésped", ["hués-", "ped"]],
    ["Paraguay", ["Pa-", "ra-", "guay"]],
    ["Uruguay", ["U-", "ru-", "guay"]],
    ["aire", ["ai-", "re"]],
    ["oye", ["o-", "ye"]],
    ["canción", ["can-", "ción"]],
    ["noche", ["no-", "che"]],
    ["luna", ["lu-", "na"]],
    ["estrella", ["es-", "tre-", "lla"]],
    ["mañana", ["ma-", "ña-", "na"]],
    ["quiero", ["quie-", "ro"]],
    ["aquí", ["a-", "quí"]],
    ["ayer", ["a-", "yer"]],
    ["playa", ["pla-", "ya"]],
    ["agua", ["a-", "gua"]],
    ["cielo", ["cie-", "lo"]],
    ["bueno", ["bue-", "no"]],
    ["fuego", ["fue-", "go"]],
    ["viento", ["vien-", "to"]],
    ["sangre", ["san-", "gre"]],
    ["hombre", ["hom-", "bre"]],
    ["palabra", ["pa-", "la-", "bra"]],
    ["Dios", ["Dios"]],
    ["día", ["dí-", "a"]],
    ["María", ["Ma-", "rí-", "a"]],
    ["río", ["rí-", "o"]],
    ["oído", ["o-", "í-", "do"]],
    ["leer", ["le-", "er"]],
    ["creer", ["cre-", "er"]],
    ["héroe", ["hé-", "ro-", "e"]],
    ["océano", ["o-", "cé-", "a-", "no"]],
    ["ahora", ["a-", "ho-", "ra"]],
    ["huevo", ["hue-", "vo"]],
    ["hielo", ["hie-", "lo"]],
    ["cigüeña", ["ci-", "güe-", "ña"]],
    ["vergüenza", ["ver-", "güen-", "za"]],
    ["averigüéis", ["a-", "ve-", "ri-", "güéis"]],
    ["buey", ["buey"]],
    ["bueyes", ["bue-", "yes"]],
    ["muchacho", ["mu-", "cha-", "cho"]],
    ["llorar", ["llo-", "rar"]],
    ["carretera", ["ca-", "rre-", "te-", "ra"]],
    ["guerra", ["gue-", "rra"]],
    ["seguir", ["se-", "guir"]],
    ["Miguel", ["Mi-", "guel"]],
    ["aguinaldo", ["a-", "gui-", "nal-", "do"]],
    ["ninguno", ["nin-", "gu-", "no"]],
    ["lengua", ["len-", "gua"]],
    ["antiguo", ["an-", "ti-", "guo"]],
    ["Guadalquivir", ["Gua-", "dal-", "qui-", "vir"]],
    ["pequeño", ["pe-", "que-", "ño"]],
    ["querer", ["que-", "rer"]],
    ["quiosco", ["quios-", "co"]],
    ["guion", ["guion"]],
    ["Atlántico", ["At-", "lán-", "ti-", "co"]],
    ["transporte", ["trans-", "por-", "te"]],
    ["perspectiva", ["pers-", "pec-", "ti-", "va"]],
    ["abstracto", ["abs-", "trac-", "to"]],
    ["instrucción", ["ins-", "truc-", "ción"]],
    ["inglés", ["in-", "glés"]],
    ["examen", ["e-", "xa-", "men"]],
    ["extraño", ["ex-", "tra-", "ño"]],
    ["acción", ["ac-", "ción"]],
    ["abrazo", ["a-", "bra-", "zo"]],
    ["flor", ["flor"]],
    ["reloj", ["re-", "loj"]],
    ["Leyre", ["Ley-", "re"]],
    ["triunfo", ["triun-", "fo"]],
    ["reina", ["rei-", "na"]],
    ["ruido", ["rui-", "do"]],
    ["veinte", ["vein-", "te"]],
    ["causa", ["cau-", "sa"]],
    ["deuda", ["deu-", "da"]],
    ["baúl", ["ba-", "úl"]],
    ["reír", ["re-", "ír"]],
    ["maíz", ["ma-", "íz"]],
    ["zanahoria", ["za-", "na-", "ho-", "ria"]],
    ["prohibido", ["pro-", "hi-", "bi-", "do"]],
    ["alcohol", ["al-", "co-", "hol"]],
    ["desierto", ["de-", "sier-", "to"]],
    ["ayúdame", ["a-", "yú-", "da-", "me"]],
    ["chiita", ["chi-", "i-", "ta"]],
    ["süave", ["sü-", "a-", "ve"]],
    ["ruïdo", ["ru-", "ï-", "do"]],
    ["Ojalá", ["O-", "ja-", "lá"]],
    ["AMOR", ["A-", "MOR"]],
    ["Mmm", ["Mmm"]],
  ]);
});

describe("frases y sinalefa", () => {
  tabla([
    ["Ojalá que llueva café en el campo", ["O-", "ja-", "lá", "que", "llue-", "va", "ca-", "fé‿en", "el", "cam-", "po"]],
    ["Bésame, bésame mucho", ["Bé-", "sa-", "me,", "bé-", "sa-", "me", "mu-", "cho"]],
    ["Cielito lindo", ["Cie-", "li-", "to", "lin-", "do"]],
    ["Te quiero, amor", ["Te", "quie-", "ro,", "a-", "mor"]],
    ["¿Qué es la vida?", ["¿Qué‿es", "la", "vi-", "da?"]],
    ["¡Ay, amor!", ["¡Ay,", "a-", "mor!"]],
    ["Canta y no llores", ["Can-", "ta‿y", "no", "llo-", "res"]],
    ["vino y pan", ["vi-", "no‿y", "pan"]],
    ["rey y reina", ["rey", "y", "rei-", "na"]],
    ["Y yo te quiero", ["Y", "yo", "te", "quie-", "ro"]],
    ["Ana y Eva", ["A-", "na‿y‿E-", "va"]],
    ["padre e hijo", ["pa-", "dre‿e‿hi-", "jo"]],
    ["que a él", ["que‿a‿él"]],
    ["todo el mundo", ["to-", "do‿el", "mun-", "do"]],
    ["la hora", ["la‿ho-", "ra"]],
    ["mi alma", ["mi‿al-", "ma"]],
    ["la ola", ["la‿o-", "la"]],
    ["su amor eterno", ["su‿a-", "mor", "e-", "ter-", "no"]],
    ["fui a verte", ["fui‿a", "ver-", "te"]],
    ["corazón de hielo", ["co-", "ra-", "zón", "de", "hie-", "lo"]],
    ["la huella", ["la", "hue-", "lla"]],
    ["hoy es", ["hoy", "es"]],
    ["muy alto", ["muy", "al-", "to"]],
    ["pa' allá", ["pa'‿a-", "llá"]],
    ["2 corazones", ["2", "co-", "ra-", "zo-", "nes"]],
  ]);
});

describe("guiones: la persona manda", () => {
  tabla([
    ["su-a-ve", ["su-", "a-", "ve"]],
    ["Glo-ri-a", ["Glo-", "ri-", "a"]],
    ["mi a-mor", ["mi‿a-", "mor"]],
    ["fe-liz, a-mor", ["fe-", "liz,", "a-", "mor"]],
    ["a- cer- quen- se", ["a-", "cer-", "quen-", "se"]],
    ["a -- cer -- quen -- se a", ["a-", "cer-", "quen-", "se‿a"]],
    ["can-", ["can-"]],
  ]);
});

describe("melismas", () => {
  tabla([
    ["a _ mor", ["a", "_", "mor"]],
    ["a_", ["a", "_"]],
    ["_a", ["_", "a"]],
    ["a__", ["a", "_", "_"]],
    ["mar _ _", ["mar", "_", "_"]],
    ["se _ a", ["se", "_", "a"]],
    ["se a _", ["se‿a", "_"]],
    ["Glo_ria", ["Glo-", "_", "ria"]],
    ["a- _ mor", ["a-", "_", "mor"]],
  ]);
});

describe("signos, espacios y texto vacío", () => {
  tabla([
    ["", []],
    ["   \n\t  ", []],
    ["  Acérquense   a\n\nmi mesa  ", ["A-", "cér-", "quen-", "se‿a", "mi", "me-", "sa"]],
    ["canta\nalegre", ["can-", "ta‿a-", "le-", "gre"]],
    ["hola... adiós", ["ho-", "la...", "a-", "diós"]],
    ["hola,adiós", ["ho-", "la,", "a-", "diós"]],
    ["hola , adiós", ["ho-", "la,", "a-", "diós"]],
    ["casa; era", ["ca-", "sa;", "e-", "ra"]],
    ["casa: era", ["ca-", "sa:", "e-", "ra"]],
    ["casa. Era", ["ca-", "sa.", "E-", "ra"]],
    ["¿Vienes? A casa", ["¿Vie-", "nes?", "A", "ca-", "sa"]],
    ["¡Canta! Ella", ["¡Can-", "ta!", "E-", "lla"]],
    ["«Hola», dijo", ["«Ho-", "la»,", "di-", "jo"]],
    ["« Hola »", ["«Ho-", "la»"]],
    ["dijo ¿a dónde?", ["di-", "jo‿¿a", "dón-", "de?"]],
    ["hola —dijo— adiós", ["ho-", "la", "—di-", "jo—", "a-", "diós"]],
    ["hola—adiós", ["ho-", "la—", "a-", "diós"]],
  ]);
});

describe("sin sinalefa", () => {
  tabla(
    [
      ["La vida es una copa de licor", ["La", "vi-", "da", "es", "u-", "na", "co-", "pa", "de", "li-", "cor"]],
      ["Acérquense a mi mesa", ["A-", "cér-", "quen-", "se", "a", "mi", "me-", "sa"]],
      ["la y o", ["la", "y", "o"]],
      // «‿» escrito a mano une igualmente
      ["se‿a mi", ["se‿a", "mi"]],
      ["mi ‿ alma", ["mi‿al-", "ma"]],
    ],
    { sinalefa: false },
  );
});

describe("dos vocales iguales: siempre hiato, con tilde o sin ella", () => {
  tabla([
    ["friísimo", ["fri-", "í-", "si-", "mo"]],
    ["piísimo", ["pi-", "í-", "si-", "mo"]],
    ["chií", ["chi-", "í"]],
    ["chiíes", ["chi-", "í-", "es"]],
    ["chiíta", ["chi-", "í-", "ta"]],
    ["duunviro", ["du-", "un-", "vi-", "ro"]],
    ["Rociito", ["Ro-", "ci-", "i-", "to"]],
    ["zoológico", ["zo-", "o-", "ló-", "gi-", "co"]],
    // dos débiles distintas sí van juntas, aunque una lleve tilde
    ["cuídate", ["cuí-", "da-", "te"]],
    ["destruí", ["des-", "truí"]],
    ["interviú", ["in-", "ter-", "viú"]],
  ]);

  test("todas las parejas de vocales siguen la regla", () => {
    const vocales = ["a", "e", "o", "á", "é", "ó", "i", "u", "í", "ú"];
    const base = (v) => v.normalize("NFD")[0];
    // fuerte: a, e, o, o una débil con tilde (í, ú)
    const fuerte = (v) => "aeo".includes(base(v)) || v === "í" || v === "ú";
    for (const x of vocales) {
      for (const y of vocales) {
        // hiato si son iguales o si las dos son fuertes; si no, diptongo
        const hiato = base(x) === base(y) || (fuerte(x) && fuerte(y));
        const palabra = `p${x}${y}ta`;
        assert.equal(splitSyllables(palabra).length, hiato ? 3 : 2, palabra);
      }
    }
  });
});

describe("prefijo sub-: la r de detrás suena fuerte y la b se queda atrás", () => {
  tabla([
    ["subrayar", ["sub-", "ra-", "yar"]],
    ["subrogar", ["sub-", "ro-", "gar"]],
    ["subregión", ["sub-", "re-", "gión"]],
    ["subreino", ["sub-", "rei-", "no"]],
    ["subrayado", ["sub-", "ra-", "ya-", "do"]],
    ["Subrayó", ["Sub-", "ra-", "yó"]],
    ["subrepresentado", ["sub-", "re-", "pre-", "sen-", "ta-", "do"]],
    ["abrogar", ["ab-", "ro-", "gar"]],
    // sin prefijo que se note, «br» va junta como siempre
    ["subrepticio", ["su-", "brep-", "ti-", "cio"]],
    ["abrazo", ["a-", "bra-", "zo"]],
    ["abril", ["a-", "bril"]],
    ["abrir", ["a-", "brir"]],
    ["sublime", ["su-", "bli-", "me"]],
    ["subir", ["su-", "bir"]],
  ]);
});

describe("«tx» vasca: un solo sonido, como «ch»", () => {
  tabla([
    ["Arantxa", ["A-", "ran-", "txa"]],
    ["Getxo", ["Ge-", "txo"]],
    ["Etxeberria", ["E-", "txe-", "be-", "rria"]],
    ["patxaran", ["pa-", "txa-", "ran"]],
    ["etxea", ["e-", "txe-", "a"]],
    ["Txema", ["Txe-", "ma"]],
    ["txistu", ["txis-", "tu"]],
    // «tz» no se junta: en náhuatl se divide quet-zal
    ["quetzal", ["quet-", "zal"]],
  ]);
});

describe("la barra separa palabras", () => {
  tabla([
    ["amor/odio", ["a-", "mor/", "o-", "dio"]],
    ["noche/día", ["no-", "che/", "dí-", "a"]],
    ["él/ella", ["él/", "e-", "lla"]],
    // la barra no está entre los signos que cortan la sinalefa
    ["y/o", ["y/‿o"]],
    ["te quiero / a ti", ["te", "quie-", "ro/‿a", "ti"]],
    ["1/2", ["1/2"]],
  ]);

  test("sin sinalefa: «y/o» → y/ · o", () => {
    assert.deepEqual(splitSyllables("y/o", { sinalefa: false }), ["y/", "o"]);
  });
});

describe("no se pierde nada", () => {
  const frases = [
    "amor/odio y/o noche/día",
    "Arantxa subraya el friísimo",
    "Acérquense a mi mesa, por favor",
    "La vida es una copa de licor",
    "Ojalá que llueva café en el campo",
    "¿Qué es la vida? ¡Ay, amor!",
    "«Hola», dijo; pa' allá... y ya",
    "Ana y Eva, padre e hijo",
    "hola —dijo— adiós",
    "¡ … ! ¿ vienes ?",
  ];
  for (const frase of frases) {
    test(`«${frase}»: mismas letras y signos, en el mismo orden`, () => {
      const juntas = splitSyllables(frase).join("").replace(/[-‿]/g, "");
      assert.equal(juntas, frase.replace(/\s+/g, ""));
    });
  }

  test("cada elemento es una sílaba o un melisma, nunca vacío", () => {
    for (const s of splitSyllables("Acérquense a mi mesa _ por fa-vor, ¿sí?")) {
      assert.ok(s.length > 0);
      assert.ok(!/\s/.test(s));
    }
  });
});
