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
  ["Asómate a la calle, por favor", ["A-", "só-", "ma-", "te‿a", "la", "ca-", "lle,", "por", "fa-", "vor"]],
  ["La noche es una barca de cristal", ["La", "no-", "che‿es", "u-", "na", "bar-", "ca", "de", "cris-", "tal"]],
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
  ["a-so-ma-te", ["a-", "so-", "ma-", "te"]],
  ["a-so-ma-te a", ["a-", "so-", "ma-", "te‿a"]],
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

  test("una frase de 10 sílabas: A so ma tea la ca lle por fa vor", () => {
    const silabas = splitSyllables("Asómate a la calle, por favor");
    assert.equal(silabas.length, 10);
    const limpias = silabas.map((s) => s.replace(/[-,]/g, "").replace("‿", "").toLowerCase());
    assert.deepEqual(limpias, ["a", "só", "ma", "tea", "la", "ca", "lle", "por", "fa", "vor"]);
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
    ["Ojalá que vuelva papá en el barco", ["O-", "ja-", "lá", "que", "vuel-", "va", "pa-", "pá‿en", "el", "bar-", "co"]],
    ["Mírame, mírame pronto", ["Mí-", "ra-", "me,", "mí-", "ra-", "me", "pron-", "to"]],
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
    ["a- so- ma- te", ["a-", "so-", "ma-", "te"]],
    ["a -- so -- ma -- te a", ["a-", "so-", "ma-", "te‿a"]],
    ["can-", ["can-"]],
  ]);
});

describe("guion suelto: parte tras una sílaba suelta, tras una palabra entera es una pausa y al empezar una línea se salta", () => {
  tabla([
    // tras una sílaba suelta, como se copia de una partitura: la parte
    ["Can - ta la no - che", ["Can-", "ta", "la", "no-", "che"]],
    ["A - le - lu - ya", ["A-", "le-", "lu-", "ya"]],
    ["Can -\nta", ["Can-", "ta"]],
    // tras una sinalefa escrita dentro de una sílaba, cuenta solo la palabra que sigue: «a - mor» sigue partida
    ["por - que‿a - mor de - ma - dre", ["por-", "que‿a-", "mor", "de-", "ma-", "dre"]],
    // tras una palabra de más de una sílaba: dos palabras, como con un espacio
    ["hola - adiós", ["ho-", "la‿a-", "diós"]],
    ["hola -- adiós", ["ho-", "la‿a-", "diós"]],
    ["hola ‐ adiós ­ amigo", ["ho-", "la‿a-", "diós", "a-", "mi-", "go"]],
    ["hola , - adiós", ["ho-", "la,", "a-", "diós"]],
    ["amigo -\ny tú", ["a-", "mi-", "go‿y", "tú"]],
    ["Glo_ria - a Dios", ["Glo-", "_", "ria‿a", "Dios"]],
    // al empezar una línea, raya de diálogo: no parte nada
    ["- hola amigo\n- adiós amigo", ["ho-", "la‿a-", "mi-", "go‿a-", "diós", "a-", "mi-", "go"]],
    ["-- hola", ["ho-", "la"]],
    ["canta\n-\nalegre", ["can-", "ta‿a-", "le-", "gre"]],
  ]);

  test("sin sinalefa: «hola - adiós» → ho- · la · a- · diós (antes salía «ho- la- a- diós»: «holaadiós» en el karaoke)", () => {
    assert.deepEqual(splitSyllables("hola - adiós", { sinalefa: false }), ["ho-", "la", "a-", "diós"]);
    assert.deepEqual(splitSyllables("- hola\n- adiós", { sinalefa: false }), ["ho-", "la", "a-", "diós"]);
  });
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
    ["  Asómate   a\n\nla calle  ", ["A-", "só-", "ma-", "te‿a", "la", "ca-", "lle"]],
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
      ["La noche es una barca de cristal", ["La", "no-", "che", "es", "u-", "na", "bar-", "ca", "de", "cris-", "tal"]],
      ["Asómate a la calle", ["A-", "só-", "ma-", "te", "a", "la", "ca-", "lle"]],
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
    "Asómate a la calle, por favor",
    "La noche es una barca de cristal",
    "Ojalá que vuelva papá en el barco",
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
    for (const s of splitSyllables("Asómate a la calle _ por fa-vor, ¿sí?")) {
      assert.ok(s.length > 0);
      assert.ok(!/\s/.test(s));
    }
  });
});
