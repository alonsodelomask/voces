// Letra sacada de la grabación → una sílaba en cada nota de la melodía.
//
// Las notas ya están en su sitio exacto (salen de mezclar la partitura con la grabación). La letra llega de Whisper:
// palabras con un tiempo aproximado (±0,2-0,5 s), y algunas perdidas, mal oídas, repetidas o inventadas («Subtítulos
// realizados por…» al final). Si la persona corrige el texto, cada palabra hereda el tiempo de la que Whisper oyó en su
// sitio, y las que añade se reparten entre sus vecinas (`heredarTiempos`).
//
// `casarLetra` reparte las sílabas por las notas con una programación dinámica (como quien alinea dos textos): prueba
// todos los repartos posibles, suma lo que cuesta cada uno y se queda con el más barato.
//   - Tiempo: la primera sílaba de cada palabra quiere empezar cerca de cuando empieza a oírse, y la última nota de la
//     palabra quiere acabar cerca de cuando deja de oírse (con más holgura; y ninguna de sus sílabas debe pasarse de
//     ahí, para que quitar la última o llevarla lejos no salga a cuenta). Cuesta el cuadrado de la distancia en σ,
//     con un tope, para que una palabra muy mal situada no arrastre a las demás. Whisper no dice dónde empieza cada
//     sílaba de en medio: se reparte el tiempo de la palabra (más para la tónica y la última de una frase), pero solo
//     para desempatar, con un tope menor que lo que cuesta una nota de melisma (salvo si la palabra se oyó lejos de
//     todas las notas: entonces cuenta entero). Las palabras supuestas (las que añadió la persona) no cuentan con
//     tiempo: van entre sus vecinas, por la música.
//   - Desfase: Whisper puede oírlo todo un poco tarde o pronto, y cada trozo que escucha (hasta 28 s) con el suyo. Las
//     anclas (palabra que abre línea ↔ primera nota tras un silencio) lo miden; se hace una primera pasada, más
//     holgada, sin desfase y otra con el de las anclas, se sigue con la que encaja mejor y con ella se afina el de cada
//     tramo, aparte para las palabras que empiezan por consonante y por vocal, y el de los finales. σ sale de las anclas.
//   - Melisma: alargar una sílaba a la nota siguiente cuesta poco, y seguir alargándola menos (un melisma largo es más
//     normal que dos cortos); menos aún en la última nota de una frase, en una sílaba tónica y en una nota corta; si la
//     nota viene tras un silencio, mucho. Sin límite de notas. Los «_» que escribe la persona dicen cuántas notas más
//     lleva la sílaba.
//   - Dos sílabas en una nota: poco con sinalefa («se‿a»), y no juntarlas cuando la admiten también cuesta (cantando,
//     lo normal es juntarlas); algo más si hacen hiato dentro de su palabra («poe-ta»), y si no, mucho en lo que da
//     Whisper tal cual y nunca en la letra de la persona (lo que no cabe se quita: metido a presión, empujaría a las
//     demás fuera de su nota).
//   - Líneas: la palabra que abre una línea va tras un silencio de la melodía (más seguro cuantas más líneas haya para
//     las frases de la melodía; y lo paga igual si va en la nota de la anterior), y tras un silencio largo empieza una
//     línea; una sílaba que no abre su palabra no va justo tras un silencio.
//   - Dejar una nota sin letra (sin alargar la anterior), o una frase entera (mejor antes o después de la letra que en
//     medio), o una sílaba sin nota se puede, pagando. Quitar una sílaba de la letra que ha escrito la persona cuesta
//     más que una que solo ha oído Whisper; y de esa letra, más si se oyó donde canta esta voz que si no se oyó (una
//     cabecera, una línea de más) o se oyó lejos de sus notas (lo canta otra voz, o se lo inventa Whisper). Una línea
//     entera que se ve que sobra (sin oír y sin sitio entre lo oído, o oída donde esta voz calla) cuesta como lo de
//     Whisper.
// Sin tiempos (NaN) funciona igual, guiándose solo por lo demás. Con tiempos, cada sílaba solo mira las notas que
// empiezan a ±5 s del suyo (o entre las de sus vecinas), para que vaya rápido.
//
// Lo que sale para cada nota es lo que va en `Note.lyric` (como en `splitSyllables`): «cer-» si la palabra sigue en
// otra nota, «se‿a» si van dos sílabas de palabras distintas, «vor» si cierra la palabra, y nada en las notas que
// alargan la sílaba anterior o que no llevan letra. Las dudosas son las notas que conviene que la persona mire.

import { SINALEFA, silabasConRasgos, type SilabaConRasgos } from './lyrics';

/** Una palabra con el tiempo en que se oye. */
export interface PalabraTiempo {
  /** La palabra con sus signos: «calle,». */
  texto: string;
  /** Segundos de la canción en que empieza y en que acaba de oírse (NaN si no se sabe). */
  a: number;
  b: number;
  /** Abre línea: en el texto corregido, tras un salto de línea; en lo que da Whisper, al empezar un segmento. */
  abreLinea?: boolean;
  /** Su tiempo no lo oyó Whisper: se ha supuesto entre sus vecinas (es una palabra que añadió la persona). */
  supuesta?: boolean;
  /** Está seguro en la letra (la ha escrito o la ha dejado la persona): solo se descarta si no cabe. Sin decirlo, lo
   *  están las que no traen tiempo o lo traen supuesto; las que da Whisper tal cual, no (se las puede inventar). */
  segura?: boolean;
}

/** Una nota de la melodía, en segundos de la canción. Van en orden. */
export interface NotaTiempo {
  ini: number;
  fin: number;
  /** Ligada a la anterior: es el mismo sonido, así que sigue con la sílaba de la anterior y no puede llevar otra. */
  ligada?: boolean;
}

/** Dónde ha ido a parar una sílaba. */
export interface SilabaColocada {
  /** La sílaba con sus signos y sin guion: «cér», «sa,». */
  texto: string;
  /** Índice de su palabra en las palabras que se han casado. */
  palabra: number;
  /** Nota en la que empieza (−1 si se ha descartado). */
  nota: number;
  /** Cuánto más costaría el mejor reparto con esta sílaba en otro sitio (o descartada): cuanto menos, más dudosa. */
  margen: number;
}

export interface Colocacion {
  /** Lo que va en `Note.lyric` de cada nota: «cer-» si la palabra sigue en otra nota, «se‿a» si van dos sílabas de
   *  palabras distintas (sinalefa), «vor» si cierra la palabra; nada si la nota alarga la sílaba anterior (melisma) o
   *  no lleva letra. */
  porNota: (string | undefined)[];
  /** Por nota: dónde conviene que la persona mire (`Note.lyricDoubt`, en ámbar). */
  dudosas: boolean[];
  /** Palabras o sílabas que no se han podido colocar, en orden. */
  descartadas: string[];
  /** Cada sílaba, en orden: de qué palabra es y en qué nota ha caído. */
  silabas: SilabaColocada[];
  /** Lo medido: σ (s) del comienzo de cada palabra y desfase (s, nota − Whisper, el más habitual en la canción) de las
   *  palabras que empiezan por consonante y de las que empiezan por vocal. */
  medidas: { sigma: number; desfaseConsonante: number; desfaseVocal: number };
}

/** Los costes y medidas de `casarLetra`. Los costes están en la misma escala que el de tiempo: ((nota − sílaba)/σ)². */
export interface AjustesCasar {
  /** Dejar sin nota una sílaba que solo ha oído Whisper (se la pudo inventar)… */
  quita: number;
  /** …y una de la letra que ha escrito o dejado la persona (`segura`): está en la canción, así que solo se quita si no
   *  cabe. Es más que los dos topes de tiempo (comienzo y final) y un melisma, para que un tiempo malo no la tire. Si
   *  se oyó, cuesta además lo que vale su tiempo en la nota más cercana (hasta `tope`): si sobra letra, se quita antes
   *  lo que no se oyó, o lo que se oyó lejos de las notas, que lo que se canta aquí. */
  quitaSegura: number;
  /** Dejar una nota sin sílaba y sin alargar la anterior… */
  libre: number;
  /** …o una frase entera (las notas entre dos silencios largos) en medio de la letra, o antes o después de ella (una
   *  introducción, un final, un «uh» del coro: es lo más normal). */
  fraseLibre: number;
  fraseLibreBorde: number;
  /** σ (s) del comienzo de cada palabra: `sigmaPorAnclas` × la dispersión (MAD) de las anclas, entre estos dos
   *  límites; con menos de `minAnclas` anclas, `sigmaMin`. */
  sigmaMin: number;
  sigmaMax: number;
  sigmaPorAnclas: number;
  /** El final de cada palabra va con σ × esto, y su coste con este tope. */
  factorFin: number;
  topeFin: number;
  /** Las demás sílabas de cada palabra quieren empezar donde les toca si el tiempo de la palabra se reparte entre sus
   *  sílabas (con `pesoTonica` más para la tónica y `pesoFinal` más para la última si cierra frase: duran más), con
   *  σ × `factorDentro` y un tope de `topeDentro`. Whisper no dice dónde empieza cada sílaba, así que es poco: solo
   *  desempata, y no puede llevarse un melisma a otra sílaba (0: sin coste). */
  factorDentro: number;
  topeDentro: number;
  pesoTonica: number;
  pesoFinal: number;
  /** Tope del coste de tiempo del comienzo de una palabra. */
  tope: number;
  /** Alargar una sílaba a una nota más (melisma), y a cada una de las siguientes (un melisma largo es más normal que
   *  dos cortos en sílabas seguidas)… */
  melisma: number;
  melismaSigue: number;
  /** …y además, si esa nota viene tras un silencio. */
  silencio: number;
  /** …y esto menos si esa nota es la última antes de un silencio: al final de la frase es donde más se alarga… */
  melismaFinal: number;
  /** …y esto menos si la sílaba es la tónica de su palabra: «A-le-lu-u-u-ya», «Glo-o-o-ria». */
  melismaTonica: number;
  /** El melisma cuesta más en notas largas y menos en las cortas: × (duración / la mediana)^esto, entre ½ y 2. */
  melismaDuracion: number;
  /** Una nota de un melisma que ha marcado la persona («lu-_-_»), y dejarla sin poner. */
  marca: number;
  quitaMarca: number;
  /** Dos sílabas en una nota: con sinalefa, con hiato dentro de su palabra (sinéresis) y sin nada de eso (esto último,
   *  solo en lo que da Whisper tal cual: de la letra de la persona, lo que no cabe se quita). */
  sinalefa: number;
  /** Y no juntar dos sílabas que admiten sinalefa: cantando, lo normal es juntarlas. */
  noSinalefa: number;
  sineresis: number;
  junta: number;
  /** Una sílaba que no abre su palabra, justo tras un silencio. */
  corte: number;
  /** La palabra que abre una línea, en una nota que no va tras un silencio; o, tras un silencio largo, una sílaba que
   *  no abre línea (una respiración a media línea). Solo cuenta si las palabras traen líneas. Lo primero va de `frase`
   *  a `fraseMax` según la proporción de líneas que no caben una por frase de la melodía: si hay tantas líneas como
   *  frases, casi seguro van una con otra. (Solo si las líneas son de la persona: las de Whisper son trozos que oye.) */
  frase: number;
  fraseMax: number;
  /** Como mucho, sílabas en una nota (cuatro en sinalefa caben: «co-mo‿y‿o‿a-mi-go»). */
  maxSilabas: number;
  /** Segundos entre dos notas a partir de los que hay un silencio, y un silencio largo (de fin de frase). */
  hueco: number;
  huecoLargo: number;
  /** Cada sílaba con tiempo solo mira las notas que empiezan a menos de esto (s) de él. */
  banda: number;
  /** Ancla: palabra que abre línea y cae a menos de esto (s) de la primera nota tras un silencio largo. */
  anclaMax: number;
  minAnclas: number;
  /** El desfase de cada palabra se mide con lo que hay a menos de esto (s) de ella (lo que Whisper escucha de una
   *  vez), si se aparta del de toda la canción más de `umbralTramo` (s); si no, vale el de toda la canción. */
  ventana: number;
  umbralTramo: number;
  /** Primera pasada, para afinar los desfases: σ × esto. Las diferencias de más de `desfaseMax` (s) con lo que dicen
   *  las anclas no cuentan, y hacen falta al menos `minDesfases` para medir uno. */
  holgura: number;
  desfaseMax: number;
  minDesfases: number;
  /** Una sílaba es dudosa si ponerla en otro sitio, o quitarla, costaría menos de esto de más. */
  duda: number;
}

/** Los ajustes recomendados (probados con canciones simuladas y de coro: ver scripts/lyricsAlign.test.mjs). */
export const AJUSTES_CASAR: AjustesCasar = Object.freeze({
  quita: 3,
  quitaSegura: 10,
  libre: 2,
  fraseLibre: 3,
  fraseLibreBorde: 1.5,
  sigmaMin: 0.5,
  sigmaMax: 0.8,
  sigmaPorAnclas: 1.5,
  factorFin: 2,
  topeFin: 3,
  factorDentro: 2,
  topeDentro: 0.5,
  pesoTonica: 0.5,
  pesoFinal: 1,
  tope: 6,
  melisma: 0.6,
  melismaSigue: 0.3,
  silencio: 3,
  melismaFinal: 0.3,
  melismaTonica: 0.15,
  melismaDuracion: 1,
  marca: 0.05,
  quitaMarca: 1.5,
  sinalefa: 0.4,
  noSinalefa: 0.4,
  sineresis: 1.5,
  junta: 4,
  corte: 2,
  frase: 2.5,
  fraseMax: 5,
  maxSilabas: 4,
  hueco: 0.12,
  huecoLargo: 0.3,
  banda: 5,
  anclaMax: 1.5,
  minAnclas: 4,
  ventana: 15,
  umbralTramo: 0.15,
  holgura: 1.6,
  desfaseMax: 0.8,
  minDesfases: 3,
  duda: 0.5,
});

// ───────────────────────────── Texto corregido ─────────────────────────────

