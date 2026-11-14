// Letra de una canción → sílabas que se cantan, una por nota y en orden.
//
//   splitSyllables("Asómate a la calle, por favor")
//   → ["A-", "só-", "ma-", "te‿a", "la", "ca-", "lle,", "por", "fa-", "vor"]
//
// - La sílaba que no cierra su palabra lleva un guion al final («só-»); la última, no.
// - Si la persona parte una palabra con guiones («a-so-ma-te»), se respeta tal cual. Un guion suelto entre
//   espacios la parte tras una sílaba suelta («Can - ta»); tras una palabra entera es una pausa («hola - adiós») y al
//   empezar una línea, una raya de diálogo: no parte nada.
// - Si no, se separa con las reglas del castellano: diptongos juntos, hiatos aparte,
//   «pr», «bl»… con la vocal siguiente y «ch», «ll», «rr», «tx», «qu», «gu» (ante e, i) sin partir.
// - Sinalefa: si una palabra acaba en vocal y la siguiente empieza por vocal (o por h y vocal),
//   las dos sílabas van en la misma nota, unidas con «‿». Una coma, un punto… entre ellas la cortan.
// - «_» es un melisma: la sílaba anterior sigue sonando en una nota más. Sale como "_".
// - «‿» escrito a mano une dos palabras en una nota, aunque la sinalefa esté apagada.
// - Mayúsculas, tildes y signos se conservan, pegados a la sílaba en la que están.

/** Une sílabas de palabras distintas que se cantan en una sola nota: «se‿a». */
export const SINALEFA = "‿";

/** Melisma: la sílaba anterior sigue sonando en una nota más. */
export const MELISMA = "_";

/** Signos que cortan la sinalefa: coma, punto, punto y coma, dos puntos, cierre de
 *  interrogación y de exclamación, puntos suspensivos y rayas. */
