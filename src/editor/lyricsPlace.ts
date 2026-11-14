// Poner la letra en las notas de una voz y, si se quiere, en las de las voces que van a su ritmo. Dos maneras:
//   - una sílaba en cada nota, en orden (`assignLyrics`): para la letra que se escribe a mano;
//   - cada sílaba en la nota en que se oye cantar en la grabación (`placeHeard`): lo que se oye lo saca Whisper
//     (import/transcribe.ts) y el reparto lo hace `casarLetra` (lyricsAlign.ts), con sinalefas y melismas.
// Las voces que van al ritmo de la que lleva la letra pueden llevar la misma sílaba (`copyLyrics`): en un coro casi
// siempre cantan lo mismo.
import { isSung } from '../ai/fusion';
import {
  casarLetra,
  heredarTiempos,
  palabrasDeTexto,
  type Colocacion,
  type NotaTiempo,
  type PalabraTiempo,
  type SilabaColocada,
} from '../lyricsAlign';
import { AT_ONCE, byStart, lyricsCopyOf, onsetPartner, sameSyllable, type Note, type Song, type Voice } from '../model';

/** Dos ataques a menos de esto se cantan a la vez (`AT_ONCE`, 30 ms). */
const A_LA_VEZ = AT_ONCE;
/** Un silencio de al menos esto en la voz separa frases: frase a frase se mira qué voces van a su ritmo. */
const RESPIRO = 0.35;
/** En una frase, otra voz va al ritmo de la que lleva la letra si al menos esta parte de sus notas ataca a la vez que
 *  una de ella, y al revés: esta parte de sus sílabas, mientras canta la otra voz, tiene su ataque en ella. */
const AL_RITMO = 0.8;
/** En una frase, otra voz canta su propia letra (y no se toca) si menos de esta parte de sus sílabas con pareja son
 *  copia. Por mayoría: con el 90 %, una sola sílaba distinta en una frase corta (cambiada a mano o así en la
 *  partitura) la dejaba entera sin corregir. */
const PROPIA = 0.5;
/** Una palabra oída que empieza más de esto después de acabar la anterior abre línea (como en `lyricsFromWords`). */
const LINEA = 0.6;
/** Lo que se deja de oír más de esto antes de la primera nota de la voz no es suyo: lo canta otra (una introducción) o
 *  se lo inventa Whisper. */
const ANTES_DE_LA_VOZ = 0.5;
/** Una palabra oída que no cabe en ninguna nota cuenta desde una nota si empieza como mucho esto antes que ella. */
const ANTES_DE_LA_NOTA = 0.25;

/** Una voz que recibe la copia en unas frases y en otras no. */
export interface SinCopiar {
  voz: string;
  /** Las frases de la voz con la letra en que esta canta y no se le copia nada: ahí no va al mismo ritmo. */
  frases: number;
}

export interface LyricsResult {
  /** Sílabas puestas en la voz (las que van juntas en una nota por sinalefa cuentan una). */
  puestas: number;
  /** Sílabas que no han cabido (en orden: no había más notas). */
  sobran: number;
  /** En orden: notas de la voz que se han quedado sin sílaba al final. */
  sinLetra: number;
  /** Notas de la voz que se marcan en ámbar para revisar: donde se oye, las que no están claras; en orden, la última si
   *  su palabra no cabe entera (sobran sílabas). */
  dudosas: number;
  /** Donde se oye: palabras o sílabas oídas que no tienen nota (se las pudo inventar Whisper). */
  descartadas: string[];
  /** Notas de otras voces que han recibido la sílaba de la suya (también las que ya la tenían copiada). */
  otras: number;
  /** Notas de otras voces que conservan su sílaba porque es distinta de la de su pareja (no era una copia). */
  distintas: number;
  /** Notas de otras voces que se quedan con media palabra (sin guion y en ámbar): esa voz no canta el resto. */
  cortadas: number;
  /** Voces a las que no se ha copiado nada porque no van al mismo ritmo. */
  otroRitmo: string[];
  /** Voces que reciben la copia, pero no en todas las frases: en algunas no van al mismo ritmo. */
  sinCopiar: SinCopiar[];
}