/** Signos que, sueltos, van con la palabra siguiente. */
const SOLO_APERTURA = /^[¿¡«“‘‹(\[{]+$/u;
/** Un guion suelto, entre espacios: los mismos con los que la persona parte una palabra («-», «‐», «‑» y el blando). */
const SOLO_GUION = /^[-‐‑­]+$/u;

/**
 * Parte el texto en palabras. La primera de cada línea abre línea. Los signos sueltos («hola ,», «¿ qué») se pegan a
 * su palabra, para que cada palabra tenga al menos una letra o una cifra. Un guion suelto tras una palabra entera
 * («Canta - la noche») es una pausa y no se pega: pegado, la partiría a mano («Canta-», una sola sílaba). Tras una
 * sílaba suelta («Can - ta», como se copia de una partitura) sí, porque es lo que la parte (con lo oído, `heredarTiempos`
 * lo decide: «ven - ya» puede ser una pausa). Al empezar una línea («- hola amigo», una raya de diálogo) no hay nada que
 * partir: se salta.
 */
export function palabrasDeTexto(texto: string): { texto: string; abreLinea: boolean }[] {
  return trocear(texto).map((p) => ({ texto: p.texto, abreLinea: p.abreLinea }));
}

/** Una palabra del texto, y si lleva pegado un guion suelto tras ella: lo que era antes de pegárselo («ven» en «ven -
 *  ya», que puede ser «venya» partida o una pausa entre «ven» y «ya»). */
interface Trozo {
  texto: string;
  abreLinea: boolean;
  antesDelGuion?: string;
}

function trocear(texto: string): Trozo[] {
  const salida: Trozo[] = [];
  for (const linea of String(texto ?? '').split(/\r\n|[\n\r\p{Zl}\p{Zp}]/u)) {
    let prefijo = ''; // signos que esperan a la palabra siguiente
    let primera = true; // aún no ha salido ninguna palabra en esta línea
    for (const trozo of linea.split(/\s+/u)) {
      if (!trozo) continue;
      if (/[\p{L}\p{N}]/u.test(trozo)) {
        salida.push({ texto: prefijo + trozo, abreLinea: primera });
        prefijo = '';
        primera = false;
      } else if (SOLO_GUION.test(trozo) && (primera || silabasConRasgos(salida[salida.length - 1]!.texto.split(SINALEFA).pop()!).length > 1)) {
        // «Canta - la»: el guion separa, como un espacio; «- hola», raya de diálogo. Tras un «‿» cuenta solo la palabra
        // que sigue: en «por - que‿a - mor», «a - mor» sigue siendo una palabra partida.
        continue;
      } else if (!primera && !SOLO_APERTURA.test(trozo)) {
        const ultima = salida[salida.length - 1]!;
        if (SOLO_GUION.test(trozo)) ultima.antesDelGuion ??= ultima.texto; // «Can - ta»
        ultima.texto += trozo; // «hola ,» → «hola,»
      } else {
        prefijo += trozo; // «¿ qué» → «¿qué»; también lo suelto al empezar la línea
      }
    }
    // signos al final de una línea (o una línea solo de signos): con la última palabra
    if (prefijo && salida.length) salida[salida.length - 1]!.texto += prefijo;
  }
  return salida;
}

/** La palabra para comparar: en minúsculas, sin tildes y sin signos. */
function normal(palabra: string): string {
  return String(palabra ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Cómo suena, más o menos: sin la h muda y sin distinguir b y v, ll e y, c, z y s, qu y k, g y j… Así «vidar» y
 *  «bidar», u «hoy» y «oi», son la misma palabra para Whisper. */
function clave(palabra: string): string {
  const n = normal(palabra);
  const s = n
    .replace(/ch/g, 'C')
    .replace(/h/g, '')
    .replace(/v/g, 'b')
    .replace(/w/g, 'u')
    .replace(/ll/g, 'y')
    .replace(/rr/g, 'r')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/q/g, 'k')
    .replace(/gu(?=[ei])/g, 'G')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/G/g, 'g')
    .replace(/c(?=[ei])/g, 's')
    .replace(/z/g, 's')
    .replace(/c/g, 'k')
    .replace(/y(?![aeiou])/g, 'i')
    .replace(/C/g, 'ch');
  return s || n;
}

/** Distancia de edición entre dos palabras, de 0 (iguales) a 1 (nada que ver). */
function distancia(x: string, y: string): number {
  if (x === y) return 0;
  const m = x.length;
  const n = y.length;
  if (!m || !n) return 1;
  let prev = new Int32Array(n + 1);
  let cur = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = prev[j - 1]! + (x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? 0 : 1);
      cur[j] = Math.min(c, prev[j]! + 1, cur[j - 1]! + 1);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]! / Math.max(m, n);
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1]! : 0;
};

/** Emparejar dos trozos que se parecen `d` (0-1) cuesta 3·d: más allá de 2/3 sale más barato no emparejarlos (2). */
const CAMBIO = 3;
/** Que Whisper parta o junte palabras («con vidar», «demi»): un poco más que emparejarlas una a una. */
const BLOQUE = 0.1;
/** …y solo si ninguna casa ya sola, con un coste de menos de esto (que se parezcan un 75 %). */
const PARTIDA = CAMBIO * 0.25;
/** Dos palabras seguidas de una línea con más de este hueco (s) entre lo que oyó Whisper de cada una: seguramente falta
 *  algo en medio (una vuelta de «Aleluya» que no oyó). Cuesta poco: solo decide entre repartos que empatan. */
const HUECO_SOSPECHOSO = 1.5;
/** Un tramo de palabras emparejadas, con palabras sin pareja al lado, con menos de esto de letras que casan: no se fía
 *  de él («la» oída en un mar de «la la la»). */
const TRAMO_MIN = 5;
/** Saltarse una palabra del texto que no cabe antes de lo primero que oyó Whisper (o después de lo último, o entre dos
 *  palabras oídas). */
const SIN_SITIO = 0.5;
/** Lo menos que dura una sílaba cantada (s): para ver si lo que queda sin pareja cabe entre dos palabras oídas. */
const SILABA_MIN = 0.15;
/** Sílabas unidas por guiones sueltos («Can - ta») que casan con una palabra oída: se parecen en más de un 75 %. */
const CASA_OIDA = 0.25;
/** Y como mucho cuántas se prueban a unir en una palabra. */
const MAX_UNIDAS = 8;
/** Al emparejar con una sola de dos líneas iguales seguidas, lo que puede repartir peor lo que queda sin pareja: una
 *  nota que cae a un lado u otro del borde de un hueco cambia el `desajuste` en 2 (ver `juntarRepetidas`). */
const MARGEN_REPETIDAS = 2;

/** Un tramo emparejado: las palabras [i0, i1) del texto con las oídas [j0, j1). */
interface Bloque {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

/**
 * El texto de cada palabra de `trozos` con los guiones sueltos tras una sílaba suelta decididos con lo oído. «Can -
 * ta», como se copia de una partitura, es una palabra partida; pero «ven - ya amigo» o «yo - te quiero» son dos palabras
 * con una pausa. Se pegan solo si juntas casan con una palabra que oyó Whisper por ahí (entre la última oída emparejada
 * antes y la primera después: `bloques` empareja [i0, i1) del texto con [j0, j1) de lo oído); si no, cada una va aparte,
 * sin el guion. Si por ahí no se oyó nada, se quedan pegadas, como sin lo oído.
 */
function guionesSueltos(trozos: Trozo[], clavesOidas: string[], bloques: Bloque[]): string[] {
  const textos = trozos.map((t) => t.texto);
  const m = trozos.length;
  const n = clavesOidas.length;
  // La última oída de un bloque que acaba en la palabra r o antes, y la primera de uno que empieza en r o después.
  const hasta = new Int32Array(m).fill(-1);
  const desde = new Int32Array(m).fill(n);
  for (const b of bloques) {
    hasta[b.i1 - 1] = Math.max(hasta[b.i1 - 1]!, b.j1 - 1);
    desde[b.i0] = Math.min(desde[b.i0]!, b.j0);
  }
  for (let r = 1; r < m; r++) hasta[r] = Math.max(hasta[r]!, hasta[r - 1]!);
  for (let r = m - 2; r >= 0; r--) desde[r] = Math.min(desde[r]!, desde[r + 1]!);
  const sinGuion = (r: number): void => {
    const t = trozos[r]!;
    if (t.antesDelGuion !== undefined) textos[r] = t.antesDelGuion + t.texto.slice(t.antesDelGuion.length).replace(/[-‐‑­]/gu, '');
  };
  // De cada unión ya probada, las oídas (en orden) con las que casa.
  const conQuien = new Map<string, number[]>();
  const casanCon = (c: string): number[] => {
    let js = conQuien.get(c);
    if (!js) {
      js = [];
      for (let j = 0; j < n; j++) {
        const o = clavesOidas[j]!;
        if (Math.abs(o.length - c.length) < CASA_OIDA * Math.max(o.length, c.length) && distancia(c, o) < CASA_OIDA) js.push(j);
      }
      conQuien.set(c, js);
    }
    return js;
  };
  for (let i0 = 0; i0 < m; ) {
    if (trozos[i0]!.antesDelGuion === undefined) {
      i0++;
      continue;
    }
    // La cadena i0…i1: cada una pegada a la siguiente por un guion suelto (la última, sin él, salvo al final del texto).
    let i1 = i0;
    while (i1 + 1 < m && trozos[i1]!.antesDelGuion !== undefined) i1++;
    const lo = i0 > 0 ? hasta[i0 - 1]! + 1 : 0;
    const hi = i1 + 1 < m ? desde[i1 + 1]! - 1 : n - 1;
    if (lo <= hi) {
      const casa = (s: number, e: number): boolean => {
        let u = '';
        for (let r = s; r <= e; r++) u += trozos[r]!.texto;
        const js = casanCon(clave(u));
        const k = cuantos(js, lo, false); // la primera desde `lo`
        return k < js.length && js[k]! <= hi;
      };
      // De izquierda a derecha, la unión más larga que casa con algo oído. Solo se separa donde lo de antes y lo de
      // después casan cada uno con algo oído: lo que no casa con nada (Whisper lo oyó mal, «no - che» oída «nube») se
      // queda pegado, como sin lo oído, para no partir una palabra de una partitura copiada.
      const tramos: { e: number; casa: boolean }[] = [];
      for (let s = i0; s <= i1; ) {
        let e = Math.min(i1, s + MAX_UNIDAS - 1);
        while (e > s && !casa(s, e)) e--;
        tramos.push({ e, casa: e > s || casa(s, s) });
        s = e + 1;
      }
      for (let t = 0; t + 1 < tramos.length; t++) if (tramos[t]!.casa && tramos[t + 1]!.casa) sinGuion(tramos[t]!.e);
    }
    i0 = i1 + 1;
  }
  return textos;
}

/**
 * Una línea escrita dos veces seguidas (que se canta una vez, o que Whisper oyó una vez) y emparejada a trozos: lo
 * primero con la primera y lo último con la segunda. Así ninguna de las dos se queda entera sin pareja, y no se ve que
 * una sobra (`sobrantes`, en `casarLetra`). Si se puede (lo emparejado de la primera va antes que lo de la segunda), se
 * empareja todo con una de las dos: la que reparte mejor lo que queda sin pareja (`desajuste`), si no lo reparte peor
 * que antes (con `MARGEN_REPETIDAS`). Una línea cantada dos veces y oída a trozos en cada una casi nunca se junta,
 * porque lo que queda sin pareja de la primera ya no cabe en su hueco y el desajuste sube; pero si empata, sí (en el
 * simulador, tantas veces acierta como falla).
 */
function juntarRepetidas(bloques: Bloque[], nuevas: Trozo[], x: string[], desajuste: (bs: Bloque[]) => number): Bloque[] {
  const m = nuevas.length;
  const inicios: number[] = [];
  for (let i = 0; i < m; i++) if (i === 0 || nuevas[i]!.abreLinea) inicios.push(i);
  inicios.push(m);
  let actual = bloques;
  let base = desajuste(actual);
  for (let l = 0; l + 2 < inicios.length; l++) {
    const a0 = inicios[l]!;
    const b0 = inicios[l + 1]!;
    const largo = b0 - a0;
    if (inicios[l + 2]! - b0 !== largo) continue;
    let iguales = true;
    for (let u = 0; u < largo && iguales; u++) iguales = x[a0 + u] === x[b0 + u];
    if (!iguales) continue;
    // De cada palabra de las dos, su bloque (solo de una palabra con una; con otros, se dejan como están).
    const deA = new Array<number>(largo).fill(-1);
    const deB = new Array<number>(largo).fill(-1);
    let otros = false;
    actual.forEach((b, h) => {
      if (b.i1 <= a0 || b.i0 >= b0 + largo) return;
      if (b.i1 - b.i0 !== 1 || b.j1 - b.j0 !== 1 || b.i0 < a0) otros = true;
      else if (b.i0 < b0) deA[b.i0 - a0] = h;
      else deB[b.i0 - b0] = h;
    });
    if (otros) continue;
    const enA = deA.flatMap((h, u) => (h >= 0 ? [u] : []));
    const enB = deB.flatMap((h, u) => (h >= 0 ? [u] : []));
    if (!enA.length || !enB.length || enA[enA.length - 1]! >= enB[0]!) continue;
    let mejor: { bs: Bloque[]; des: number } | null = null;
    for (const [de, desde] of [
      [deB, a0],
      [deA, b0],
    ] as const) {
      const bs = actual.map((b, h) => {
        const u = de.indexOf(h);
        return u >= 0 ? { ...b, i0: desde + u, i1: desde + u + 1 } : b;
      });
      const des = desajuste(bs);
      if (des <= base + MARGEN_REPETIDAS + 1e-9 && (!mejor || des < mejor.des - 1e-9)) mejor = { bs, des };
    }
    if (mejor) {
      actual = mejor.bs;
      base = mejor.des;
    }
  }
  return actual;
}

/**
 * Lo que queda sin pareja del texto, en líneas enteras. La persona añade líneas enteras (una cabecera, una línea
 * repetida o que no se canta), no trozos de dos; pero si una palabra de más es igual a una oída al lado («y» al empezar
 * una línea que no se canta y «y» al empezar la siguiente), emparejar una u otra cuesta lo mismo, y la que se queda sin
 * pareja puede partir dos líneas: la de más ya no se ve entera sin oír (`sobrantes`). Si las palabras emparejadas justo
 * antes de un tramo sin pareja son las mismas que las últimas del tramo, se emparejan estas; o, al revés, las primeras
 * del tramo en vez de las de justo después. Se hace cuando así el tramo queda en líneas enteras y lo que queda sin pareja
 * no se reparte peor (`desajuste`); de las dos, la que lo reparte mejor, y si empatan, la que mueve menos palabras y la
 * que empareja antes.
 */
function enLineas(bloques: Bloque[], nuevas: Trozo[], x: string[], desajuste: (bs: Bloque[]) => number): Bloque[] {
  const m = nuevas.length;
  const abre = (i: number): boolean => i >= m || nuevas[i]!.abreLinea;
  let actual = bloques;
  let base = desajuste(actual);
  for (let k = 0; k <= actual.length; k++) {
    // el tramo sin pareja [r0, r1), entre los bloques k−1 y k
    const r0 = k > 0 ? actual[k - 1]!.i1 : 0;
    const r1 = k < actual.length ? actual[k]!.i0 : m;
    if (r1 <= r0 || (abre(r0) && abre(r1))) continue;
    const largo = r1 - r0;
    // los d bloques (de una palabra con una) que acaban en r0 pasan a acabar en r1, o los que empiezan en r1, a empezar
    // en r0: de cada lado, el menor d con el que el tramo queda en líneas enteras
    const opciones: { desde: number; d: number; paso: number }[] = [];
    for (let d = 1; d <= largo && k - d >= 0; d++) {
      const b = actual[k - d]!;
      if (b.i1 - b.i0 !== 1 || b.j1 - b.j0 !== 1 || b.i0 !== r0 - d || x[r0 - d] !== x[r1 - d]) break;
      if (abre(r0 - d) && abre(r1 - d)) {
        opciones.push({ desde: k - d, d, paso: largo });
        break;
      }
    }
    for (let d = 1; d <= largo && k + d - 1 < actual.length; d++) {
      const b = actual[k + d - 1]!;
      if (b.i1 - b.i0 !== 1 || b.j1 - b.j0 !== 1 || b.i0 !== r1 + d - 1 || x[r0 + d - 1] !== x[r1 + d - 1]) break;
      if (abre(r0 + d) && abre(r1 + d)) {
        opciones.unshift({ desde: k, d, paso: -largo });
        break;
      }
    }
    let mejor: { bs: Bloque[]; des: number; d: number } | null = null;
    for (const o of opciones) {
      const bs = actual.map((b, h) => (h >= o.desde && h < o.desde + o.d ? { ...b, i0: b.i0 + o.paso, i1: b.i1 + o.paso } : b));
      const des = desajuste(bs);
      if (des > base + 1e-9) continue;
      if (!mejor || des < mejor.des - 1e-9 || (des < mejor.des + 1e-9 && o.d < mejor.d)) mejor = { bs, des, d: o.d };
    }
    if (mejor) {
      actual = mejor.bs;
      base = mejor.des;
    }
  }
  return actual;
}

/**
 * Pasa los tiempos de lo que oyó Whisper (`transcritas`) al texto que ha corregido la persona. Casa las dos listas de
 * palabras con Needleman-Wunsch (en minúsculas, sin tildes ni signos, y por cómo suenan): emparejar dos palabras cuesta
 * lo que se diferencien (si se parecen poco, no se emparejan) y sobrar o faltar, 1. Whisper parte y junta palabras
 * («con vidar», «demi», «nasobre»): también se emparejan una con dos y dos con dos (si ninguna casa ya sola). Cada
 * palabra del texto toma el tiempo de la que casa con ella; la que la persona ha cambiado del todo en su sitio («noche»
 * → «luna», sola entre dos que casan), el de la que había.
 *
 * Con letras repetidas (estribillos, «Aleluya» cuatro veces, dos tomas) hay varios repartos igual de buenos. Se mira el
 * que empareja lo antes posible (deja sin pareja lo del final: Whisper se salta vueltas, o repite la última) y el que lo
 * hace lo más tarde posible, y gana el que deja lo que no tiene pareja donde cabe: entre dos palabras oídas, o antes de
 * la primera o después de la última, con al menos `SILABA_MIN` s por sílaba. Con `notas` (la melodía) se cuenta mejor:
 * tantas notas como sílabas; y entonces también se sabe si Whisper se saltó la primera vuelta, que sin ellas parece una
 * introducción. Además, dos palabras seguidas de una línea con mucho hueco entre lo que oyó de ellas cuestan un poco
 * (falta algo en medio). Un tramo corto emparejado entre palabras sin pareja («la» en un mar de «la la la») no se usa.
 * Y, si cuesta lo mismo, lo que queda sin pareja va en líneas enteras, como las añade la persona (`juntarRepetidas`,
 * `enLineas`): así `casarLetra` ve que sobran.
 *
 * Las que no casan con ninguna (las nuevas) se reparten entre sus vecinas según sus sílabas, con `supuesta: true`
 * (`casarLetra` no se fía de ese tiempo). Las líneas salen del texto. Todas salen con `segura: true`: son la letra de
 * la persona. Un guion suelto tras una sílaba suelta («Can - ta», «ven - ya») solo une si juntas casan con una palabra
 * oída por ahí (`guionesSueltos`).
 */
export function heredarTiempos(texto: string, transcritas: PalabraTiempo[], notas?: NotaTiempo[]): PalabraTiempo[] {
  const nuevas = trocear(texto);
  // lo que no tiene letras ni cifras («♪», «…») no es una palabra y no presta su tiempo a nadie
  const oidas = (Array.isArray(transcritas) ? transcritas : []).filter((p) => /[\p{L}\p{N}]/u.test(String(p?.texto ?? '')));
  const m = nuevas.length;
  const n = oidas.length;
  const x = nuevas.map((p) => clave(p.texto));
  const y = oidas.map((p) => clave(p.texto));
  const ta = oidas.map((p) => Number(p.a));
  const tb = oidas.map((p) => Number(p.b));
  const silabas = nuevas.map((p) => Math.max(1, silabasConRasgos(p.texto).length));
  const acum = [0];
  for (const k of silabas) acum.push(acum[acum.length - 1]! + k);
  // Con las notas se sabe cuánto se canta antes de lo primero que oyó Whisper y después de lo último: lo que se queda
  // sin pareja al principio o al final del texto tiene que caber ahí (así, si Whisper no oyó la primera vuelta de un
  // estribillo, lo que oyó va con la segunda).
  const inis = Array.isArray(notas) ? notas.map((q) => Number(q?.ini)).filter(Number.isFinite).sort((u, v) => u - v) : null;
  // Las notas que empiezan entre t0 y t1 (sin contarlas a ellas).
  const notasEntre = (t0: number, t1: number): number => (inis && t1 > t0 ? cuantos(inis, t1, false) - cuantos(inis, t0, true) : 0);
  // Donde acaba de oírse la palabra oída j (o empieza, si no se sabe).
  const finOida = (j: number): number => (Number.isFinite(tb[j]) ? tb[j]! : ta[j]!);
  let antes = Infinity;
  let despues = Infinity;
  if (inis && n > 0) {
    antes = inis.filter((t) => t < ta[0]! - 0.15).length;
    despues = inis.filter((t) => t > finOida(n - 1) - 0.05).length;
  }
  // Y entre cada dos palabras oídas, con los márgenes de `desajuste` (sin tiempos, no se sabe: caben todas).
  const enHueco = new Float64Array(n + 1).fill(Infinity);
  if (inis) for (let j = 1; j < n; j++) if (Number.isFinite(finOida(j - 1)) && Number.isFinite(ta[j])) enHueco[j] = notasEntre(finOida(j - 1) - 0.1, ta[j]! - 0.2);
  // Saltarse la palabra i del texto en la columna j: al principio, las 0…i tienen que caber antes de lo oído; al
  // final, las i…m−1 después; y entre dos palabras oídas, ella en las notas de ese hueco. Si no, saltarse ahí las
  // palabras de más saldría gratis, y dejar sin pareja la primera o la última palabra oída para llevarlas a un hueco
  // sin notas costaría lo mismo o menos que dejarlas en su sitio (antes o después de lo oído).
  const sinSitio = (i: number, j: number): number => {
    if (j === 0 && acum[i + 1]! > antes + 1) return SIN_SITIO;
    if (j === n && acum[m]! - acum[i]! > despues + 1) return SIN_SITIO;
    if (j > 0 && j < n && silabas[i]! > enHueco[j]! + 1) return SIN_SITIO;
    return 0;
  };
  const memo = new Map<string, number>(); // las letras repiten mucho las mismas palabras
  const pares = new Float64Array(m * n).fill(NaN);
  // Emparejar la palabra r del texto con la oída k.
  const coste = (r: number, k: number): number => {
    let c = pares[r * n + k]!;
    if (c !== c) {
      const clave = `${x[r]} ${y[k]}`;
      const d = memo.get(clave);
      c = d ?? CAMBIO * distancia(x[r]!, y[k]!);
      if (d === undefined) memo.set(clave, c);
      pares[r * n + k] = c;
    }
    return c;
  };
  // Emparejar las palabras del texto i−di…i−1 con las oídas j−dj…j−1, como si fueran una sola.
  const bloque = (i: number, j: number, di: number, dj: number): number => {
    if (di === 1 && dj === 1) return coste(i - 1, j - 1);
    if (x[i - di]![0] !== y[j - dj]![0]) return Infinity; // partir o juntar no cambia cómo empieza
    // Las palabras de una letra («y», «a») no se parten ni se juntan: se las comería la vecina.
    for (let k = i - di; k < i; k++) if (x[k]!.length < 2) return Infinity;
    for (let k = j - dj; k < j; k++) if (y[k]!.length < 2) return Infinity;
    // Una con dos solo si ninguna de las dos casa ya sola con la otra: «y vuelven» no es «vuelven» partida.
    if (di === 2 && dj === 1 && (coste(i - 2, j - 1) < PARTIDA || coste(i - 1, j - 1) < PARTIDA)) return Infinity;
    if (di === 1 && dj === 2 && (coste(i - 1, j - 2) < PARTIDA || coste(i - 1, j - 1) < PARTIDA)) return Infinity;
    // Dos con dos, si ninguna pareja es ya casi igual («luna sobre» no es «noche sobre» mal partida).
    if (di === 2 && dj === 2 && (coste(i - 2, j - 2) < CAMBIO * 0.1 || coste(i - 1, j - 1) < CAMBIO * 0.1)) return Infinity;
    let u = '';
    for (let k = i - di; k < i; k++) u += x[k];
    let v = '';
    for (let k = j - dj; k < j; k++) v += y[k];
    // con largos muy distintos ya no compensa
    if (Math.abs(u.length - v.length) > 0.5 * Math.max(u.length, v.length)) return Infinity;
    // y que juntas se parezcan de verdad (saltarse tres o cuatro palabras cuesta tanto que casi todo saldría a cuenta)
    const d = distancia(u, v);
    return d <= 0.5 ? CAMBIO * d + BLOQUE : Infinity;
  };
  // El hueco entre la palabra oída j−1 y la j, si la del texto i no abre línea.
  const hueco = (i: number, j: number): number => {
    if (i <= 0 || j <= 0 || i >= m || j >= n || nuevas[i]!.abreLinea) return 0;
    const g = ta[j]! - tb[j - 1]!;
    return Number.isFinite(g) && g > HUECO_SOSPECHOSO ? Math.min(0.5, 0.25 * (g - HUECO_SOSPECHOSO)) : 0;
  };

  // Dos estados: el último paso emparejó (M) o se saltó una palabra (S). Con textos muy largos, solo cerca de la
  // diagonal. De cada estado se guardan dos caminos que empatan: el que empareja lo antes posible (deja sin pareja lo
  // del final) y el que lo hace lo más tarde posible.
  const ancho = n + 1;
  const total = (m + 1) * ancho;
  const DM = new Float64Array(total).fill(Infinity);
  const DS = new Float64Array(total).fill(Infinity);
  // paso: forma del bloque (1-4) o 1: sobra la del texto, 2: sobra la oída; + 8 si venía de M. [pronto, tarde]
  const pasoM = [new Uint8Array(total), new Uint8Array(total)];
  const pasoS = [new Uint8Array(total), new Uint8Array(total)];
  const FORMAS = [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ] as const;
  DS[0] = 0;
  const banda = Math.max(200, Math.abs(m - n) + 100);
  const cand: number[] = [];
  const cod: number[] = [];
  // De los candidatos (coste y paso), el mínimo, prefiriendo en un empate los que vienen de S (pronto) o de M (tarde).
  const elegir = (o: number, D: Float64Array, pasos: Uint8Array[]): void => {
    let mejor = Infinity;
    for (const c of cand) if (c < mejor) mejor = c;
    D[o] = mejor;
    if (mejor === Infinity) return;
    for (const tarde of [0, 1]) {
      let elegido = 0;
      for (let r = 0; r < cand.length; r++) {
        if (cand[r] !== mejor) continue;
        const deM = cod[r]! >= 8;
        if (!elegido || deM === !!tarde) elegido = cod[r]!;
        if (deM === !!tarde) break;
      }
      pasos[tarde]![o] = elegido;
    }
  };
  for (let i = 0; i <= m; i++) {
    const centro = m ? (i * n) / m : 0;
    const j0 = Math.max(0, Math.floor(centro - banda));
    const j1 = Math.min(n, Math.ceil(centro + banda));
    for (let j = j0; j <= j1; j++) {
      const o = i * ancho + j;
      if (o === 0) continue;
      // saltarse una palabra
      cand.length = cod.length = 0;
      if (i > 0) {
        const q = o - ancho;
        const c = 1 + sinSitio(i - 1, j);
        cand.push(DS[q]! + c, DM[q]! + c);
        cod.push(1, 9);
      }
      if (j > 0) {
        const q = o - 1;
        cand.push(DS[q]! + 1, DM[q]! + 1);
        cod.push(2, 10);
      }
      elegir(o, DS, pasoS);
      // emparejar un bloque
      cand.length = cod.length = 0;
      for (let f = 0; f < FORMAS.length; f++) {
        const [di, dj] = FORMAS[f]!;
        if (i < di || j < dj) continue;
        const q = o - di * ancho - dj;
        const desdeS = DS[q]!;
        const desdeM = DM[q]! + hueco(i - di, j - dj);
        if (desdeS === Infinity && desdeM === Infinity) continue;
        const c = bloque(i, j, di, dj);
        if (!(c < di + dj)) continue; // saltárselas todas sale igual o más barato
        cand.push(desdeS + c, desdeM + c);
        cod.push(f + 1, f + 9);
      }
      elegir(o, DM, pasoM);
    }
  }

  // Vuelta atrás desde el final. Bloques emparejados: [i0, i1) del texto con [j0, j1) de lo oído.
  const caminar = (tarde: number): Bloque[] => {
    const salida: Bloque[] = [];
    let enM = tarde ? DM[total - 1]! <= DS[total - 1]! : DM[total - 1]! < DS[total - 1]!;
    for (let i = m, j = n; i > 0 || j > 0; ) {
      const o = i * ancho + j;
      if (enM) {
        const p = pasoM[tarde]![o]!;
        const [di, dj] = FORMAS[(p & 7) - 1]!;
        salida.push({ i0: i - di, i1: i, j0: j - dj, j1: j });
        i -= di;
        j -= dj;
        enM = p >= 8;
      } else {
        const p = pasoS[tarde]![o]!;
        if ((p & 7) === 1) i--;
        else j--;
        enM = p >= 8;
      }
    }
    return salida.reverse();
  };
  // De los dos, el que mejor reparte lo que queda sin pareja: en cada hueco entre palabras emparejadas, sus sílabas
  // tienen que caber (con las notas: tantas notas como sílabas; sin ellas: al menos `SILABA_MIN` s por sílaba). Si
  // empatan, el que empareja antes.
  const desajuste = (bs: Bloque[]): number => {
    let suma = 0;
    let iAntes = 0;
    let tAntes = -Infinity;
    for (let k = 0; k <= bs.length; k++) {
      const b = bs[k];
      const iDespues = b ? b.i0 : m;
      const tDespues = b ? ta[b.j0]! : Infinity;
      const faltan = acum[iDespues]! - acum[iAntes]!;
      if (inis) suma += Math.abs(notasEntre(tAntes - 0.1, tDespues - 0.2) - faltan);
      else if (Number.isFinite(tAntes) || Number.isFinite(tDespues)) {
        const hueco = Number.isFinite(tAntes) && Number.isFinite(tDespues) ? tDespues - tAntes : Infinity;
        suma += Math.max(0, faltan * SILABA_MIN - Math.max(0, hueco));
      }
      if (b) {
        iAntes = b.i1;
        const fin = tb[b.j1 - 1]!;
        tAntes = Number.isFinite(fin) ? fin : ta[b.j1 - 1]!;
      }
    }
    return suma;
  };
  let bloques = caminar(0);
  if (n > 0) {
    const otro = caminar(1);
    if (desajuste(otro) < desajuste(bloques) - 1e-9) bloques = otro;
    // y lo que queda sin pareja, en líneas enteras si cuesta lo mismo
    bloques = enLineas(juntarRepetidas(bloques, nuevas, x, desajuste), nuevas, x, desajuste);
  }

  // Tramos de bloques seguidos (sin nada sin pareja en medio). Uno corto, con palabras sin pareja al lado, no se usa.
  const fiables = new Array<boolean>(bloques.length).fill(true);
  const emparejada = new Uint8Array(m);
  for (const b of bloques) for (let r = b.i0; r < b.i1; r++) emparejada[r] = 1;
  for (let k = 0; k < bloques.length; ) {
    let f = k + 1;
    while (f < bloques.length && bloques[f]!.i0 === bloques[f - 1]!.i1 && bloques[f]!.j0 === bloques[f - 1]!.j1) f++;
    const primero = bloques[k]!;
    const ultimo = bloques[f - 1]!;
    // aislado: las palabras del texto de al lado se han quedado sin pareja (o es un extremo del texto)
    const solaAntes = primero.i0 === 0 || !emparejada[primero.i0 - 1];
    const solaDespues = ultimo.i1 === m || !emparejada[ultimo.i1];
    if (solaAntes && solaDespues && (primero.i0 > 0 || ultimo.i1 < m)) {
      let letras = 0;
      for (let h = k; h < f; h++) {
        const b = bloques[h]!;
        let u = '';
        for (let r = b.i0; r < b.i1; r++) u += x[r];
        let v = '';
        for (let r = b.j0; r < b.j1; r++) v += y[r];
        letras += Math.max(u.length, v.length) * (1 - distancia(u, v));
      }
      if (letras < TRAMO_MIN) for (let h = k; h < f; h++) fiables[h] = false;
    }
    k = f;
  }

  const textos = n > 0 ? guionesSueltos(nuevas, y, bloques) : nuevas.map((p) => p.texto);
  const salida: PalabraTiempo[] = nuevas.map((p, i) => ({ texto: textos[i]!, a: NaN, b: NaN, abreLinea: p.abreLinea, supuesta: true, segura: true }));
  bloques.forEach((b, k) => {
    if (!fiables[k]) return;
    // Cada palabra del texto empieza donde cae su primera letra en lo oído (a partes iguales de letras).
    const largoTexto: number[] = [];
    let lt = 0;
    for (let r = b.i0; r < b.i1; r++) {
      largoTexto.push(lt);
      lt += Math.max(1, x[r]!.length);
    }
    const largos: number[] = [];
    let lo = 0;
    for (let r = b.j0; r < b.j1; r++) {
      largos.push(Math.max(1, y[r]!.length));
      lo += largos[largos.length - 1]!;
    }
    const tiempo = (pos: number): number => {
      // pos: letra de lo oído (0…lo); dentro de la palabra oída, a partes iguales entre su a y su b
      let acc = 0;
      for (let r = 0; r < largos.length; r++) {
        if (pos < acc + largos[r]! || r === largos.length - 1) {
          const a = ta[b.j0 + r]!;
          const fin = tb[b.j0 + r]!;
          const f = Math.min(1, Math.max(0, (pos - acc) / largos[r]!));
          return Number.isFinite(fin) && fin > a ? a + (fin - a) * f : a;
        }
        acc += largos[r]!;
      }
      return NaN;
    };
    for (let r = b.i0; r < b.i1; r++) {
      const p = salida[r]!;
      const desde = largoTexto[r - b.i0]!;
      p.a = r === b.i0 ? ta[b.j0]! : tiempo((desde * lo) / lt);
      p.b = r === b.i1 - 1 ? tb[b.j1 - 1]! : tiempo((largoTexto[r - b.i0 + 1]! * lo) / lt);
      if (!(p.b >= p.a)) p.b = p.a;
      delete p.supuesta;
    }
  });

  // Una palabra cambiada en su sitio (sin pareja, entre dos con pareja, y con una sola oída sin pareja en ese hueco:
  // «noche» → «luna») se queda con el tiempo de la que había.
  const conPareja = new Int32Array(m).fill(-1); // de cada palabra del texto, la última oída con la que casa
  bloques.forEach((b, k) => {
    if (fiables[k]) for (let r = b.i0; r < b.i1; r++) conPareja[r] = b.j1 - 1;
  });
  const primeraOida = new Int32Array(m).fill(-1);
  bloques.forEach((b, k) => {
    if (fiables[k]) for (let r = b.i0; r < b.i1; r++) primeraOida[r] = b.j0;
  });
  for (let i = 0; i < m; i++) {
    if (!salida[i]!.supuesta) continue;
    const antes = i === 0 ? -1 : conPareja[i - 1]!;
    const despues = i === m - 1 ? n : primeraOida[i + 1]!;
    if ((i > 0 && antes < 0) || (i < m - 1 && despues < 0) || despues - antes !== 2) continue;
    const j = antes + 1;
    if (j < 0 || j >= n || !Number.isFinite(ta[j])) continue;
    const p = salida[i]!;
    p.a = ta[j]!;
    p.b = Number.isFinite(tb[j]) && tb[j]! >= ta[j]! ? tb[j]! : ta[j]!;
    delete p.supuesta;
  }

  // Las nuevas, repartidas entre sus vecinas según sus sílabas. Al principio o al final, al paso de las demás.
  const pasos: number[] = [];
  salida.forEach((p, i) => {
    if (!p.supuesta && Number.isFinite(p.a) && Number.isFinite(p.b) && p.b > p.a) pasos.push((p.b - p.a) / silabas[i]!);
  });
  const paso = pasos.length ? mediana(pasos) : 0.35;
  const fin = (p: PalabraTiempo): number => (Number.isFinite(p.b) ? p.b : p.a);
  const inicio = (p: PalabraTiempo): number => (Number.isFinite(p.a) ? p.a : p.b);
  for (let i = 0; i < m; ) {
    if (!salida[i]!.supuesta) {
      i++;
      continue;
    }
    let f = i;
    while (f < m && salida[f]!.supuesta) f++;
    let total = 0;
    for (let k = i; k < f; k++) total += silabas[k]!;
    let t0 = i > 0 ? fin(salida[i - 1]!) : NaN;
    let t1 = f < m ? inicio(salida[f]!) : NaN;
    if (Number.isFinite(t0) && Number.isFinite(t1)) t1 = Math.max(t0, t1);
    else if (Number.isFinite(t0)) t1 = t0 + paso * total;
    else if (Number.isFinite(t1)) t0 = t1 - paso * total;
    let hecho = 0; // sin tiempo a ningún lado, se quedan sin tiempo (NaN)
    for (let k = i; k < f; k++) {
      const p = salida[k]!;
      p.a = t0 + ((t1 - t0) * hecho) / total;
      hecho += silabas[k]!;
      p.b = t0 + ((t1 - t0) * hecho) / total;
    }
    i = f;
  }
  return salida;
}

// ───────────────────────────── Casar sílabas y notas ─────────────────────────────

/** Lo que se casa con las notas: una sílaba, o una nota de melisma que ha marcado la persona («_»). */
interface Elem {
  texto: string;
  palabra: number;
  /** Un «_»: va sola en la nota siguiente a la de la sílaba (o a la de otro «_»), sin escribir nada. */
  marca: boolean;
  abrePalabra: boolean;
  cierraPalabra: boolean;
  /** Primera sílaba de una palabra que abre línea. */
  abreLinea: boolean;
  /** Su palabra empieza por vocal: va con el desfase de las vocales. */
  vocal: boolean;
  /** Es la tónica de su palabra. */
  tonica: boolean;
  /** Admite sinalefa con la sílaba anterior. */
  sinalefaAntes: boolean;
  /** Segundo en que empieza a oírse (solo la primera sílaba de una palabra con tiempo fiable; si no, NaN)… */
  tIni: number;
  /** …y en que deja de oírse (solo el último elemento de esa palabra)… */
  tFin: number;
  /** …y cuál es ese último elemento, en todos los de la palabra (−1 si no lo lleva ninguno). */
  finPalabra: number;
  /** Coste de ir en la misma nota que la sílaba anterior… */
  junta: number;
  /** …y si para eso no hay sinalefa ni hiato. */
  forzada: boolean;
  /** Coste de dejarla sin nota, y si es de la letra de la persona (`segura`)… */
  quita: number;
  segura: boolean;
  /** …y, si lo es y se oyó, cuándo empieza a oírse su palabra (si no, NaN): quitarla cuesta además lo que valga ese
   *  tiempo en la nota más cercana. */
  oidaEn: number;
  /** Sílaba de en medio o del final de su palabra: su tiempo es supuesto (ver `factorDentro`)… */
  dentro: boolean;
  /** …y lo que dura su palabra (s): fuera de ella, su coste de tiempo ya no tiene el tope pequeño. */
  largoPalabra: number;
}

/** Cuántos «_» hay antes de la primera letra o cifra (los de una palabra que empieza línea con «_»). */
function marcasDelante(texto: string): number {
  const delante = /^[^\p{L}\p{N}]*/u.exec(texto)?.[0] ?? '';
  return (delante.match(/_/gu) ?? []).length;
}

function elementosDe(palabras: PalabraTiempo[], A: AjustesCasar): Elem[] {
  const S: Elem[] = [];
  const memo = new Map<string, SilabaConRasgos[]>();
  const rasgos = (t: string): SilabaConRasgos[] => {
    let r = memo.get(t);
    if (!r) memo.set(t, (r = silabasConRasgos(t)));
    return r;
  };
  const marca = (palabra: number, quita: number): Elem => ({
    texto: '',
    palabra,
    marca: true,
    abrePalabra: false,
    cierraPalabra: false,
    abreLinea: false,
    vocal: false,
    tonica: false,
    sinalefaAntes: false,
    dentro: false,
    largoPalabra: NaN,
    tIni: NaN,
    tFin: NaN,
    finPalabra: -1,
    junta: Infinity,
    forzada: false,
    quita,
    segura: false,
    oidaEn: NaN,
  });
  // Los elementos desde `desde` son de la misma palabra, y su final lo lleva el último.
  const finEnElUltimo = (desde: number): void => {
    for (let h = desde; h < S.length; h++) S[h]!.finPalabra = S.length - 1;
  };
  let previa: string | null = null; // la última palabra con sílabas
  let previaOida = false; // si se oyó (con su tiempo)
  let desdePrevia = 0; // dónde empiezan sus elementos
  let entre = ''; // las palabras sin sílabas desde ella (signos sueltos, «♪»…): pueden cortar la sinalefa
  palabras.forEach((p, k) => {
    const texto = typeof p?.texto === 'string' ? p.texto : '';
    const ss = rasgos(texto);
    // «_» sueltos delante: alargan la palabra anterior
    const delante = ss.length ? marcasDelante(texto) : (texto.match(/_/gu) ?? []).length;
    if (delante && S.length) {
      const ultimo = S[S.length - 1]!;
      const tFin = ultimo.tFin;
      ultimo.tFin = NaN;
      for (let r = 0; r < delante; r++) S.push(marca(ultimo.palabra, A.quitaMarca));
      S[S.length - 1]!.tFin = tFin;
      if (tFin === tFin) finEnElUltimo(desdePrevia);
    }
    if (!ss.length) {
      entre += ` ${texto}`;
      return;
    }
    const a = Number(p.a);
    const b = Number(p.b);
    const conTiempo = !p.supuesta && Number.isFinite(a);
    // ¿Sinalefa con la palabra anterior? Lo dice la letra de las dos juntas, como en `splitSyllables`. Entre dos
    // líneas no cuenta (no juntarlas no cuesta: la línea empieza en su nota), salvo para juntarlas si las dos se oyeron:
    // la persona puede partir las líneas por donde no se respira («…canta / a la noche»). Lo que sobra de la letra (sin
    // tiempo oído) no se cuela por ahí, ni lo que se oye cantado tras un respiro (`trasRespiro`, en `casarLetra`).
    let sinalefaAntes = false;
    let sinalefaLinea = false;
    if (previa !== null && (!p.abreLinea || (conTiempo && previaOida))) {
      const nPrevia = rasgos(previa).length;
      const juntas = rasgos(`${previa}${entre} ${texto}`);
      const hay = juntas.length === nPrevia + ss.length && juntas[nPrevia - 1]!.sinalefa;
      if (p.abreLinea) sinalefaLinea = hay;
      else sinalefaAntes = hay;
    }
    // El tiempo de la palabra, repartido entre sus sílabas: la tónica y la última de una frase duran más.
    const sig = palabras[k + 1];
    const finalFrase = !sig || !!sig.abreLinea || /[,.;:?!…]\s*$/u.test(texto);
    const pesos = ss.map((x, r) => 1 + (x.tonica ? A.pesoTonica : 0) + (r === ss.length - 1 && finalFrase ? A.pesoFinal : 0));
    const antes: number[] = [];
    const sumaPesos = pesos.reduce((acc, w, r) => {
      antes[r] = acc;
      return acc + w;
    }, 0);
    const repartible = conTiempo && A.factorDentro > 0 && Number.isFinite(b) && b > a;
    const segura = p.segura ?? (!!p.supuesta || !Number.isFinite(a));
    const quita = segura ? A.quitaSegura : A.quita;
    const desde = S.length;
    ss.forEach((s, r) => {
      const conSinalefa = r === 0 ? sinalefaAntes : ss[r - 1]!.sinalefa;
      const juntable = conSinalefa || (r === 0 && sinalefaLinea);
      S.push({
        texto: s.texto,
        palabra: k,
        marca: false,
        abrePalabra: s.abrePalabra,
        cierraPalabra: s.cierraPalabra,
        abreLinea: r === 0 && !!p.abreLinea,
        vocal: ss[0]!.vocalAlEmpezar,
        tonica: s.tonica,
        sinalefaAntes: conSinalefa,
        tIni: conTiempo && r === 0 ? a : repartible ? a + ((b - a) * antes[r]!) / sumaPesos : NaN,
        dentro: r > 0,
        largoPalabra: repartible ? b - a : NaN,
        tFin: NaN,
        finPalabra: -1,
        // De la letra de la persona, dos sílabas sin sinalefa ni hiato no van en una nota: si no caben, se quita una.
        // Metida a presión, empujaría a las demás fuera de su nota y no se vería qué sobra.
        junta: juntable ? A.sinalefa : s.hiato ? A.sineresis : segura ? Infinity : A.junta,
        forzada: !juntable && !s.hiato,
        quita,
        segura,
        oidaEn: segura && conTiempo ? a : NaN,
      });
      for (let h = 0; h < s.melismas; h++) S.push(marca(k, A.quitaMarca));
    });
    if (conTiempo && Number.isFinite(b) && b >= a) {
      S[S.length - 1]!.tFin = b;
      finEnElUltimo(desde);
    }
    previa = texto;
    previaOida = conTiempo;
    desdePrevia = desde;
    entre = '';
  });
  return S;
}

/** Lo que no cambia entre pasadas. */
interface Problema {
  A: AjustesCasar;
  N: number;
  L: number;
  /** Por sonido (notas ligadas, juntas): comienzo y fin, y si viene tras un silencio o tras un silencio largo. */
  ini: Float64Array;
  fin: Float64Array;
  tras: Uint8Array;
  largo: Uint8Array;
  /** Lo que cuesta alargar una sílaba al sonido q (la primera vez, y las siguientes), y poner en él un «_». */
  alargar: Float64Array;
  alargarMas: Float64Array;
  marcar: Float64Array;
  /** Frases (entre silencios largos): para cada sonido j que empieza una (o j = N), dónde empieza la anterior, y al
   *  revés; −1 si no. */
  fraseAntes: Int32Array;
  fraseDespues: Int32Array;
  /** Los comienzos van en orden (si no, nada de bandas). */
  ordenadas: boolean;
  /** Por elemento. */
  junta: Float64Array;
  quita: Float64Array;
  marca: Uint8Array;
  abrePalabra: Uint8Array;
  abreLinea: Uint8Array;
  /** Lo que se descuenta de alargar el elemento (su sílaba es tónica), y lo que cuesta empezar grupo en él si admite
   *  sinalefa con el anterior (no juntarlos). */
  descuento: Float64Array;
  separar: Float64Array;
  /** El elemento que lleva el final de su palabra (−1 si ninguno). */
  finPalabra: Int32Array;
  /** Su palabra (de la letra de la persona) se oyó lejos de todas las notas, donde esta voz calla: su tiempo cuenta
   *  entero, sin el tope pequeño de las sílabas de en medio ni la mitad de cuando se junta con la anterior. */
  lejos: Uint8Array;
  /** Cuántos elementos seguidos sin «_», y que se pueden juntar (sin una `junta` imposible entre ellos), acaban en el
   *  i−1: los que pueden ir juntos en una nota (luego, hasta maxSilabas). Así no se prueban grupos imposibles. */
  seguidas: Int32Array;
  /** Las palabras traen líneas: cuentan los costes de frase. Lo que cuesta una palabra que abre línea sin ir tras un
   *  silencio, y una sílaba que no abre línea tras un silencio largo (ver `frase`). */
  conFrase: boolean;
  fraseAbre: number;
  fraseCorta: number;
}

/** Tiempos de una pasada, por elemento: lo esperado (con el desfase) y 1/σ. */
interface Tiempos {
  tIni: Float64Array;
  invIni: Float64Array;
  /** Tope del coste de tiempo del comienzo, y hasta qué distancia (s) de su tiempo vale (más lejos, `tope`). */
  topeIni: Float64Array;
  alcance: Float64Array;
  tFin: Float64Array;
  invFin: Float64Array;
}

interface Reparto {
  /** Sonido en que empieza cada elemento (−1: descartado). */
  inicio: Int32Array;
  /** Último sonido del grupo que cierra cada elemento (−1 si no cierra ninguno). */
  cierre: Int32Array;
  coste: number;
  /** Margen de cada elemento (solo si se ha pedido). */
  margen: Float64Array | null;
  /** Coste de tiempo del comienzo del elemento s en el sonido a. */
  ctIni: (s: number, a: number) => number;
}

/** Cuántos de `xs` (en orden) son menores que `x` (o menores o iguales, con `igual`). */
function cuantos(xs: ArrayLike<number>, x: number, igual: boolean): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (xs[m]! < x || (igual && xs[m] === x)) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Una pasada de la programación dinámica. Estados (i, j): ya se han repartido los i primeros elementos y los j
 * primeros sonidos, y el grupo de la sílaba i−1 está recién abierto (empieza en el sonido j−1), alargándose (el sonido
 * j−1 lo alarga) o cerrado. Desde uno cerrado se puede dejar libre el sonido j, o la frase entera que empieza en él,
 * quitar el elemento i, o poner las sílabas i…i+g−1 (g ≤ maxSilabas) en el sonido j y abrir su grupo. Desde uno abierto
 * se alarga el grupo al sonido j (la primera vez cuesta más que las siguientes), se pone en él el «_» i, o se cierra (y
 * entonces cuenta el final de la palabra). Cada fila i solo guarda los sonidos [E[i], U[i]] que pueden hacer falta según las bandas de tiempo de
 * los elementos i−1 e i; las dos cotas crecen con i y cada fila toca la siguiente, así que siempre hay camino.
 * Con `conMargen`, además, se recorre al revés para saber, de cada sílaba, cuánto costaría el mejor reparto con ella en
 * otro sitio.
 */
function pasada(P: Problema, T: Tiempos, conMargen: boolean): Reparto {
  const { A, N, L, ini, fin, tras, largo, alargar, alargarMas, marcar, fraseAntes, fraseDespues, junta, quita, marca, abrePalabra, abreLinea, descuento, separar, finPalabra, lejos, seguidas, conFrase } = P;
  const G = Math.min(63, Math.max(1, Math.floor(A.maxSilabas) || 1));
  const { libre, fraseLibre, fraseLibreBorde, tope, topeFin, corte } = A;
  const { fraseAbre, fraseCorta } = P;

  const ctIni = (s: number, a: number): number => {
    const t = T.tIni[s]!;
    if (t !== t) return 0; // NaN
    const dt = ini[a]! - t;
    const d = dt * T.invIni[s]!;
    const c = d * d;
    const z = dt <= T.alcance[s]! && -dt <= T.alcance[s]! ? T.topeIni[s]! : tope;
    return c < z ? c : z;
  };
  // Cerrar el grupo cuyo último elemento es i−1 en el sonido j−1. Si no es el último de su palabra, solo cuenta si se
  // pasa de cuando deja de oírse la palabra: si no, quitar la última sílaba (o llevarla lejos) y alargar la anterior
  // libraría del coste del final.
  const ctFin = (i: number, j: number): number => {
    if (i <= 0 || j <= 0) return 0;
    let t = T.tFin[i - 1]!;
    if (t !== t) {
      const u = finPalabra[i - 1]!;
      if (u < 0) return 0;
      t = T.tFin[u]!;
      if (!(fin[j - 1]! > t)) return 0;
    }
    const d = (fin[j - 1]! - t) * T.invFin[i - 1]!;
    const c = d * d;
    return c < topeFin ? c : topeFin;
  };
  // Poner las sílabas s0…s0+g−1 en el sonido a. La que abre línea sin ir la primera tampoco va tras un silencio, y
  // paga lo mismo que si abriera ella el grupo: si no, esconderla en la nota de la anterior saldría más barato.
  const V = (s0: number, g: number, a: number): number => {
    let c = ctIni(s0, a) + separar[s0]!;
    for (let h = s0 + 1; h < s0 + g; h++) c += junta[h]! + (lejos[h] ? 1 : 0.5) * ctIni(h, a) + (conFrase && abreLinea[h] ? fraseAbre : 0);
    if (tras[a] && !abrePalabra[s0]) c += corte;
    if (conFrase && a > 0) c += abreLinea[s0] ? (tras[a] ? 0 : fraseAbre) : largo[a] ? fraseCorta : 0;
    return c;
  };

  // Banda de cada elemento: los sonidos en los que puede empezar. Los que no tienen tiempo propio (sílabas de en medio,
  // palabras sin tiempo o supuestas, «_»), entre las bandas de los que sí tienen alrededor. Y cada uno, como poco,
  // entre la banda del anterior con tiempo y la del siguiente: si su tiempo está muy mal, puede ir en su sitio.
  const lo = new Int32Array(L);
  const hi = new Int32Array(L);
  const conBanda = P.ordenadas && Number.isFinite(A.banda) && A.banda > 0;
  const fiable = (s: number): boolean => conBanda && T.tIni[s] === T.tIni[s];
  for (let s = 0; s < L; s++) {
    if (fiable(s)) {
      lo[s] = cuantos(ini, T.tIni[s]! - A.banda, false);
      hi[s] = Math.max(lo[s]!, cuantos(ini, T.tIni[s]! + A.banda, true) - 1);
    }
  }
  const loF = Int32Array.from(lo);
  const hiF = Int32Array.from(hi);
  const conAntes = new Uint8Array(L);
  for (let s = 0, loA = 0, hiA = 0, hay = false; s < L; s++) {
    if (fiable(s)) {
      if (hay) lo[s] = Math.min(lo[s]!, loA);
      loA = loF[s]!;
      hiA = hiF[s]!;
      hay = true;
    } else if (hay) {
      lo[s] = loA;
      hi[s] = hiA;
      conAntes[s] = 1;
    }
  }
  for (let s = L - 1, loD = 0, hiD = 0, hay = false; s >= 0; s--) {
    if (fiable(s)) {
      if (hay) hi[s] = Math.max(hi[s]!, hiD);
      loD = loF[s]!;
      hiD = hiF[s]!;
      hay = true;
      continue;
    }
    // sin fiable delante, desde el principio; sin fiable detrás, hasta el final
    lo[s] = !conAntes[s] ? 0 : hay ? Math.min(lo[s]!, loD) : lo[s]!;
    hi[s] = !hay ? N - 1 : conAntes[s] ? Math.max(hi[s]!, hiD) : hiD;
  }

  // Filas: [E[i], U[i]], las dos crecientes, E[0] = 0, U[L] = N y E[i+1] ≤ U[i].
  const E = new Int32Array(L + 1);
  const U = new Int32Array(L + 1);
  for (let i = 0; i <= L; i++) {
    let u = i < L ? hi[i]! : N;
    if (i > 0) u = Math.max(u, hi[i - 1]! + 1, U[i - 1]!);
    U[i] = Math.min(N, Math.max(0, u));
    let e = 0;
    if (i > 0) {
      e = lo[i - 1]! + 1;
      if (i < L) e = Math.min(e, lo[i]!);
    }
    E[i] = Math.min(N, Math.max(0, e));
  }
  U[L] = N;
  for (let i = L - 1; i >= 0; i--) E[i] = Math.min(E[i]!, E[i + 1]!);
  for (let i = 0; i <= L; i++) E[i] = Math.min(E[i]!, U[i]!, i > 0 ? U[i - 1]! : 0);
  const off = new Int32Array(L + 2);
  for (let i = 0; i <= L; i++) off[i + 1] = off[i]! + (U[i]! - E[i]! + 1);
  const total = off[L + 1]!;
  const base = (i: number): number => off[i]! - E[i]!; // X[base(i) + j] es el estado (i, j)
  const enFila = (i: number, j: number): boolean => j >= E[i]! && j <= U[i]!;

  // Hacia delante: lo mínimo que cuesta llegar a cada estado, y por dónde. Capas: recién abierto (Da: el grupo de la
  // sílaba i−1 empieza en el sonido j−1), alargándose (Db: el sonido j−1 alarga ese grupo) y cerrado (Dc).
  const Da = new Float64Array(total).fill(Infinity);
  const Db = new Float64Array(total).fill(Infinity);
  const Dc = new Float64Array(total).fill(Infinity);
  const pa = new Uint8Array(total); // g: g sílabas en j−1; 71: «_» quitado (desde Da)
  const pb = new Uint8Array(total); // 1: primer alargue (desde Da); 2: otro (desde Db); 70/72: «_» en j−1 desde Da/Db; 71: «_» quitado
  const pc = new Uint8Array(total); // 1: cerrar desde Da; 5: desde Db; 2: nota libre; 3: quitar; 4: frase libre
  // (alargar nunca sale gratis: si no, una sílaba tónica al final de la frase se comería las notas que no son suyas)
  const alarga = (i: number, q: number, sigue: boolean): number => Math.max(0.05, (sigue ? alargarMas[q]! : alargar[q]!) - descuento[i - 1]!);
  for (let i = 0; i <= L; i++) {
    const e = E[i]!;
    const u = U[i]!;
    const o = base(i);
    const gMax = i > 0 ? Math.min(G, seguidas[i]!) : 0;
    for (let j = e; j <= u; j++) {
      let ma = Infinity;
      let ka = 0;
      let mb = Infinity;
      let kb = 0;
      if (i > 0 && j > 0) {
        const q = j - 1;
        for (let g = 1; g <= gMax; g++) {
          const s0 = i - g;
          if (q < lo[s0]! || q > hi[s0]! || !enFila(s0, q)) continue;
          const antes = Dc[base(s0) + q]!;
          if (antes === Infinity) continue;
          const c = antes + V(s0, g, q);
          if (c < ma) [ma, ka] = [c, g];
        }
        if (q >= e) {
          const c1 = Da[o + q]! + alarga(i, q, false);
          if (c1 < mb) [mb, kb] = [c1, 1];
          const c2 = Db[o + q]! + alarga(i, q, true);
          if (c2 < mb) [mb, kb] = [c2, 2];
        }
        if (marca[i - 1]) {
          if (enFila(i - 1, q)) {
            const c1 = Da[base(i - 1) + q]! + marcar[q]!;
            if (c1 < mb) [mb, kb] = [c1, 70];
            const c2 = Db[base(i - 1) + q]! + marcar[q]!;
            if (c2 < mb) [mb, kb] = [c2, 72];
          }
          if (enFila(i - 1, j)) {
            const c1 = Da[base(i - 1) + j]! + quita[i - 1]!;
            if (c1 < ma) [ma, ka] = [c1, 71];
            const c2 = Db[base(i - 1) + j]! + quita[i - 1]!;
            if (c2 < mb) [mb, kb] = [c2, 71];
          }
        }
      }
      Da[o + j] = ma;
      pa[o + j] = ka;
      Db[o + j] = mb;
      pb[o + j] = kb;
      let c0 = i === 0 && j === 0 ? 0 : Infinity;
      let k0 = 0;
      const abierta = Math.min(ma, mb);
      if (abierta < Infinity) {
        const c = abierta + ctFin(i, j);
        if (c < c0) [c0, k0] = [c, ma <= mb ? 1 : 5];
      }
      if (j > e) {
        const c = Dc[o + j - 1]! + libre;
        if (c < c0) [c0, k0] = [c, 2];
      }
      if (i > 0 && enFila(i - 1, j)) {
        const c = Dc[base(i - 1) + j]! + quita[i - 1]!;
        if (c < c0) [c0, k0] = [c, 3];
      }
      const p = fraseAntes[j]!;
      if (p >= e) {
        const c = Dc[o + p]! + (i === 0 || i === L ? fraseLibreBorde : fraseLibre);
        if (c < c0) [c0, k0] = [c, 4];
      }
      Dc[o + j] = c0;
      pc[o + j] = k0;
    }
  }

  // El camino más barato, de atrás adelante.
  const inicio = new Int32Array(L).fill(-1);
  const cierre = new Int32Array(L).fill(-1);
  for (let i = L, j = N, capa = 2; i > 0 || j > 0; ) {
    const x = base(i) + j;
    if (capa === 2) {
      const k = pc[x]!;
      if (k === 1 || k === 5) {
        cierre[i - 1] = j - 1;
        capa = k === 1 ? 0 : 1;
      } else if (k === 2) j--;
      else if (k === 3) i--;
      else if (k === 4) j = fraseAntes[j]!;
      else break; // no pasa: siempre hay camino
    } else if (capa === 1) {
      const k = pb[x]!;
      if (k === 1 || k === 2) {
        j--;
        capa = k === 1 ? 0 : 1;
      } else if (k === 70 || k === 72) {
        inicio[i - 1] = j - 1;
        i--;
        j--;
        capa = k === 70 ? 0 : 1;
      } else if (k === 71) i--;
      else break;
    } else {
      const k = pa[x]!;
      if (k === 71) i--;
      else if (k >= 1) {
        for (let h = i - k; h < i; h++) inicio[h] = j - 1;
        i -= k;
        j--;
        capa = 2;
      } else break;
    }
  }
  const mejorTotal = Dc[base(L) + N]!;
  if (!conMargen) return { inicio, cierre, coste: mejorTotal, margen: null, ctIni };

  // Hacia atrás: lo mínimo que cuesta llegar al final desde cada estado de cada capa (Ra, Rb, Rc).
  const Ra = new Float64Array(total).fill(Infinity);
  const Rb = new Float64Array(total).fill(Infinity);
  const Rc = new Float64Array(total).fill(Infinity);
  for (let i = L; i >= 0; i--) {
    const e = E[i]!;
    const u = U[i]!;
    const o = base(i);
    const gMax = i < L ? G : 0;
    for (let j = u; j >= e; j--) {
      let c0 = i === L && j === N ? 0 : Infinity;
      if (j < u) c0 = Math.min(c0, Rc[o + j + 1]! + libre);
      if (i < L && enFila(i + 1, j)) c0 = Math.min(c0, Rc[base(i + 1) + j]! + quita[i]!);
      if (i < L && !marca[i] && j < N && j >= lo[i]! && j <= hi[i]!) {
        for (let g = 1; g <= gMax && i + g <= L; g++) {
          if (seguidas[i + g]! < g) break; // un «_», o dos que no se pueden juntar
          if (!enFila(i + g, j + 1)) continue;
          const z = Ra[base(i + g) + j + 1]!;
          if (z === Infinity) continue;
          c0 = Math.min(c0, V(i, g, j) + z);
        }
      }
      const nx = fraseDespues[j]!;
      if (nx >= 0 && nx <= u) c0 = Math.min(c0, Rc[o + nx]! + (i === 0 || i === L ? fraseLibreBorde : fraseLibre));
      Rc[o + j] = c0;
      if (i > 0) {
        const cierra = ctFin(i, j) + c0;
        let ca = cierra;
        let cb = cierra;
        if (j < u) {
          ca = Math.min(ca, Rb[o + j + 1]! + alarga(i, j, false));
          cb = Math.min(cb, Rb[o + j + 1]! + alarga(i, j, true));
        }
        if (i < L && marca[i]) {
          if (j < N && enFila(i + 1, j + 1)) {
            const z = Rb[base(i + 1) + j + 1]! + marcar[j]!;
            ca = Math.min(ca, z);
            cb = Math.min(cb, z);
          }
          if (enFila(i + 1, j)) {
            ca = Math.min(ca, Ra[base(i + 1) + j]! + quita[i]!);
            cb = Math.min(cb, Rb[base(i + 1) + j]! + quita[i]!);
          }
        }
        Ra[o + j] = ca;
        Rb[o + j] = cb;
      }
    }
  }

  // Margen: lo mejor con cada sílaba en otro sonido (o quitada), menos lo mejor.
  const otro = new Float64Array(L).fill(Infinity);
  for (let s0 = 0; s0 < L; s0++) {
    if (marca[s0]) continue;
    const os = base(s0);
    const aMin = Math.max(lo[s0]!, E[s0]!);
    const aMax = Math.min(hi[s0]!, U[s0]!, N - 1);
    for (let a = aMin; a <= aMax; a++) {
      const antes = Dc[os + a]!;
      if (antes === Infinity) continue;
      for (let g = 1; g <= G && s0 + g <= L; g++) {
        if (seguidas[s0 + g]! < g) break;
        if (!enFila(s0 + g, a + 1)) continue;
        const z = Ra[base(s0 + g) + a + 1]!;
        if (z === Infinity) continue;
        const c = antes + V(s0, g, a) + z;
        for (let h = s0; h < s0 + g; h++) if (inicio[h] !== a && c < otro[h]!) otro[h] = c;
      }
    }
  }
  for (let h = 0; h < L; h++) {
    if (inicio[h]! < 0 || marca[h]) continue;
    const j0 = Math.max(E[h]!, E[h + 1]!);
    const j1 = Math.min(U[h]!, U[h + 1]!);
    for (let j = j0; j <= j1; j++) {
      const c = Dc[base(h) + j]! + quita[h]! + Rc[base(h + 1) + j]!;
      if (c < otro[h]!) otro[h] = c;
    }
  }
  const margen = new Float64Array(L);
  for (let h = 0; h < L; h++) margen[h] = Math.max(0, otro[h]! - mejorTotal);
  return { inicio, cierre, coste: mejorTotal, margen, ctIni };
}

/** Lo que cuesta que una línea no empiece tras un silencio (con `de` = líneas y `en` = frases), o que tras un silencio
 *  largo no empiece una (al revés): lo que dice la proporción de líneas que no caben en una frase cada una, entre
 *  `frase` (no casan nada) y `fraseMax` (hay tantas como frases). */
function costeFrase(de: number, en: number, A: AjustesCasar): number {
  const p = Math.max(0.05, (de - en) / Math.max(1, de));
  return Math.min(A.fraseMax, Math.max(A.frase, -2 * Math.log(p)));
}

/** Mediana de unos valores y lo que se puede fiar uno de ella (su error típico: 1,25 × la dispersión / √n). */
function centro(vs: number[]): { m: number; e: number } {
  const m = mediana(vs);
  const mad = mediana(vs.map((v) => Math.abs(v - m))) * 1.4826;
  return { m, e: (1.25 * mad) / Math.sqrt(Math.max(1, vs.length)) };
}

/** Los `vs` cuyo tiempo (`ts`, en orden) cae a menos de `w` de t. */
function cerca(ts: number[], vs: number[], t: number, w: number): number[] {
  const salida: number[] = [];
  if (!Number.isFinite(t)) return salida;
  let a = 0;
  let b = ts.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (ts[m]! < t - w) a = m + 1;
    else b = m;
  }
  for (let k = a; k < ts.length && ts[k]! <= t + w; k++) salida.push(vs[k]!);
  return salida;
}

/** El desfase cerca de t: el de su tramo (con al menos `min` medidas) si se aparta claramente del de toda la canción
 *  (más que `umbralTramo` y que el doble de lo que pueden errar las dos medianas); si no, el de toda la canción. */
function tramo(ts: number[], vs: number[], t: number, A: AjustesCasar, min: number, general: { m: number; e: number }): number {
  const xs = cerca(ts, vs, t, A.ventana);
  if (xs.length < min) return general.m;
  const l = centro(xs);
  return Math.abs(l.m - general.m) > Math.max(A.umbralTramo, 2 * Math.hypot(l.e, general.e)) ? l.m : general.m;
}

/** Los pares (tiempo, valor) ordenados por tiempo. */
function porTiempo(pares: { t: number; v: number }[]): { ts: number[]; vs: number[] } {
  const o = pares.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((x, y) => x.t - y.t);
  return { ts: o.map((p) => p.t), vs: o.map((p) => p.v) };
}

/** Segundos que tiene que oírse una palabra dentro de una frase de la melodía para que cuente que se cantó en ella. */
const DENTRO_DE_FRASE = 0.3;
/** Lo que dura como poco un silencio de esta voz en el que puede ir una línea que canta otra (s). */
const SILENCIO_LINEA = 0.6;
/** Cuántas palabras del final de una línea puede no haber oído Whisper para que aún se vea que sobra una línea entera
 *  sin oír que va detrás. Si le faltan más, lo último que se oyó de ella no es de fiar para medir el hueco. */
const COLA_SIN_OIR = 3;
/** Lo que puede apartarse (s) lo primero que se oye de una línea del comienzo de una frase de la melodía para que se vea
 *  que la línea empieza ahí, aunque Whisper no oyera casi nada más de ella (ver `sobrantes`). */
const FRASE_CERCA = 0.5;

/**
 * Si la palabra k se oye desde antes de que empiece una frase de la melodía (un sonido tras un silencio largo) hasta al
 * menos `DENTRO_DE_FRASE` s después, y ese final se puede creer porque acaba antes de que empiece a oírse la palabra
 * siguiente. Entonces se cantó en esa frase, tras el respiro: «Ella canta / a la noche» con «a» oída desde el final de
 * «canta». (Whisper alarga a veces una palabra corta por encima de un silencio y de las siguientes: si se mete en la
 * siguiente, ese final no dice nada.)
 */
function trasRespiro(palabras: PalabraTiempo[], k: number, ini: Float64Array, largo: Uint8Array): boolean {
  const p = palabras[k];
  if (!p || p.supuesta) return false;
  const a = Number(p.a);
  const b = Number(p.b);
  if (!Number.isFinite(a) || !(b - DENTRO_DE_FRASE > a)) return false;
  for (let w = k + 1; w < palabras.length; w++) {
    const x = palabras[w];
    if (x && !x.supuesta && Number.isFinite(Number(x.a))) {
      if (b > Number(x.a) + 0.05) return false;
      break;
    }
  }
  for (let q = 0; q < ini.length; q++) if (largo[q] && ini[q]! > a && ini[q]! < b - DENTRO_DE_FRASE) return true;
  return false;
}

/**
 * Las palabras de la letra de la persona que se ve que sobran, y que por eso se pueden quitar como lo que se inventa
 * Whisper (`quita`, no `quitaSegura`): con lo que cuesta quitar lo demás, saldría más barato meterlas corriendo una
 * frase entera una nota. Son de dos clases:
 *   - una o más líneas enteras sin ninguna palabra oída que no caben en las notas que hay entre lo oído de sus vecinas
 *     (una cabecera como «Coro:», un título, una línea de más), con los márgenes de `desajuste` en `heredarTiempos`;
 *     también si Whisper tampoco oyó las últimas palabras de la línea de antes (hasta `COLA_SIN_OIR`): esas cuentan
 *     para ver si cabe, pero no sobran. Entonces el hueco se mide desde lo último que se oyó de esa línea, y eso, o lo
 *     primero que se oye después, puede ser un «ancla falsa» (algo que Whisper se inventa u oye a destiempo y que casa
 *     por casualidad con el texto): si no es de fiar, sobran solo si no cabe casi nada de ellas. Y si son la copia de
 *     las líneas que siguen, no sobran si caben tras lo oído de la copia: `heredarTiempos` pudo darle a la segunda copia
 *     lo oído de la primera vez;
 *   - una línea cuyas palabras oídas caen todas donde esta voz calla: ninguna nota suena entre el comienzo de lo primero
 *     que se oye de ella y el final de lo último (con 0,15 s de margen), en un silencio o tras la última nota. La canta
 *     otra voz, o son restos de lo que se inventa Whisper.
 * `ini` y `fin` son los de los sonidos, y `largo`, si cada uno va tras un silencio largo; con `ordenadas`, los
 * comienzos van en orden.
 */
function sobrantes(palabras: PalabraTiempo[], S: Elem[], ini: Float64Array, fin: Float64Array, largo: Uint8Array, ordenadas: boolean): Uint8Array {
  const n = palabras.length;
  const N = ini.length;
  const sobra = new Uint8Array(n);
  const oida = (p: PalabraTiempo | undefined): p is PalabraTiempo => !!p && !p.supuesta && Number.isFinite(Number(p.a));
  const finOida = (p: PalabraTiempo): number => (Number.isFinite(Number(p.b)) ? Number(p.b) : Number(p.a));
  // Los sonidos que empiezan entre t0 y t1 (sin contarlos a ellos)…
  const entre = (t0: number, t1: number): number => {
    if (ordenadas) return t1 > t0 ? Math.max(0, cuantos(ini, t1, false) - cuantos(ini, t0, true)) : 0;
    let c = 0;
    for (let q = 0; q < N; q++) if (ini[q]! > t0 && ini[q]! < t1) c++;
    return c;
  };
  // …y si alguno suena entre t0 y t1: empieza antes de t1 y acaba después de t0.
  const suena = (t0: number, t1: number): boolean => {
    const hasta = ordenadas ? cuantos(ini, t1, false) : N;
    for (let q = 0; q < hasta; q++) if (ini[q]! < t1 && fin[q]! > t0) return true;
    return false;
  };
  const silabas = new Int32Array(n);
  for (const s of S) if (!s.marca) silabas[s.palabra]!++;
  const silabasEntre = (desde: number, hasta: number): number => {
    let c = 0;
    for (let x = desde; x < hasta; x++) c += silabas[x]!;
    return c;
  };
  const ultimaAntes = new Int32Array(n + 1).fill(-1); // la última oída antes de k
  for (let k = 1; k <= n; k++) ultimaAntes[k] = oida(palabras[k - 1]) ? k - 1 : ultimaAntes[k - 1]!;
  const primeraDesde = new Int32Array(n + 1).fill(n); // la primera oída desde k
  for (let k = n - 1; k >= 0; k--) primeraDesde[k] = oida(palabras[k]) ? k : primeraDesde[k + 1]!;
  // De cada palabra, su línea; y de cada línea, cuántas palabras con sílabas tiene y cuántas se oyeron.
  const linea = new Int32Array(n);
  const conSilabas: number[] = [];
  const oidasEnLinea: number[] = [];
  for (let k = 0, l = -1; k < n; k++) {
    if (l < 0 || palabras[k]?.abreLinea) {
      l++;
      conSilabas.push(0);
      oidasEnLinea.push(0);
    }
    linea[k] = l;
    if (silabas[k]! > 0) {
      conSilabas[l]!++;
      if (oida(palabras[k])) oidasEnLinea[l]!++;
    }
  }
  // Si a menos de `FRASE_CERCA` de t empieza una frase de la melodía: el primer sonido, o uno tras un silencio largo.
  const empiezaFrase = (t: number): boolean => {
    for (let q = ordenadas ? cuantos(ini, t - FRASE_CERCA, false) : 0; q < N && (!ordenadas || ini[q]! <= t + FRASE_CERCA); q++) {
      if ((q === 0 || largo[q]) && Math.abs(ini[q]! - t) <= FRASE_CERCA) return true;
    }
    return false;
  };
  // Si la palabra oída x, de las dos que cierran el hueco de un tramo, es de fiar para medirlo. Un «ancla falsa» se queda
  // sola: casi nada de su línea casa con lo oído, o lo que casa queda lejos. Así que:
  //   - la de después (d = 1): su línea se oyó al menos a medias, o empieza a oírse donde empieza una frase de la
  //     melodía, como empieza una línea de verdad (de una línea, Whisper puede no oír más que su comienzo);
  //   - de la de antes (d = −1) no se mira cuánto se oyó de su línea: lo de detrás es la cola, que no se oyó, y en una
  //     línea corta eso es casi toda la línea (de «Canta la noche sobre mar» puede oírse solo «Canta la»);
  //   - las dos: no se apartan más de `HUECO_SOSPECHOSO` de la de al lado en su línea, si esa también se oyó.
  const deFiar = (x: number, d: number): boolean => {
    if (d > 0 && 2 * oidasEnLinea[linea[x]!]! < conSilabas[linea[x]!]! && !empiezaFrase(Number(palabras[x]!.a))) return false;
    const y = x + d;
    if (y < 0 || y >= n || palabras[d < 0 ? x : y]?.abreLinea || !oida(palabras[y])) return true;
    const hueco = d < 0 ? Number(palabras[x]!.a) - finOida(palabras[y]!) : Number(palabras[y]!.a) - finOida(palabras[x]!);
    return !(hueco > HUECO_SOSPECHOSO);
  };
  // Si las líneas [k1, f) sin oír, tras la cola [k, k1) de la de antes, se repiten justo después, en [f, e), y caben
  // como si lo oído de esa copia fuera de la primera vez: la cola en su hueco (`caben` notas), y estas líneas, con lo
  // que no se oyó tras lo último oído de la copia, en las notas que quedan detrás.
  const copiaDespues = (k: number, k1: number, f: number, caben: number): boolean => {
    const e = f + (f - k1);
    if (e > n || (e < n && !palabras[e]?.abreLinea)) return false;
    for (let x = k1; x < f; x++) {
      if (clave(String(palabras[x]?.texto ?? '')) !== clave(String(palabras[x + f - k1]?.texto ?? ''))) return false;
    }
    if (silabasEntre(k, k1) > caben + 1) return false;
    const u = ultimaAntes[e]!; // (la hay: la copia empieza en f, que se oyó)
    const v = primeraDesde[e]!;
    const libres = entre(finOida(palabras[u]!) - 0.1, v < n ? Number(palabras[v]!.a) - 0.2 : Infinity);
    return silabasEntre(k1, f) + silabasEntre(u + 1, v) <= libres + 1;
  };
  // Lo que dura el silencio de esta voz en que caen t0…t1: del final del último sonido que acaba antes al comienzo del
  // primero que empieza después.
  const silencioAlrededor = (t0: number, t1: number): number => {
    let antes = -Infinity;
    let despues = Infinity;
    for (let q = 0; q < N; q++) {
      if (fin[q]! <= Math.max(t0, t1)) antes = Math.max(antes, fin[q]!);
      if (ini[q]! >= Math.min(t0, t1)) despues = Math.min(despues, ini[q]!);
    }
    return despues - antes;
  };
  // Líneas enteras sin oír, entre dos palabras oídas (o en un extremo). El tramo sin oír puede empezar con las últimas
  // palabras de la línea de antes (Whisper a veces no oye el final de una línea): si no cabe, sobran las líneas enteras.
  for (let k = 0; k < n; ) {
    if (oida(palabras[k])) {
      k++;
      continue;
    }
    let f = k;
    let cuantas = 0;
    while (f < n && !oida(palabras[f])) cuantas += silabas[f++]!;
    let k1 = k; // donde empieza la primera línea entera del tramo
    while (k1 < f && !palabras[k1]?.abreLinea) k1++;
    const antes = k > 0 ? palabras[k - 1]! : null;
    const despues = f < n ? palabras[f]! : null;
    if ((antes || despues) && k1 < f && k1 - k <= COLA_SIN_OIR && (!despues || despues.abreLinea)) {
      const caben = entre(antes ? finOida(antes) - 0.1 : -Infinity, despues ? Number(despues.a) - 0.2 : Infinity);
      // Con cola, el hueco se mide desde lo último que se oyó de la línea de antes: si eso o lo de después no es de fiar,
      // sobran solo si no cabe casi nada de las líneas enteras (como una cabecera); y no si son la copia de las de después.
      const conCola = k1 > k;
      const deFiarAmbas = !conCola || ((!antes || deFiar(k - 1, -1)) && (!despues || deFiar(f, 1)));
      const medido = deFiarAmbas || cuantas - caben >= silabasEntre(k1, f) - 2;
      if (cuantas > caben + 1 && medido && !(conCola && copiaDespues(k, k1, f, caben))) sobra.fill(1, k1, f);
    }
    k = f;
  }
  // Líneas de la persona oídas donde esta voz calla: de al menos dos sílabas, en un silencio de verdad (de al menos
  // SILENCIO_LINEA s, no el aire entre dos notas picadas) y que tampoco caben en las notas que hay entre lo oído de sus
  // vecinas. Una línea corta de verdad («¡Ay!», «mar») oída medio segundo tarde cae en el silencio de detrás, pero su
  // nota sigue libre entre las de sus vecinas.
  for (let k0 = 0; k0 < n; ) {
    let k1 = k0 + 1;
    while (k1 < n && !palabras[k1]?.abreLinea) k1++;
    const p0 = palabras[k0];
    if (p0 && (p0.segura ?? (!!p0.supuesta || !Number.isFinite(Number(p0.a))))) {
      let a = Infinity;
      let b = -Infinity;
      let cuantas = 0;
      for (let k = k0; k < k1; k++) {
        cuantas += silabas[k]!;
        const p = palabras[k];
        if (!oida(p)) continue;
        a = Math.min(a, Number(p.a));
        b = Math.max(b, finOida(p));
      }
      if (cuantas >= 2 && a <= b && !suena(a + 0.15, b - 0.15) && silencioAlrededor(a + 0.15, b - 0.15) >= SILENCIO_LINEA) {
        const ka = ultimaAntes[k0]!;
        const kd = primeraDesde[k1]!;
        const caben = entre(ka >= 0 ? finOida(palabras[ka]!) - 0.1 : -Infinity, kd < n ? Number(palabras[kd]!.a) - 0.2 : Infinity);
        if (cuantas > caben) sobra.fill(1, k0, k1);
      }
    }
    k0 = k1;
  }
  return sobra;
}

/**
 * Casa las sílabas de las palabras con las notas de la melodía: una sílaba (o dos con sinalefa) en cada nota que
 * empieza sílaba, y nada en las que la alargan. Las palabras pueden venir de Whisper tal cual o de `heredarTiempos`.
 */
export function casarLetra(notas: NotaTiempo[], palabras: PalabraTiempo[], opts?: Partial<AjustesCasar>): Colocacion {
  const A: AjustesCasar = { ...AJUSTES_CASAR, ...opts };
  const listaNotas = Array.isArray(notas) ? notas : [];
  const listaPalabras = Array.isArray(palabras) ? palabras : [];
  const S = elementosDe(listaPalabras, A);

  // Las notas ligadas son el mismo sonido que la anterior.
  const sonidos: { ini: number; fin: number; nota: number }[] = [];
  listaNotas.forEach((n, q) => {
    const ultimo = sonidos[sonidos.length - 1];
    if (n.ligada && ultimo) ultimo.fin = Math.max(ultimo.fin, Number(n.fin));
    else sonidos.push({ ini: Number(n.ini), fin: Number(n.fin), nota: q });
  });
  const N = sonidos.length;
  const L = S.length;
  const silabasIdx: number[] = []; // los elementos que son sílabas
  S.forEach((s, h) => {
    if (!s.marca) silabasIdx.push(h);
  });

  const porNota: (string | undefined)[] = new Array(listaNotas.length).fill(undefined);
  const dudosas: boolean[] = new Array(listaNotas.length).fill(false);
  const descartadas: string[] = [];
  const silabas: SilabaColocada[] = silabasIdx.map((h) => ({ texto: S[h]!.texto, palabra: S[h]!.palabra, nota: -1, margen: 0 }));
  const medidas = { sigma: A.sigmaMin, desfaseConsonante: 0, desfaseVocal: 0 };

  if (silabasIdx.length === 0 || N === 0) {
    descartar(S, new Int32Array(L).fill(-1), listaPalabras, descartadas);
    return { porNota, dudosas, descartadas, silabas, medidas };
  }

  const ini = Float64Array.from(sonidos, (s) => s.ini);
  const fin = Float64Array.from(sonidos, (s) => s.fin);
  const tras = new Uint8Array(N);
  const largo = new Uint8Array(N);
  let ordenadas = true;
  for (let q = 1; q < N; q++) {
    const hueco = ini[q]! - sonidos[q - 1]!.fin;
    tras[q] = hueco > A.hueco ? 1 : 0;
    largo[q] = hueco > A.huecoLargo ? 1 : 0;
    if (!(ini[q]! >= ini[q - 1]!)) ordenadas = false;
  }
  const alargar = new Float64Array(N);
  const alargarMas = new Float64Array(N);
  const marcar = new Float64Array(N);
  const durMediana = mediana(sonidos.map((s) => s.fin - s.ini).filter((d) => d > 0)) || 1;
  for (let q = 0; q < N; q++) {
    const finDeLinea = q + 1 >= N || tras[q + 1] === 1;
    // la última nota de la frase suele ser larga, y alargarse en ella es lo normal
    const f = A.melismaDuracion ? Math.min(finDeLinea ? 1 : 2, Math.max(0.5, (fin[q]! - ini[q]!) / durMediana)) ** A.melismaDuracion : 1;
    const resto = (tras[q] ? A.silencio : 0) - (finDeLinea ? A.melismaFinal : 0);
    alargar[q] = A.melisma * (Number.isFinite(f) ? f : 1) + resto;
    alargarMas[q] = A.melismaSigue * (Number.isFinite(f) ? f : 1) + resto;
    marcar[q] = A.marca + (tras[q] ? A.silencio : 0);
  }
  // Frases: empiezan en el sonido 0 y tras cada silencio largo.
  const fraseAntes = new Int32Array(N + 1).fill(-1);
  const fraseDespues = new Int32Array(N + 1).fill(-1);
  for (let q = 0, p = 0; q <= N; q++) {
    if (q === N || (q > 0 && largo[q])) {
      fraseAntes[q] = p;
      fraseDespues[p] = q;
      p = q;
    }
  }
  // Líneas del texto y frases de la melodía: si hay tantas de unas como de otras, casi seguro que van una con otra.
  const conFrase = A.frase > 0 && S.some((s, i) => i > 0 && s.abreLinea);
  const lineas = 1 + S.filter((s, i) => i > 0 && s.abreLinea).length;
  const frases = 1 + largo.reduce((n, x) => n + x, 0);
  // (las líneas de lo que da Whisper, que empiezan donde empieza cada trozo que oye, no son de fiar tanto)
  const lineasSeguras = S.every((s) => !s.abreLinea || s.segura);
  // La sinalefa entre dos líneas no vale si la segunda palabra se oye bien entrada en una frase que empieza después de
  // que empiece a oírse: se cantó tras ese respiro, y Whisper solo ha pegado su comienzo al final de la anterior.
  const junta = Float64Array.from(S, (s) =>
    s.abreLinea && !s.sinalefaAntes && s.junta === A.sinalefa && trasRespiro(listaPalabras, s.palabra, ini, largo) ? (s.segura ? Infinity : A.junta) : s.junta,
  );
  const seguidas = new Int32Array(L + 1);
  for (let i = 1; i <= L; i++) seguidas[i] = S[i - 1]!.marca ? 0 : 1 + (junta[i - 1]! < Infinity ? seguidas[i - 1]! : 0);

  // Anclas: palabra que abre línea ↔ la primera nota tras un silencio largo más cercana. Dicen el desfase de cada
  // tramo (la mediana de las cercanas) y, por lo que se apartan de él, σ.
  const anclas: { t: number; v: number }[] = [];
  for (const s of S) {
    if (!s.abreLinea || !Number.isFinite(s.tIni)) continue;
    let mejor = NaN;
    const desde = ordenadas ? cuantos(ini, s.tIni - A.anclaMax, true) : 0;
    for (let q = desde; q < N && (!ordenadas || ini[q]! < s.tIni + A.anclaMax); q++) {
      const d = ini[q]! - s.tIni;
      if ((q === 0 || largo[q]) && Math.abs(d) < A.anclaMax && !(Math.abs(d) >= Math.abs(mejor))) mejor = d;
    }
    if (Number.isFinite(mejor)) anclas.push({ t: s.tIni, v: mejor });
  }
  // Si las anclas no son claras (pocas, o muy dispersas para lo que dicen), se empieza sin desfase.
  const ancl = porTiempo(anclas);
  const conAnclas = ancl.ts.length >= Math.min(3, A.minAnclas);
  const cAnclas = conAnclas ? centro(ancl.vs) : { m: 0, e: 0 };
  const generalAnclas = { m: Math.abs(cAnclas.m) > 2 * cAnclas.e ? cAnclas.m : 0, e: cAnclas.e };
  const desfaseAnclas = generalAnclas.m;
  const desfase0 = (t: number): number => (conAnclas ? tramo(ancl.ts, ancl.vs, t, A, 3, generalAnclas) : 0);
  let sigmaP = A.sigmaMin;
  if (ancl.ts.length >= A.minAnclas) {
    const mad = mediana(ancl.ts.map((t, k) => Math.abs(ancl.vs[k]! - desfase0(t)))) * 1.4826;
    sigmaP = Math.min(A.sigmaMax, Math.max(A.sigmaMin, A.sigmaPorAnclas * mad));
  }
  medidas.sigma = sigmaP;

  // De las palabras oídas de la persona, lo que costaría su tiempo en el sonido que empieza más cerca de cuando
  // empiezan a oírse (como el coste de tiempo del comienzo, hasta `tope`): poco si ahí empieza una nota, y el tope si
  // se oyeron lejos de todas (donde esta voz calla: lo canta otra voz, o se lo inventa Whisper).
  const lejania = Float64Array.from(S, (s) => {
    const t = s.oidaEn;
    if (t !== t) return NaN;
    let d = Infinity;
    if (ordenadas) {
      const k = cuantos(ini, t, false);
      if (k < N) d = ini[k]! - t;
      if (k > 0) d = Math.min(d, t - ini[k - 1]!);
    } else for (let q = 0; q < N; q++) d = Math.min(d, Math.abs(ini[q]! - t));
    const z = d / sigmaP;
    return Math.min(A.tope, z * z);
  });
  const sobra = sobrantes(listaPalabras, S, ini, fin, largo, ordenadas);
  const P: Problema = {
    A,
    N,
    L,
    ini,
    fin,
    tras,
    largo,
    alargar,
    alargarMas,
    marcar,
    fraseAntes,
    fraseDespues,
    ordenadas,
    junta,
    // Quitar una sílaba oída de la letra de la persona cuesta además lo que vale su tiempo: si sobra letra, se quita
    // antes lo que no se oyó, o lo que se oyó lejos de las notas, que lo que se oye donde canta esta voz. Lo que se ve
    // que sobra (`sobrantes`) se quita como lo de Whisper.
    quita: Float64Array.from(S, (s, h) =>
      s.segura && !s.marca && sobra[s.palabra] ? Math.min(s.quita, A.quita) : s.quita + (lejania[h] === lejania[h] ? A.tope - lejania[h]! : 0),
    ),
    marca: Uint8Array.from(S, (s) => (s.marca ? 1 : 0)),
    abrePalabra: Uint8Array.from(S, (s) => (s.abrePalabra ? 1 : 0)),
    abreLinea: Uint8Array.from(S, (s) => (s.abreLinea ? 1 : 0)),
    descuento: Float64Array.from(S, (s) => (s.tonica ? A.melismaTonica : 0)),
    separar: Float64Array.from(S, (s) => (s.sinalefaAntes ? A.noSinalefa : 0)),
    finPalabra: Int32Array.from(S, (s) => s.finPalabra),
    lejos: Uint8Array.from(lejania, (x) => (x >= A.tope ? 1 : 0)),
    seguidas,
    conFrase,
    fraseAbre: lineasSeguras ? costeFrase(lineas, frases, A) : A.frase,
    fraseCorta: A.frase,
  };

  const tIni = Float64Array.from(S, (s) => s.tIni);
  const tFin = Float64Array.from(S, (s) => s.tFin);
  const tiempos = (dIni: (s: number) => number, dFin: (s: number) => number, escala: number): Tiempos => ({
    tIni: Float64Array.from(S, (s, h) => s.tIni + dIni(h)),
    invIni: Float64Array.from(S, (s) => 1 / (sigmaP * escala * (s.dentro ? A.factorDentro : 1))),
    topeIni: Float64Array.from(S, (s) => (s.dentro ? A.topeDentro : A.tope)),
    // (las de la persona no se las ha inventado nadie: el tope pequeño les vale en todas partes, salvo si se oyeron
    // lejos de todas las notas)
    alcance: Float64Array.from(S, (s, h) => (s.dentro && (!s.segura || P.lejos[h]) ? s.largoPalabra + sigmaP * escala : Infinity)),
    tFin: Float64Array.from(S, (s, h) => s.tFin + dFin(h)),
    invFin: new Float64Array(L).fill(1 / (A.factorFin * sigmaP * escala)),
  });

  // Primera pasada, holgada, para afinar los desfases: el de cada tramo, y aparte el de las palabras que empiezan por
  // consonante y por vocal, y el de los finales. Se prueba sin desfase y con el de las anclas (unas pocas pueden
  // coincidir por casualidad), y se sigue con la que encaja mejor.
  let desfaseBase = (_t: number): number => 0;
  let dIni = (_h: number): number => 0;
  let dFin = (_h: number): number => 0;
  if (S.some((s) => Number.isFinite(s.tIni))) {
    let p1 = pasada(P, tiempos(dIni, dFin, A.holgura), false);
    if (conAnclas) {
      const otra = pasada(P, tiempos((h) => desfase0(tIni[h]!), (h) => desfase0(tFin[h]!), A.holgura), false);
      if (otra.coste < p1.coste) {
        p1 = otra;
        desfaseBase = desfase0;
      }
    }
    const comienzos: { t: number; v: number; vocal: boolean }[] = [];
    const finales: { t: number; v: number }[] = [];
    S.forEach((s, h) => {
      const q = p1.inicio[h]!;
      if (Number.isFinite(s.tIni) && q >= 0) {
        const d = ini[q]! - s.tIni;
        if (Math.abs(d - desfaseBase(s.tIni)) < A.desfaseMax) comienzos.push({ t: s.tIni, v: d, vocal: s.vocal });
      }
      const z = p1.cierre[h]!;
      if (Number.isFinite(s.tFin) && z >= 0) {
        const d = fin[z]! - s.tFin;
        if (Math.abs(d - desfaseBase(s.tFin)) < A.desfaseMax) finales.push({ t: s.tFin, v: d });
      }
    });
    if (comienzos.length >= A.minDesfases) {
      const todos = porTiempo(comienzos);
      const cGeneral = centro(todos.vs);
      const general = cGeneral.m;
      const local = (t: number): number => tramo(todos.ts, todos.vs, t, A, 5, cGeneral);
      const rc: number[] = [];
      const rv: number[] = [];
      for (const c of comienzos) (c.vocal ? rv : rc).push(c.v - local(c.t));
      const dc = rc.length >= A.minDesfases ? mediana(rc) : 0;
      const dv = rv.length >= A.minDesfases ? mediana(rv) : dc;
      const rf = finales.map((f) => f.v - local(f.t));
      const df = rf.length >= A.minDesfases ? mediana(rf) : 0;
      dIni = (h) => local(tIni[h]!) + (S[h]!.vocal ? dv : dc);
      dFin = (h) => local(tFin[h]!) + df;
      medidas.desfaseConsonante = general + dc;
      medidas.desfaseVocal = general + dv;
    } else {
      dIni = (h) => desfaseBase(tIni[h]!);
      dFin = (h) => desfaseBase(tFin[h]!);
      medidas.desfaseConsonante = medidas.desfaseVocal = desfaseBase(NaN);
    }
  }

  const r = pasada(P, tiempos(dIni, dFin, 1), true);
  const { inicio } = r;
  const margen = r.margen!;

  // Lo que va en cada nota: las sílabas seguidas que empiezan en el mismo sonido. Si lo que sigue de la palabra no ha
  // cabido, la nota no lleva guion (la palabra no sigue en otra nota: con él, el karaoke y el texto para corregir la
  // pegarían a la de después, «no-» y «lu-na» darían «nolu-na»), y queda dudosa.
  const dudoso = new Uint8Array(N);
  for (let h = 0; h < L; ) {
    const q = inicio[h]!;
    let f = h + 1;
    if (!S[h]!.marca) while (f < L && !S[f]!.marca && inicio[f] === q && q >= 0) f++;
    if (q >= 0 && !S[h]!.marca) {
      const texto = escribir(S, h, f);
      const colgando = !S[f - 1]!.cierraPalabra && !sigueLaPalabra(S, inicio, f - 1);
      porNota[sonidos[q]!.nota] = colgando ? texto.replace(/-$/u, '') : texto;
      if (colgando) dudoso[q] = 1;
    }
    h = f;
  }

  // Dudosas: la sílaba podría ir en otro sitio por poco, su tiempo no cuadra nada, va junta con otra sin sinalefa
  // ni hiato, o al lado hay sílabas que no han cabido.
  silabasIdx.forEach((h, k) => {
    const q = inicio[h]!;
    silabas[k]!.nota = q >= 0 ? sonidos[q]!.nota : -1;
    silabas[k]!.margen = margen[h]!;
    if (q < 0) return;
    if (margen[h]! < A.duda) dudoso[q] = 1;
    if (Number.isFinite(S[h]!.tIni) && r.ctIni(h, q) >= A.tope) dudoso[q] = 1;
    if (h > 0 && inicio[h - 1] === q && !S[h - 1]!.marca && S[h]!.forzada) dudoso[q] = 1;
  });
  for (let k = 0; k < silabasIdx.length; k++) {
    const h = silabasIdx[k]!;
    if (inicio[h]! >= 0) continue;
    let p = k - 1;
    while (p >= 0 && inicio[silabasIdx[p]!]! < 0) p--;
    let n = k + 1;
    while (n < silabasIdx.length && inicio[silabasIdx[n]!]! < 0) n++;
    if (n >= silabasIdx.length) n = -1;
    const hp = p >= 0 ? silabasIdx[p]! : -1;
    const hn = n >= 0 ? silabasIdx[n]! : -1;
    // en medio de la letra, o partiendo una palabra
    if (hp >= 0 && (hn >= 0 || S[hp]!.palabra === S[h]!.palabra)) dudoso[inicio[hp]!] = 1;
    if (hn >= 0 && (hp >= 0 || S[hn]!.palabra === S[h]!.palabra)) dudoso[inicio[hn]!] = 1;
  }
  for (let q = 0; q < N; q++) if (dudoso[q]) dudosas[sonidos[q]!.nota] = true;

  descartar(S, inicio, listaPalabras, descartadas);
  return { porNota, dudosas, descartadas, silabas, medidas };
}

/** Las sílabas h…f−1 (seguidas) escritas en una nota: «se‿a», «poe-», «vor». */
function escribir(S: Elem[], h: number, f: number): string {
  let texto = '';
  for (let k = h; k < f; k++) {
    if (k > h && S[k]!.abrePalabra) texto += SINALEFA;
    texto += S[k]!.texto;
  }
  return S[f - 1]!.cierraPalabra ? texto : `${texto}-`;
}

/** Si la palabra de la sílaba h, que no la cierra, sigue en otra nota: alguna de las sílabas que la siguen hasta la que
 *  la cierra tiene nota (los «_» no cuentan). */
function sigueLaPalabra(S: Elem[], inicio: Int32Array, h: number): boolean {
  for (let k = h + 1; k < S.length; k++) {
    if (S[k]!.marca) continue;
    if (inicio[k]! >= 0) return true;
    if (S[k]!.cierraPalabra) return false;
  }
  return false;
}

/** Las sílabas sin nota, agrupadas por palabra: la palabra entera si no ha cabido nada de ella. */
function descartar(S: Elem[], inicio: Int32Array, palabras: PalabraTiempo[], salida: string[]): void {
  const idx: number[] = [];
  S.forEach((s, h) => {
    if (!s.marca) idx.push(h);
  });
  for (let k = 0; k < idx.length; ) {
    const h = idx[k]!;
    if (inicio[h]! >= 0) {
      k++;
      continue;
    }
    const w = S[h]!.palabra;
    let f = k;
    while (f < idx.length && inicio[idx[f]!]! < 0 && S[idx[f]!]!.palabra === w) f++;
    const entera = (k === 0 || S[idx[k - 1]!]!.palabra !== w) && (f === idx.length || S[idx[f]!]!.palabra !== w);
    if (entera) salida.push(String(palabras[w]?.texto ?? '').trim().replace(/\s+/gu, ' '));
    else {
      // las sílabas sin nota de la palabra, seguidas, como irían en una nota
      const sub = idx.slice(k, f).map((i) => S[i]!);
      let texto = '';
      sub.forEach((s, r) => {
        if (r > 0 && s.abrePalabra) texto += SINALEFA;
        texto += s.texto;
      });
      salida.push(sub[sub.length - 1]!.cierraPalabra ? texto : `${texto}-`);
    }
    k = f;
  }
}