const CORTAN = /[,.;:?!…—–]/u;
/** Signos de apertura: van con la sílaba que les sigue. */
const APERTURA = /[¿¡«“‘‹(\[{]/u;
const SOLO_APERTURA = /^[¿¡«“‘‹(\[{]+$/u;
/** Guiones con los que la persona parte una palabra (también el guion blando). */
const GUION = /[-‐‑­]/u;
/** Un guion suelto, entre espacios. */
const SOLO_GUION = /^[-‐‑­]+$/u;

interface Silaba {
  tipo: "silaba";
  texto: string;
  /** Primera sílaba de su palabra. */
  inicio: boolean;
  /** Última sílaba de su palabra: no lleva guion. */
  fin: boolean;
  /** Su palabra empieza por sonido de vocal (solo cuenta si `inicio`). */
  vocalAlEmpezar: boolean;
  /** Su palabra acaba en sonido de vocal (solo cuenta si `fin`). */
  vocalAlAcabar: boolean;
  /** Hay un signo que corta la sinalefa justo antes… */
  corteAntes: boolean;
  /** …o justo después. */
  corteDespues: boolean;
  /** La persona la unió a la siguiente con «‿». */
  unida: boolean;
}

type Elemento = Silaba | { tipo: "melisma" };

/**
 * Convierte la letra en la lista de sílabas que se cantan, una por nota.
 * Con `sinalefa` (por defecto, sí) une la última sílaba de una palabra que acaba en vocal
 * con la primera de la siguiente si empieza por vocal: «se a» → «se‿a».
 * Con `auto: false`, una palabra sin guiones no se parte: va entera en una nota. Sirve para
 * corregir una letra que ya está puesta sin que se mueva nada de sitio.
 */
export function splitSyllables(text: string, opts?: { sinalefa?: boolean; auto?: boolean }): string[] {
  const conSinalefa = opts?.sinalefa !== false;
  const elementos = leer(typeof text === "string" ? text : "", opts?.auto !== false);
  const salida: string[] = [];
  for (let k = 0; k < elementos.length; k++) {
    const e = elementos[k]!;
    if (e.tipo === "melisma") {
      salida.push(MELISMA);
      continue;
    }
    let texto = e.texto;
    let ultima = e;
    while (k + 1 < elementos.length) {
      const sig = elementos[k + 1]!;
      if (sig.tipo !== "silaba" || !seUnen(ultima, sig, conSinalefa)) break;
      texto += SINALEFA + sig.texto;
      ultima = sig;
      k++;
    }
    salida.push(ultima.fin ? texto : texto + "-");
  }
  return salida;
}

function seUnen(a: Silaba, b: Silaba, conSinalefa: boolean): boolean {
  if (a.unida) return true;
  return (
    conSinalefa &&
    a.fin &&
    b.inicio &&
    a.vocalAlAcabar &&
    b.vocalAlEmpezar &&
    !a.corteDespues &&
    !b.corteAntes
  );
}

/** Una sílaba de la letra con lo que hace falta para casarla con las notas de una grabación. */
export interface SilabaConRasgos {
  /** La sílaba tal como se escribe, con sus signos y sin guion: «A», «cér», «sa,». */
  texto: string;
  /** Es la primera sílaba de su palabra. */
  abrePalabra: boolean;
  /** Es la última sílaba de su palabra. */
  cierraPalabra: boolean;
  /** Puede ir en la misma nota que la sílaba siguiente por sinalefa («se a» → «se‿a»), o la persona las unió con «‿». */
  sinalefa: boolean;
  /** Hace hiato con la sílaba anterior de su palabra («po-e-ta», «pa-ís», «le-er»): cantando deprisa, las dos pueden
   *  ir en una nota (sinéresis). */
  hiato: boolean;
  /** Empieza por sonido de vocal (la h no cuenta): «a», «hí», «e». En la primera de la palabra, igual que para la
   *  sinalefa: «hielo» y «huevo», no; la conjunción «y», sí. */
  vocalAlEmpezar: boolean;
  /** Melismas que la persona ha marcado detrás con «_»: en cuántas notas más sigue sonando («lu» en «A-le-lu-_-_-ya»: 2). */
  melismas: number;
  /** Es la sílaba tónica de su palabra: la de la tilde o, si no hay, la penúltima si la palabra acaba en vocal, «n» o
   *  «s», y si no la última («can-CIÓN», «CAN-ta», «a-MOR»). De los monosílabos, solo los que no son palabras átonas
   *  («mar», «sol», sí; «el», «de», «y», «mi», no). */
  tonica: boolean;
}

/** Monosílabos que se dicen sin acento (artículos, preposiciones, conjunciones, posesivos y pronombres átonos). */
const ATONAS = new Set(
  "el la lo los las un del al a de en con por sin so tras y e o u ni que si mas pues tan me te se le les nos os mi mis tu tus su sus".split(" "),
);

/**
 * Las sílabas de la letra una a una, SIN unir la sinalefa, con sus rasgos: si abren o cierran palabra, si admiten
 * sinalefa con la siguiente, si hacen hiato con la anterior de su palabra, si empiezan por vocal y cuántos melismas
 * («_») lleva detrás.
 *
 *   silabasConRasgos("Asómate a la calle") → A · só · ma · te (sinalefa) · a · la · ca · lle
 *
 * Las sílabas son las mismas que da `splitSyllables(texto, { sinalefa: false })`, sin el guion. Los melismas («_») no
 * salen como sílabas (se cuentan en la anterior), y cortan la sinalefa igual que allí.
 */
export function silabasConRasgos(text: string): SilabaConRasgos[] {
  const elementos = leer(typeof text === "string" ? text : "");
  const letras = (s: Silaba): Rasgos[] => letrasDe(s.texto).map((l) => rasgos(l.texto));
  const salida: SilabaConRasgos[] = [];
  let anterior: Silaba | undefined;
  elementos.forEach((e, k) => {
    if (e.tipo !== "silaba") {
      // un «_» alarga la última sílaba (los que van antes de la primera no tienen a quién alargar)
      const ultima = salida[salida.length - 1];
      if (ultima) ultima.melismas++;
      return;
    }
    const sig = elementos[k + 1];
    // de la primera sílaba ya se sabe (la palabra entera); de las demás, por sus letras
    const vocalAlEmpezar = e.inicio ? e.vocalAlEmpezar : empiezaPorVocal(letras(e));
    salida.push({
      texto: e.texto,
      abrePalabra: e.inicio,
      cierraPalabra: e.fin,
      sinalefa: sig?.tipo === "silaba" && seUnen(e, sig, true),
      hiato: !e.inicio && !!anterior && vocalAlEmpezar && acabaEnVocal(letras(anterior)),
      vocalAlEmpezar,
      melismas: 0,
      tonica: false,
    });
    anterior = e;
  });
  // La tónica de cada palabra (de abrePalabra a cierraPalabra).
  for (let k = 0; k < salida.length; ) {
    let f = k + 1;
    while (f < salida.length && !salida[f - 1]!.cierraPalabra && !salida[f]!.abrePalabra) f++;
    const rs = salida.slice(k, f).map((s) => letrasDe(s.texto).map((l) => rasgos(l.texto)));
    const conTilde = rs.findIndex((r) => r.some((x) => esVocal(x.base) && x.tilde));
    let t: number;
    if (conTilde >= 0) t = conTilde;
    else if (f - k === 1) t = ATONAS.has(rs[0]!.map((x) => x.base).join("")) ? -1 : 0;
    else {
      const ultima = rs[rs.length - 1]!.at(-1)?.base ?? "";
      t = esVocal(ultima) || ultima === "n" || ultima === "s" ? f - k - 2 : f - k - 1;
    }
    if (t >= 0) salida[k + t]!.tonica = true;
    k = f;
  }
  return salida;
}

/** Recorre el texto y saca sílabas y melismas, con lo necesario para decidir la sinalefa. */
function leer(text: string, auto = true): Elemento[] {
  const elementos: Elemento[] = [];
  let sigue = false; // la próxima sílaba es de la misma palabra (había un guion)
  let prefijo = ""; // signos que esperan a la próxima sílaba («¿», «¡», «(»…)
  let cortePendiente = false; // y si alguno de ellos corta la sinalefa

  const ultimaSilaba = (): Silaba | undefined => {
    for (let k = elementos.length - 1; k >= 0; k--) {
      const e = elementos[k]!;
      if (e.tipo === "silaba") return e;
    }
    return undefined;
  };

  // Lo que venga después es otra sílaba de la misma palabra.
  const seguirPalabra = (): void => {
    const u = ultimaSilaba();
    if (u) u.fin = false;
    sigue = true;
  };

  // Signos sin letras: van con la sílaba anterior; los de apertura (y lo que venga
  // detrás de ellos, para no cambiar el orden), con la siguiente.
  const pegarSignos = (signos: string): void => {
    const corta = CORTAN.test(signos);
    const u = ultimaSilaba();
    if (u && !prefijo && !SOLO_APERTURA.test(signos)) {
      u.texto += signos;
      if (corta) u.corteDespues = true;
    } else {
      prefijo += signos;
      if (corta) cortePendiente = true;
    }
  };

  // Un trozo de palabra: se separa con las reglas (`partir`) o va entero, como lo partió la persona.
  const anadir = (trozo: string, partir: boolean): void => {
    const letras = letrasDe(trozo);
    const conCifras = /\p{N}/u.test(trozo); // «2», «15»: no sabemos cómo se leen; van enteras
    if (letras.length === 0 && !conCifras) {
      pegarSignos(trozo);
      return;
    }
    const partes = partir && !conCifras ? cortarTrozo(trozo, letras) : [trozo];
    const rasgosLetras = letras.map((l) => rasgos(l.texto));
    const antes = /^[^\p{L}\p{N}]*/u.exec(trozo)?.[0] ?? "";
    const despues = /[^\p{L}\p{M}\p{N}]*$/u.exec(trozo)?.[0] ?? "";
    const ultimo = partes.length - 1;
    partes.forEach((parte, k) => {
      elementos.push({
        tipo: "silaba",
        texto: k === 0 ? prefijo + parte : parte,
        inicio: k === 0 && !sigue,
        fin: k === ultimo,
        vocalAlEmpezar: k === 0 && !conCifras && empiezaPorVocal(rasgosLetras),
        vocalAlAcabar: k === ultimo && !conCifras && acabaEnVocal(rasgosLetras),
        corteAntes: k === 0 && (cortePendiente || CORTAN.test(antes)),
        corteDespues: k === ultimo && CORTAN.test(despues),
        unida: false,
      });
    });
    prefijo = "";
    cortePendiente = false;
    sigue = false;
  };

  const limpio = text
    .normalize("NFC")
    .replace(/[​﻿]/gu, " ")
    // «hola,adiós» → «hola, adiós»: un signo que cierra con una letra pegada detrás son dos palabras.
    // La barra también separa palabras («amor/odio», «y/o»), pero no corta la sinalefa.
    .replace(/(\p{L}[,.;:?!…—–/]+)(?=[\p{L}¿¡«“"‘(])/gu, "$1 ")
    .replace(/(\p{L})([¿¡])/gu, "$1 $2");

  // Saltos de línea y espacios repetidos cuentan como un espacio. Un guion suelto, entre espacios, parte una palabra
  // tras una sílaba suelta («Can - ta», como se copia de una partitura); tras una palabra de más de una sílaba es una
  // pausa («hola - adiós»: dos palabras), y al empezar una línea, una raya de diálogo: se salta. (Como `palabrasDeTexto`
  // en lyricsAlign.ts.)
  for (const linea of limpio.split(/\r\n|[\n\r\p{Zl}\p{Zp}]/u)) {
    let silabasAntes = -1; // sílabas del último bloque con letras de la línea (−1: aún no ha salido ninguno)
    for (const bloque of linea.split(/\s+/u)) {
      if (SOLO_GUION.test(bloque) && (silabasAntes < 0 || silabasAntes > 1)) continue;
      let desde = elementos.length; // tras un «‿», cuenta solo la palabra que sigue («por - que‿a - mor»)
      let huboLetras = false; // ya salió alguna sílaba de este bloque
      let melismaDentro = false; // «Glo_ria»: el «_» queda entre dos trozos de la misma palabra
      for (const parte of bloque.split(/([_‿])/u)) {
        if (parte === MELISMA) {
          elementos.push({ tipo: "melisma" });
          if (huboLetras) melismaDentro = true;
          continue;
        }
        if (parte === SINALEFA) {
          const u = ultimaSilaba();
          if (u) u.unida = true;
          desde = elementos.length;
          huboLetras = false;
          melismaDentro = false;
          continue;
        }
        if (!parte) continue;
        const conLetras = /[\p{L}\p{N}]/u.test(parte);
        if (melismaDentro && conLetras) seguirPalabra();
        melismaDentro = false;
        const trozos = parte.split(GUION);
        if (trozos.length === 1) {
          anadir(parte, auto);
        } else {
          // La persona manda: cada trozo entre guiones es una sílaba.
          trozos.forEach((trozo, k) => {
            if (trozo) anadir(trozo, false);
            if (k < trozos.length - 1) seguirPalabra();
          });
        }
        if (conLetras) huboLetras = true;
      }
      if (/[\p{L}\p{N}]/u.test(bloque)) silabasAntes = elementos.slice(desde).filter((e) => e.tipo === "silaba").length;
    }
  }
  // Un signo de apertura al final del texto se queda con la última sílaba.
  if (prefijo) {
    const u = ultimaSilaba();
    if (u) u.texto += prefijo;
  }
  return elementos;
}

interface Letra {
  texto: string; // la letra con sus tildes
  desde: number; // posición en el trozo
  hasta: number;
}

function letrasDe(trozo: string): Letra[] {
  const letras: Letra[] = [];
  const re = /\p{L}\p{M}*/gu;
  for (let m = re.exec(trozo); m !== null; m = re.exec(trozo)) {
    letras.push({ texto: m[0], desde: m.index, hasta: m.index + m[0].length });
  }
  return letras;
}

/** Parte un trozo en sílabas. Los signos van con la sílaba en la que están. */
function cortarTrozo(trozo: string, letras: Letra[]): string[] {
  const partes: string[] = [];
  let desde = 0;
  for (const c of cortes(letras.map((l) => l.texto))) {
    let hasta = letras[c]!.desde;
    // un signo de apertura entre dos sílabas va con la segunda
    while (hasta > letras[c - 1]!.hasta && APERTURA.test(trozo.charAt(hasta - 1))) hasta--;
    partes.push(trozo.slice(desde, hasta));
    desde = hasta;
  }
  partes.push(trozo.slice(desde));
  return partes;
}

interface Rasgos {
  base: string; // la letra en minúscula y sin tilde
  tilde: boolean;
  dieresis: boolean;
}

function rasgos(letra: string): Rasgos {
  const d = letra.normalize("NFD").toLowerCase();
  const marcas = d.slice(1);
  return {
    base: d.charAt(0),
    tilde: /[̀-̂]/u.test(marcas),
    dieresis: marcas.includes("̈"),
  };
}

function esVocal(base: string): boolean {
  return base.length === 1 && "aeiou".includes(base);
}

/** Un sonido de la palabra: una vocal, una consonante o un dígrafo («ch», «ll», «rr», «tx», «qu», «gu»). */
interface Unidad {
  desde: number; // primera letra
  hasta: number; // letra siguiente a la última
  vocal: boolean;
  /** a, e, o, o una débil con tilde (í, ú): dos fuertes seguidas hacen hiato. */
  fuerte: boolean;
  /** Diéresis poética («süave», «ruïdo»): hace hiato con la vocal de al lado. */
  aislada: boolean;
  base: string;
}

function unidades(r: Rasgos[]): Unidad[] {
  const base = (k: number): string => r[k]?.base ?? "";
  const us: Unidad[] = [];
  let k = 0;
  while (k < r.length) {
    const b = base(k);
    const b1 = base(k + 1);
    const u: Unidad = { desde: k, hasta: k + 1, vocal: false, fuerte: false, aislada: false, base: b };
    if (
      (b === "c" && b1 === "h") ||
      (b === "l" && b1 === "l") ||
      (b === "r" && b1 === "r") ||
      (b === "t" && b1 === "x") // vasco, suena como «ch»: A-ran-txa, Ge-txo, e-txe-a
    ) {
      u.hasta = k + 2; // ch, ll, rr, tx: un solo sonido, no se parten
    } else if (
      (b === "q" || b === "g") &&
      b1 === "u" &&
      !r[k + 1]!.tilde &&
      !r[k + 1]!.dieresis &&
      (base(k + 2) === "e" || base(k + 2) === "i")
    ) {
      u.hasta = k + 2; // que, qui, gue, gui: la u no suena ni hace diptongo
    } else if (b === "y") {
      // ante vocal es consonante (ma-yo, ya); si no, suena «i» (rey, muy, Ley-re)
      if (!esVocal(b1)) {
        u.vocal = true;
        u.base = "i";
      }
    } else if (esVocal(b)) {
      const { tilde, dieresis } = r[k]!;
      // en «güe», «güi» la diéresis solo dice que la u suena; en otro sitio marca hiato
      u.aislada = dieresis && !(b === "u" && base(k - 1) === "g");
      u.fuerte = b === "a" || b === "e" || b === "o" || tilde || u.aislada;
      u.vocal = true;
    }
    us.push(u);
    k = u.hasta;
  }
  return us;
}

function hiato(a: Unidad, b: Unidad): boolean {
  // dos vocales iguales, con tilde o sin ella, van siempre aparte: chi-i-ta, fri-í-si-mo, le-er
  if (a.base === b.base) return true;
  if (a.aislada || b.aislada) return true;
  return a.fuerte && b.fuerte; // po-e-ta, pa-ís
}

/** pr, br, tr, dr, cr, kr, gr, fr, pl, bl, cl, kl, gl, fl: van juntas con la vocal siguiente. */
function inseparables(a: Unidad, b: Unidad): boolean {
  if (a.vocal || b.vocal || a.hasta - a.desde > 1 || b.hasta - b.desde > 1) return false;
  if (b.base === "r") return "pbtdckgf".includes(a.base);
  if (b.base === "l") return "pbckgf".includes(a.base); // «tl» y «dl» se separan: at-las
  return false;
}

/**
 * Tras el prefijo «sub-» (y en «abrogar»), la r con que empieza la base suena fuerte, como «rr»,
 * aunque se escriba sola: la b cierra la sílaba anterior y no hace grupo con ella
 * (sub-ra-yar, sub-ro-gar, sub-rei-no, ab-ro-gar). Devuelve la posición de esa r, o -1.
 * «subrepticio» y «subrepción» no se sienten como prefijadas y se dicen con r suave: su-brep-ti-cio.
 */
function rFuerteTrasPrefijo(bases: string): number {
  if (/^subr(?!ep[ct])/u.test(bases)) return 3;
  if (bases.startsWith("abrog")) return 2;
  return -1;
}

/** Posiciones (índices de letra) donde empieza cada sílaba, salvo la primera. */
function cortes(letras: string[]): number[] {
  const rs = letras.map(rasgos);
  const us = unidades(rs);
  const rFuerte = rFuerteTrasPrefijo(rs.map((r) => r.base).join(""));

  // 1) Núcleos: vocales seguidas que se cantan en la misma sílaba (diptongos, triptongos).
  const nucleos: Array<{ desde: number; hasta: number }> = []; // índices de unidad, ambos incluidos
  let i = 0;
  while (i < us.length) {
    if (!us[i]!.vocal) {
      i++;
      continue;
    }
    let desde = i;
    let fuerte = us[i]!.fuerte ? i : -1; // la vocal fuerte del núcleo que se está formando
    let j = i + 1;
    for (; j < us.length && us[j]!.vocal; j++) {
      const b = us[j]!;
      if (hiato(us[j - 1]!, b)) {
        nucleos.push({ desde, hasta: j - 1 });
        desde = j;
        fuerte = b.fuerte ? j : -1;
      } else if (b.fuerte) {
        if (fuerte >= 0) {
          // dos fuertes con débiles en medio («aia»): las débiles pasan a la segunda sílaba
          nucleos.push({ desde, hasta: fuerte });
          desde = fuerte + 1;
        }
        fuerte = j;
      }
    }
    nucleos.push({ desde, hasta: j - 1 });
    i = j;
  }

  // 2) Las consonantes entre dos núcleos: una va con la vocal siguiente; si hay más,
  //    la última (o las dos últimas si son un grupo como «pr» o «bl») va con la siguiente
  //    y el resto con la anterior: ca-sa, can-to, ha-blar, ins-tru-men-to, obs-tá-cu-lo.
  const res: number[] = [];
  for (let n = 1; n < nucleos.length; n++) {
    const inicio = nucleos[n]!.desde;
    const entre = inicio - nucleos[n - 1]!.hasta - 1;
    let ataque = Math.min(entre, 1);
    const segunda = us[inicio - 1]!;
    if (entre >= 2 && segunda.desde !== rFuerte && inseparables(us[inicio - 2]!, segunda)) ataque = 2;
    res.push(us[inicio - ataque]!.desde);
  }
  return res;
}

/** ¿La palabra empieza por un sonido de vocal que admite sinalefa? */
function empiezaPorVocal(r: Rasgos[]): boolean {
  if (r.length === 1 && r[0]!.base === "y") return true; // la conjunción «y»
  const k = r[0]?.base === "h" ? 1 : 0; // la h no suena
  const c = r[k];
  if (!c || !esVocal(c.base)) return false;
  // «hielo», «huevo»: la i o la u ante otra vocal suenan como consonante y no hay sinalefa
  const sig = r[k + 1];
  if ((c.base === "i" || c.base === "u") && !c.tilde && !c.dieresis && sig && esVocal(sig.base)) return false;
  return true;
}

/** ¿La palabra acaba en un sonido de vocal que admite sinalefa? */
function acabaEnVocal(r: Rasgos[]): boolean {
  if (r.length === 1 && r[0]!.base === "y") return true; // la conjunción «y»
  let k = r.length - 1;
  while (k > 0 && r[k]!.base === "h") k--; // «oh», «ah»: la h final no suena
  const c = r[k];
  if (!c) return false;
  if (esVocal(c.base)) return true;
  if (c.base === "y") {
    // tras consonante es la vocal de la sílaba («pony»); tras vocal («hoy», «rey», «muy»)
    // pasa a sonar como consonante ante la vocal siguiente (ho-yes) y no hay sinalefa
    const antes = r[k - 1];
    return !antes || !esVocal(antes.base);
  }
  return false;
}