const vacio = (): LyricsResult => ({
  puestas: 0,
  sobran: 0,
  sinLetra: 0,
  dudosas: 0,
  descartadas: [],
  otras: 0,
  distintas: 0,
  cortadas: 0,
  otroRitmo: [],
  sinCopiar: [],
});

/** Quita la letra (y la marca de duda) de unas notas. */
function borra(notas: Note[]): void {
  for (const n of notas) {
    delete n.lyric;
    delete n.lyricDoubt;
  }
}

/** La sílaba que tiene cada nota (para saber, al cambiarla, cuáles eran copia en las otras voces). */
const silabasDe = (notas: Note[]) => new Map<Note, string | undefined>(notas.map((n) => [n, n.lyric]));

/** La nota de `notas` (en el orden de sus ataques) que ataca a la vez que `n` (la más cercana), si la hay. */
const pareja = onsetPartner;

/** El primer índice de `notas` (en el orden de sus ataques) cuya nota no cumple `antes` (búsqueda binaria). */
function primeraQueNo(notas: Note[], antes: (n: Note) => boolean): number {
  let lo = 0;
  let hi = notas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (antes(notas[mid])) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Las notas de `notas` (en el orden de sus ataques) que atacan entre `a` y `b`, sin contarlos. */
function entre(notas: Note[], a: number, b: number): Note[] {
  return notas.slice(
    primeraQueNo(notas, (n) => n.start <= a),
    primeraQueNo(notas, (n) => n.start < b),
  );
}

/** Las notas partidas en frases por los silencios de al menos `RESPIRO`. */
function frases(notas: Note[]): Note[][] {
  const salida: Note[][] = [];
  let fin = -Infinity;
  for (const n of notas) {
    if (!salida.length || n.start - fin >= RESPIRO) salida.push([]);
    salida[salida.length - 1].push(n);
    fin = Math.max(fin, n.start + n.dur);
  }
  return salida;
}

/**
 * Si las notas `tramo` de otra voz van al ritmo de la frase `f` (ya con su letra):
 *   - al menos 8 de cada 10 atacan a la vez que una de `f`. Las notas de paso no cuentan en contra (las que empiezan
 *     mientras aún suena la nota de `f` con la que atacó la anterior: alargan su sílaba), pero como mucho tantas como
 *     las que atacan a la vez: una voz mucho más movida que la melodía no canta su letra;
 *   - y al revés: de las sílabas de `f` que empiezan mientras canta esa voz, al menos 8 de cada 10 tienen un ataque en
 *     ella. Si no, es una voz de notas largas (blancas bajo negras, un «uuh», un bajo en las partes fuertes), y con
 *     las sílabas de sus ataques se quedaría con palabras a medias. Las palabras enteras que caen en un silencio de esa
 *     voz no cuentan (calla unas notas entre dos palabras: no las canta); una nota que se sostiene, sí.
 */
function alRitmo(f: Note[], tramo: Note[]): boolean {
  let juntas = 0;
  let deMas = 0;
  let ultima: Note | undefined;
  for (const n of tramo) {
    const m = pareja(f, n);
    if (m) {
      juntas++;
      ultima = m;
    } else if (ultima && n.start < ultima.start + ultima.dur - A_LA_VEZ) deMas++;
    else ultima = undefined;
  }
  if (juntas < AL_RITMO * (tramo.length - Math.min(deMas, juntas))) return false;
  // Hasta dónde suena esa voz en cada nota: el final más tardío de las notas hasta ella (pueden solaparse).
  const hastaAqui: number[] = [];
  let fin = -Infinity;
  for (const n of tramo) hastaAqui.push((fin = Math.max(fin, n.start + n.dur)));
  /** Si la sílaba `x` empieza a la vez que una nota de esa voz. */
  const ataca = (x: Note) => !!pareja(tramo, x);
  /** Si esa voz calla cuando empieza la sílaba `x`: no ataca entonces ni suena una nota suya. */
  const calla = (x: Note) => {
    const i = primeraQueNo(tramo, (n) => n.start - A_LA_VEZ < x.start);
    return !ataca(x) && !(i > 0 && hastaAqui[i - 1] - A_LA_VEZ > x.start);
  };
  const conLetra = f.filter((x) => x.lyric);
  const calladas = new Set<Note>();
  for (let i = 0; i < conLetra.length; ) {
    let j = i;
    while (j < conLetra.length - 1 && conLetra[j].lyric!.endsWith('-')) j++;
    const palabra = conLetra.slice(i, j + 1);
    if (palabra.every(calla)) for (const x of palabra) calladas.add(x);
    i = j + 1;
  }
  const desde = tramo[0].start - A_LA_VEZ;
  const hasta = fin - A_LA_VEZ;
  const cuentan = conLetra.filter((x) => x.start >= desde && x.start <= hasta && !calladas.has(x));
  return cuentan.filter(ataca).length >= AL_RITMO * cuentan.length;
}

/**
 * La sílaba de cada nota de `notas` (de `voice`) pasa a la nota de cada otra voz que ataca a la vez, con su marca de
 * duda. Se mira frase a frase (las frases enteras de `voice`, separadas por silencios, aunque `notas` empiece a mitad
 * de una), y solo se copia en las frases en que esa voz va a su ritmo (`alRitmo`); sus notas de paso alargan la sílaba
 * anterior. Las notas que ya tienen letra solo cambian si era copia de la que tenía su pareja (`antes`: la sílaba de
 * cada nota de `notas` antes de cambiarla); si la pareja ya no tiene, se les quita. Y se decide por frase: si menos de
 * la mitad de sus sílabas son copia (`PROPIA`), esa voz canta ahí su propia letra y no se toca nada suyo (una sílaba
 * igual por casualidad no es una copia). Si no, tampoco se rellenan las notas sin sílaba que alargan una sílaba suya
 * (un melisma que hizo la persona). Sin `antes`, solo se rellenan las notas sin sílaba.
 *
 * Si esa voz calla (o sostiene una nota, o va a otro ritmo) en la sílaba siguiente de una palabra, la última que
 * recibe se queda sin el guion (con él, el karaoke y el MIDI la pegarían a la palabra siguiente: «Can- ta-» y «la luz»
 * darían «Cantala») y en ámbar, salvo si ya la tenía así, sin el guion y sin ámbar (alguien la ha revisado), o si
 * `revisadas` (se dan por buenas). Si solo adelanta o retrasa esa sílaba (una síncopa, un puntillo), la palabra sigue.
 */
export function copyLyrics(
  song: Song,
  voice: Voice,
  notas: Note[],
  antes?: Map<Note, string | undefined>,
  revisadas = false,
): Pick<LyricsResult, 'otras' | 'distintas' | 'otroRitmo' | 'sinCopiar' | 'cortadas'> {
  let otras = 0;
  let distintas = 0;
  let cortadas = 0;
  const otroRitmo: string[] = [];
  const sinCopiar: SinCopiar[] = [];
  const tocadas = new Set(notas);
  const todas = byStart(voice.notes);
  // Las frases que se tocan; también las que se han quedado sin letra: las copias de la que tenían se van con ella.
  const conLetra = frases(todas).filter((f) => f.some((n) => tocadas.has(n)) && f.some((n) => n.lyric || antes?.get(n)));
  /** La nota con la sílaba siguiente a la de `m` en `voice`. */
  const posicion = new Map(todas.map((n, i) => [n, i]));
  const siguiente = (m: Note) => {
    for (let i = posicion.get(m)! + 1; i < todas.length; i++) if (todas[i].lyric) return todas[i];
    return undefined;
  };
  for (const v of song.voices) {
    if (v === voice || isSung(v)) continue;
    const suyas = byStart(v.notes);
    let vistas = 0;
    let copiadas = 0;
    /** Las notas de esta voz que reciben una sílaba: de qué nota, y qué sílaba y marca tenían antes. */
    const recibe = new Map<Note, { de: Note; tenia?: string; dudaba: boolean }>();
    for (const f of conLetra) {
      // Las que atacan a la vez que la primera o la última nota de la frase (hasta `A_LA_VEZ`) también son suyas.
      const tramo = entre(suyas, f[0].start - A_LA_VEZ, f[f.length - 1].start + A_LA_VEZ);
      if (!tramo.length) continue;
      vistas++;
      if (!alRitmo(f, tramo)) continue;
      copiadas++;
      // Cada nota suya con la que ataca a la vez, si es de las que se tocan.
      const pares: [Note, Note][] = [];
      for (const n of tramo) {
        const m = pareja(f, n);
        if (m && tocadas.has(m)) pares.push([n, m]);
      }
      // Una copia que perdió el guion («ta» de «ta-») sigue siendo copia.
      const esCopia = (n: Note, m: Note) => !!antes?.has(m) && sameSyllable(n.lyric, antes.get(m));
      let conSilaba = 0;
      let copias = 0;
      for (const [n, m] of pares) {
        if (!n.lyric) continue;
        conSilaba++;
        if (esCopia(n, m)) copias++;
      }
      const propia = !!antes && conSilaba > 0 && copias < PROPIA * conSilaba;
      /** Si la última sílaba de esta voz hasta aquí en la frase es suya (se queda: no era copia). */
      let suya = false;
      for (const [n, m] of pares) {
        const copia = !propia && esCopia(n, m);
        if (n.lyric && !copia) {
          if (!sameSyllable(n.lyric, m.lyric)) distintas++;
          suya = true;
          continue;
        }
        // Con su propia letra, tampoco se rellenan sus notas sin sílaba: suelen alargar la anterior (un melisma). Ni,
        // aunque la frase sea copia, las que siguen a una sílaba suya donde `voice` tenía sílaba: así alarga la suya (un
        // melisma que hizo la persona); el melisma sigue aunque pase por una nota en que `voice` no tiene sílaba (ni
        // antes ni ahora). Las que no tenían sílaba porque `voice` tampoco (copiaban su melisma) y ahora sí, la reciben.
        if (propia || (suya && !n.lyric && (antes?.get(m) || !m.lyric))) continue;
        suya = false;
        if (m.lyric) {
          recibe.set(n, { de: m, tenia: n.lyric, dudaba: !!n.lyricDoubt });
          n.lyric = m.lyric;
          if (m.lyricDoubt) n.lyricDoubt = true;
          else delete n.lyricDoubt;
          otras++;
        } else borra([n]);
      }
    }
    // Las palabras que no siguen en esta voz: su sílaba siguiente con letra no ataca a la vez que la que sigue en `voice`
    // (si la tiene ahí, aunque sea suya y distinta, la palabra sigue: así la cambió la persona). Si en `voice` no hay más
    // letra, la copia se queda como ella.
    const conSilaba = suyas.filter((n) => n.lyric);
    conSilaba.forEach((n, i) => {
      const r = recibe.get(n);
      if (!r || !n.lyric!.endsWith('-')) return;
      const m2 = siguiente(r.de);
      if (!m2) return;
      // Las notas que reciben la misma sílaba o atacan a la vez (un acorde en la voz) no son la siguiente.
      let j = i + 1;
      while (j < conSilaba.length && (recibe.get(conSilaba[j])?.de === r.de || Math.abs(conSilaba[j].start - n.start) < A_LA_VEZ)) j++;
      const n2 = conSilaba[j];
      if (n2 && Math.abs(n2.start - m2.start) < A_LA_VEZ) return;
      // Tampoco si su sílaba siguiente es suya (no se ha tocado), es la que sigue en `voice` (con las mismas letras: una
      // coma o una tilde no cambian la palabra) y llega antes que la otra: dice la misma palabra, pero adelanta o retrasa
      // esa sílaba (una síncopa, un puntillo).
      if (n2 && !recibe.has(n2) && letras(n2.lyric!) === letras(m2.lyric!)) {
        const m3 = siguiente(m2);
        if (n2.start < (m3 ? m3.start : m2.start + m2.dur) - A_LA_VEZ) return;
      }
      n.lyric = n.lyric!.slice(0, -1);
      // Quitar un guion nunca pasa callado: en ámbar, salvo si ya la tenía así, sin el guion y sin ámbar.
      if (!revisadas && (r.dudaba || r.tenia !== n.lyric)) n.lyricDoubt = true;
      if (n.lyricDoubt) cortadas++;
    });
    if (vistas && !copiadas) otroRitmo.push(v.name);
    else if (vistas > copiadas) sinCopiar.push({ voz: v.name, frases: vistas - copiadas });
  }
  return { otras, distintas, otroRitmo, sinCopiar, cortadas };
}

/** «a» delante de cada nombre menos el primero, y «ni» delante del último: «A», «A ni a B», «A, a B ni a C». */
const niA = (xs: string[]) => xs.reduce((s, x, i) => (i === 0 ? x : i === xs.length - 1 ? `${s} ni a ${x}` : `${s}, a ${x}`), '');

/**
 * Lo que hay que contar de las otras voces al copiarles la letra, en partes de un aviso (en minúscula y sin punto): las
 * notas con otra sílaba que no se tocan, las que se quedan con media palabra, las voces que van a otro ritmo y las
 * frases en que no se copia a una voz.
 */
export function copyNotices(res: Pick<LyricsResult, 'distintas' | 'otroRitmo' | 'sinCopiar'> & Partial<Pick<LyricsResult, 'cortadas'>>): string[] {
  const partes: string[] = [];
  if (res.distintas)
    partes.push(
      res.distintas === 1
        ? '1 nota de las otras voces tiene otra sílaba y se queda como estaba'
        : `${res.distintas} notas de las otras voces tienen otra sílaba y se quedan como estaban`,
    );
  if (res.cortadas)
    partes.push(
      res.cortadas === 1
        ? '1 nota de las otras voces se queda con media palabra, en ámbar'
        : `${res.cortadas} notas de las otras voces se quedan con media palabra, en ámbar`,
    );
  if (res.otroRitmo.length)
    partes.push(`no se copia a ${niA(res.otroRitmo.map((v) => `«${v}»`))}: ${res.otroRitmo.length === 1 ? 'va' : 'van'} a otro ritmo`);
  if (res.sinCopiar.length) {
    // «a «Baja» en 2 frases ni a «Tenor» en 1»
    const cuales = res.sinCopiar.map((s, i) => `«${s.voz}» en ${i > 0 ? s.frases : s.frases === 1 ? '1 frase' : `${s.frases} frases`}`);
    partes.push(`no se copia a ${niA(cuales)}: ahí ${res.sinCopiar.length === 1 ? 'va' : 'van'} a otro ritmo`);
  }
  return partes;
}

/**
 * Si las otras voces que tienen letra la tienen (casi toda) copiada de `voice` (`lyricsCopyOf`): cada sílaba, la de la
 * nota de `voice` que ataca a la vez. También si ninguna otra tiene letra (no hay nada suyo que estropear).
 */
export function lyricsCopied(song: Song, voice: Voice): boolean {
  return song.voices.every((v) => v === voice || isSung(v) || lyricsCopyOf(v, voice));
}

/**
 * Pone las sílabas en las notas de `voice` desde la nota `desde`, una en cada nota y en orden (la letra que ya tenían
 * desde ahí se quita, pero la marca ámbar se queda donde la sílaba no cambia: nadie la ha revisado). «_» deja una nota
 * sin sílaba nueva: la anterior sigue sonando. Si sobran sílabas y la última que cabe es de una palabra que sigue en
 * ellas («jun-»), esa nota se queda sin el guion (con él, el karaoke y el texto la pegarían a la siguiente palabra que
 * se ponga) y en ámbar, como en `casarLetra`; cuenta en `dudosas`. Con `others`, las voces que van a su ritmo reciben
 * su sílaba (`copyLyrics`).
 */
export function assignLyrics(song: Song, voice: Voice, syllables: string[], desde: number, others: boolean): LyricsResult {
  const notas = desde >= 0 ? voice.notes.slice(desde) : [];
  const antes = silabasDe(notas);
  const dudaban = notas.filter((n) => n.lyricDoubt);
  borra(notas);
  const res = vacio();
  let k = 0;
  let i = 0;
  let ultima: Note | undefined; // la nota de la última sílaba puesta
  for (; i < syllables.length && k < notas.length; i++, k++) {
    if (syllables[i] === '_') continue;
    notas[k].lyric = syllables[i];
    ultima = notas[k];
    res.puestas++;
  }
  for (const n of dudaban) if (n.lyric && n.lyric === antes.get(n)) n.lyricDoubt = true;
  res.sobran = syllables.slice(i).filter((s) => s !== '_').length;
  if (res.sobran && ultima?.lyric?.endsWith('-')) {
    ultima.lyric = ultima.lyric.slice(0, -1);
    ultima.lyricDoubt = true;
    res.dudosas = 1;
  }
  res.sinLetra = notas.length - k;
  if (others) Object.assign(res, copyLyrics(song, voice, notas, antes));
  return res;
}

/** Las palabras oídas tal cual, con una línea nueva en cada respiro (como se ven escritas en el diálogo). */
export function heardLines(oidas: PalabraTiempo[]): PalabraTiempo[] {
  return oidas.map((p, k) => ({ texto: p.texto, a: p.a, b: p.b, abreLinea: k === 0 || p.a - oidas[k - 1].b > LINEA }));
}

const tiempos = (notas: Note[]): NotaTiempo[] => notas.map((n) => ({ ini: n.start, fin: n.start + n.dur }));

/** Lo oído colocado en todas las notas de una voz: las palabras que se casan y dónde cae cada sílaba. */
interface Entera {
  palabras: PalabraTiempo[];
  c: Colocacion;
}

/** La última colocación de una voz entera: la vista previa del diálogo la pide en cada cambio, y tarda. */
let ultima: { oidas: PalabraTiempo[]; clave: string; entera: Entera } | null = null;

function entera(notas: Note[], oidas: PalabraTiempo[]): Entera {
  const clave = `${oidas.length}|${notas.map((n) => `${n.start}/${n.dur}`).join(' ')}`;
  if (ultima && ultima.oidas === oidas && ultima.clave === clave) return ultima.entera;
  const t0 = notas.length ? notas[0].start - ANTES_DE_LA_VOZ : -Infinity;
  const palabras = oidas.filter((p) => !(p.b < t0));
  const e = { palabras, c: casarLetra(tiempos(notas), heardLines(palabras)) };
  ultima = { oidas, clave, entera: e };
  return e;
}

/**
 * Qué palabras de la voz entera cuentan desde la nota `k` (< notas.length): las que tienen su primera sílaba en una
 * nota desde `k`. Las que no han cabido en ninguna nota van con lo que tienen delante si eso ya cuenta, y si no, por su
 * tiempo (empiezan como mucho `ANTES_DE_LA_NOTA` antes de la nota `k` y lo siguiente no cae antes de ella).
 */
function cuentanDesde(notas: Note[], e: Entera, k: number): boolean[] {
  const W = e.palabras.length;
  const primera = new Array<number>(W).fill(-1);
  const ultimaNota = new Array<number>(W).fill(-1);
  for (const s of e.c.silabas) {
    if (s.nota < 0) continue;
    if (primera[s.palabra] < 0 || s.nota < primera[s.palabra]) primera[s.palabra] = s.nota;
    ultimaNota[s.palabra] = Math.max(ultimaNota[s.palabra], s.nota);
  }
  const siguiente = new Array<number>(W);
  for (let w = W - 1, q = Infinity; w >= 0; w--) {
    siguiente[w] = q;
    if (primera[w] >= 0) q = Math.min(q, primera[w]);
  }
  const t = notas[k].start - ANTES_DE_LA_NOTA;
  const cuenta: boolean[] = [];
  for (let w = 0, delante = -1; w < W; w++) {
    cuenta.push(primera[w] >= 0 ? primera[w] >= k : delante >= k || (siguiente[w] >= k && !(e.palabras[w].a < t)));
    delante = Math.max(delante, ultimaNota[w]);
  }
  return cuenta;
}

/** La colocación de la voz entera desde la nota `k`: lo que cae en sus notas y lo que no cabe de lo que cuenta. */
function recorta(e: Entera, cuenta: boolean[], k: number): Colocacion {
  const { c } = e;
  const silabas: SilabaColocada[] = [];
  const descartadas: string[] = [];
  let trozos = 0;
  let delante = -1; // la nota de la última sílaba colocada
  for (let i = 0; i < c.silabas.length; ) {
    const s = c.silabas[i];
    if (s.nota >= 0) {
      if (s.nota >= k) silabas.push({ ...s, nota: s.nota - k });
      delante = Math.max(delante, s.nota);
      i++;
      continue;
    }
    // Un trozo sin nota: las sílabas seguidas de una palabra, como las cuenta `casarLetra` en `descartadas`.
    let j = i;
    while (j < c.silabas.length && c.silabas[j].nota < 0 && c.silabas[j].palabra === s.palabra) j++;
    if (delante >= k || cuenta[s.palabra]) {
      silabas.push(...c.silabas.slice(i, j));
      if (trozos < c.descartadas.length) descartadas.push(c.descartadas[trozos]);
    }
    trozos++;
    i = j;
  }
  return {
    porNota: c.porNota.slice(k),
    dudosas: c.dudosas.slice(k),
    descartadas: trozos === c.descartadas.length ? descartadas : c.descartadas.slice(),
    silabas,
    medidas: c.medidas,
  };
}

/** Solo las letras, en minúscula y sin tildes: «Ción,» → «cion». */
const letras = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Desde qué nota se casa el texto corregido si se empieza en la nota `k` (de `notas`, todas las de la voz). Si `k`
 * parte una palabra (en la voz entera, desde ella cae el final de una que empieza antes) o alarga la última sílaba de
 * antes (un melisma, sin un respiro entre medias), desde la primera nota de la primera palabra que cuenta: lo de antes
 * no está en el texto (`heardFrom`), y casándolo desde `k` la palabra siguiente se estiraría hacia atrás. Salvo si el
 * texto empieza justo por el final de la palabra partida: es la letra que ya tenían las notas (`plainLyrics`).
 */
function desdeDondeCasar(notas: Note[], e: Entera, cuenta: boolean[], k: number, texto: string): number {
  let q0 = Infinity;
  let cola = '';
  let enCola = Infinity;
  let antes = -1; // la nota de la última sílaba antes de k
  for (const s of e.c.silabas) {
    if (s.nota < 0) continue;
    if (s.nota < k) antes = Math.max(antes, s.nota);
    else if (cuenta[s.palabra]) q0 = Math.min(q0, s.nota);
    else {
      cola += s.texto;
      enCola = Math.min(enCola, s.nota);
    }
  }
  if (!Number.isFinite(q0) || q0 <= k) return k;
  const ps = palabrasDeTexto(texto);
  const pals = ps.map((p) => letras(p.texto));
  // Si la persona ha añadido palabras delante de la primera oída que cuenta, en su misma línea (Whisper no oyó una y su
  // nota se quedó vacía o con el final de la de antes), pueden ir en las notas k…q0−1: se casa desde k. Una línea
  // entera delante (una cabecera, «Coro:») no cuenta: esa la quita casarLetra.
  const w = cuenta.indexOf(true);
  const j = w >= 0 ? pals.indexOf(letras(e.palabras[w].texto)) : -1;
  if (j > 0 && !ps[j].abreLinea) return k;
  if (enCola < q0) return (pals[0] ?? '') === letras(cola) ? k : q0;
  if (antes < 0) return k;
  for (let i = antes + 1, fin = notas[antes].start + notas[antes].dur; i <= k; i++) {
    if (notas[i].start - fin >= RESPIRO) return k;
    fin = Math.max(fin, notas[i].start + notas[i].dur);
  }
  return q0;
}

/**
 * Las palabras oídas que, al colocar lo oído en toda la voz (`notas`, todas), cuentan desde la nota `desde`: las que
 * tienen ahí su primera sílaba o después (y las que no caben en ninguna nota, por lo que tienen delante o su tiempo).
 * Con ellas se escribe lo oído desde esa nota y se pasan los tiempos a la letra corregida.
 */
export function heardFrom(notas: Note[], desde: number, oidas: PalabraTiempo[]): PalabraTiempo[] {
  if (desde < 0 || desde >= notas.length) return [];
  const e = entera(notas, oidas);
  const cuenta = cuentanDesde(notas, e, desde);
  return e.palabras.filter((_, w) => cuenta[w]);
}

/**
 * Dónde caería cada sílaba en las notas de una voz desde la nota `desde`, sin tocarlas. `notas`: todas las de la voz;
 * lo que sale (`porNota`, `dudosas`…) es de `notas[desde]` en adelante. `oidas`: lo que se oye cantar, en segundos de
 * la canción. `texto`: la letra corregida por la persona (cada palabra se lleva el tiempo de la que se oyó en su sitio,
 * de las que cuentan desde esa nota, `heardFrom`; las que añade van entre sus vecinas, por la música), o null para
 * poner lo oído tal cual: entonces se coloca en toda la voz y desde la nota `desde` cae lo mismo que al ponerlo todo.
 * Así lo que se cantó justo antes no entra en la primera nota. Con texto, si esa nota parte una palabra, sus notas se
 * quedan con el final de la palabra, como al ponerlo todo (`desdeDondeCasar`; esas notas no están en `silabas`).
 */
export function placeHeardPreview(notas: Note[], desde: number, oidas: PalabraTiempo[], texto: string | null): Colocacion {
  const k = desde >= 0 ? Math.min(desde, notas.length) : notas.length;
  if (k >= notas.length) return texto === null ? casarLetra([], []) : casarLetra([], heredarTiempos(texto, [], []));
  const e = entera(notas, oidas);
  const cuenta = cuentanDesde(notas, e, k);
  if (texto === null) return recorta(e, cuenta, k);
  const q0 = desdeDondeCasar(notas, e, cuenta, k, texto);
  const nt = tiempos(notas.slice(q0));
  const c = casarLetra(nt, heredarTiempos(texto, e.palabras.filter((_, w) => cuenta[w]), nt));
  if (q0 === k) return c;
  return {
    ...c,
    porNota: [...e.c.porNota.slice(k, q0), ...c.porNota],
    dudosas: [...e.c.dudosas.slice(k, q0), ...c.dudosas],
    silabas: c.silabas.map((s) => (s.nota >= 0 ? { ...s, nota: s.nota + q0 - k } : s)),
  };
}

/**
 * Pone la letra en las notas de `voice` desde la nota `desde`, cada sílaba en la nota en que se oye (la letra que ya
 * tenían desde ahí se quita). Las notas que conviene revisar quedan marcadas (`lyricDoubt`, en ámbar). Con `others`,
 * las voces que van a su ritmo reciben su sílaba (`copyLyrics`).
 */
export function placeHeard(
  song: Song,
  voice: Voice,
  oidas: PalabraTiempo[],
  texto: string | null,
  desde: number,
  others: boolean,
): LyricsResult {
  const k = desde >= 0 ? Math.min(desde, voice.notes.length) : voice.notes.length;
  const notas = voice.notes.slice(k);
  const c = placeHeardPreview(voice.notes, k, oidas, texto);
  const antes = silabasDe(notas);
  borra(notas);
  const res = vacio();
  notas.forEach((n, i) => {
    const l = c.porNota[i];
    if (l) n.lyric = l;
    if (c.dudosas[i]) {
      n.lyricDoubt = true;
      res.dudosas++;
    }
  });
  // Como en orden: cuenta las notas con sílaba («se‿a», dos sílabas en una nota por sinalefa, cuenta una).
  res.puestas = c.porNota.filter(Boolean).length;
  res.descartadas = c.descartadas;
  if (others) Object.assign(res, copyLyrics(song, voice, notas, antes));
  return res;
}
