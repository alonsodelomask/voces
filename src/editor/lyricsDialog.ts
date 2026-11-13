// La letra de una voz: se escribe, se parte en sílabas (en castellano, con sinalefa) y cada sílaba va a una nota, en
// orden. Las demás voces que van al mismo ritmo pueden llevar la misma sílaba: en un coro casi siempre cantan lo mismo.
import { isSung } from '../ai/fusion';
import { splitSyllables } from '../lyrics';
import type { Note, Song, Voice } from '../model';
import { midiToName, prettyAccidentals } from '../music';
import { esc, form } from '../ui/dialog';

/** Dos ataques a menos de esto se cantan a la vez. */
const A_LA_VEZ = 0.03;

/**
 * La letra que ya tienen unas notas, escrita de forma que, partida sin separar sola ni sinalefa, vuelva a caer
 * exactamente igual: «_» por cada nota sin sílaba (también antes de la primera), «‿» donde dos palabras van en una
 * nota, y guion donde la palabra sigue.
 */
export function lyricsText(notes: Note[]): string {
  let s = '';
  for (const n of notes) {
    const l = n.lyric?.trim();
    if (!l) {
      s += '_ ';
      continue;
    }
    const t = l.replace(/\s+/g, '‿');
    s += t.endsWith('-') ? t : `${t} `;
  }
  return s.replace(/(?:_ )+$/, '').trim();
}

/** La primera nota desde la que se pone la letra si se empieza en el segundo `t`: la que suena ahí, o la siguiente. */
export function noteAt(voice: Voice, t: number): number {
  const k = voice.notes.findIndex((n) => n.start - 0.02 <= t && t < n.start + n.dur);
  return k >= 0 ? k : voice.notes.findIndex((n) => n.start >= t - 0.02);
}

export interface LyricsResult {
  /** Sílabas puestas en la voz. */
  puestas: number;
  /** Sílabas que no han cabido (no había más notas). */
  sobran: number;
  /** Notas de la voz que se han quedado sin sílaba al final. */
  sinLetra: number;
  /** Notas de otras voces que han recibido la sílaba de la suya. */
  otras: number;
  /** Voces a las que no se ha copiado porque no van al mismo ritmo. */
  otroRitmo: string[];
}

/**
 * Pone las sílabas en las notas de `voice` desde la nota `desde` (la letra que ya tenían desde ahí se quita). «_» deja
 * una nota sin sílaba nueva: la anterior sigue sonando. Con `others`, las voces que atacan casi siempre a la vez que
 * esta (al menos 8 de cada 10 notas) reciben su sílaba en las notas que no tienen letra; nunca se les quita ni se les
 * cambia la que ya tengan.
 */
export function assignLyrics(song: Song, voice: Voice, syllables: string[], desde: number, others: boolean): LyricsResult {
  const notas = desde >= 0 ? voice.notes.slice(desde) : [];
  for (const n of notas) delete n.lyric;
  let k = 0;
  let puestas = 0;
  let i = 0;
  for (; i < syllables.length && k < notas.length; i++, k++) {
    if (syllables[i] === '_') continue;
    notas[k].lyric = syllables[i];
    puestas++;
  }
  const sobran = syllables.slice(i).filter((s) => s !== '_').length;
  let otras = 0;
  const otroRitmo: string[] = [];
  const conLetra = notas.filter((n) => n.lyric);
  if (others && conLetra.length) {
    const a = notas[0].start - 0.02;
    const b = conLetra[conLetra.length - 1].start + 0.02;
    const pareja = (n: Note) => notas.find((x) => Math.abs(x.start - n.start) < A_LA_VEZ);
    for (const v of song.voices) {
      if (v === voice || isSung(v)) continue;
      const tramo = v.notes.filter((n) => n.start >= a && n.start <= b);
      if (!tramo.length) continue;
      const juntas = tramo.filter(pareja).length;
      if (juntas < 0.8 * tramo.length) {
        otroRitmo.push(v.name);
        continue;
      }
      for (const n of tramo) {
        const m = pareja(n);
        if (m?.lyric && !n.lyric) {
          n.lyric = m.lyric;
          otras++;
        }
      }
    }
  }
  return { puestas, sobran, sinLetra: notas.length - k, otras, otroRitmo };
}

interface Deps {
  song: () => Song;
  voice: () => Voice | null | undefined;
  /** Segundo del cabezal. */
  time: () => number;
  /** Aplica un cambio que se puede deshacer. */
  edit: (fn: () => void) => void;
  toast: (s: string) => void;
}

/** El diálogo «Letra» del editor. */
export async function openLyrics(deps: Deps): Promise<void> {
  const song = deps.song();
  const voice = deps.voice();
  if (!voice) return deps.toast('Elige primero una voz.');
  if (isSung(voice)) return deps.toast('La voz de la grabación no lleva letra: ponla en su voz de la partitura.');
  if (!voice.notes.length) return deps.toast(`«${voice.name}» todavía no tiene notas.`);
  const t = deps.time();
  const enCabezal = t > 0.05 ? noteAt(voice, t) : -1;
  const conCabezal = enCabezal > 0;
  const desdeNota = (v: string) => (v === 'cabezal' && conCabezal ? enCabezal : 0);
  const yaTiene = (k: number) => voice.notes.slice(k).some((n) => n.lyric);
  // Si ya hay letra, se abre para corregirla: tal cual está, sin volver a partirla ni a unir palabras.
  const corrige = yaTiene(0);
  const otrasConLetra = song.voices.some((v) => v !== voice && !isSung(v) && v.notes.some((n) => n.lyric));
  const vista = document.createElement('p');
  vista.className = 'hint-s';
  vista.dataset.vista = '';
  const pendiente = form({
    title: `Letra de «${voice.name}»`,
    intro:
      'Escribe lo que canta esta voz: cada sílaba irá a una nota, en orden. Si quieres separarlas tú, usa guiones ' +
      '(<i>a-cér-quen-se</i>). Un <b>_</b> deja una nota sin sílaba nueva (la anterior se alarga) y <b>‿</b> une dos palabras en una nota.',
    fields: [
      { name: 'texto', label: 'Letra', type: 'textarea', value: corrige ? lyricsText(voice.notes) : '', placeholder: 'Acérquense a mi mesa, por favor…' },
      {
        name: 'desde',
        label: 'Empezar en',
        type: 'select',
        value: 'inicio',
        options: [
          { value: 'inicio', label: 'La primera nota' },
          ...(conCabezal ? [{ value: 'cabezal', label: `La nota del cabezal (segundo ${voice.notes[enCabezal].start.toFixed(1)})` }] : []),
        ],
      },
      { name: 'auto', label: 'Separar las sílabas solas (si no, cada palabra sin guiones va en una nota)', type: 'checkbox', value: !corrige },
      { name: 'sinalefa', label: 'Unir la vocal final con la de la palabra siguiente («quen-se a» → «quen-se‿a»)', type: 'checkbox', value: !corrige },
      { name: 'otras', label: 'La misma sílaba en las voces que van al mismo ritmo (solo en notas sin letra)', type: 'checkbox', value: !otrasConLetra },
    ],
    body: vista,
    extra: [{ action: 'quitar', label: 'Quitar la letra', danger: true }],
    okLabel: 'Poner la letra',
  });

  // Vista previa mientras se escribe: cuántas sílabas hay, para cuántas notas, y cómo caen las primeras.
  const dlg = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].pop();
  const campo = <T extends HTMLElement>(n: string) => dlg?.querySelector<T>(`[name=${n}]`) ?? null;
  const area = campo<HTMLTextAreaElement>('texto');
  const desde = campo<HTMLSelectElement>('desde');
  const auto = campo<HTMLInputElement>('auto');
  const sinalefa = campo<HTMLInputElement>('sinalefa');
  const partir = (texto: string) => splitSyllables(texto, { sinalefa: sinalefa?.checked ?? true, auto: auto?.checked ?? true });
  let relleno = area?.value ?? '';
  const actualiza = () => {
    if (!area) return;
    const sil = partir(area.value);
    const notas = voice.notes.slice(desdeNota(desde?.value ?? 'inicio'));
    const reales = sil.filter((s) => s !== '_').length;
    if (!reales) {
      vista.textContent = 'Sin letra.';
      return;
    }
    const pares: string[] = [];
    for (let i = 0; i < Math.min(sil.length, notas.length, 10); i++) {
      if (sil[i] === '_') continue;
      pares.push(`${esc(sil[i])} <small>(${prettyAccidentals(notas[i].name ?? midiToName(notas[i].midi, song.keyFifths))})</small>`);
    }
    const sobran = sil.slice(notas.length).filter((s) => s !== '_').length;
    const cuenta = sobran
      ? `<b>${reales} sílabas para ${notas.length} notas</b>: sobran ${sobran}.`
      : `${reales} sílabas para ${notas.length} notas${sil.length < notas.length ? ` (las ${notas.length - sil.length} últimas, sin letra)` : ''}.`;
    vista.innerHTML = `${cuenta}<br>${pares.join(' · ')}${sil.length > 10 ? ' …' : ''}`;
  };
  if (area) {
    area.rows = 6;
    area.addEventListener('input', () => {
      // Si se borra todo para escribirla de nuevo, vuelve a separar sola y a unir palabras.
      if (!area.value.trim()) {
        if (auto) auto.checked = true;
        if (sinalefa) sinalefa.checked = true;
      }
      actualiza();
    });
  }
  // Al cambiar desde dónde se empieza, si no se ha tocado el texto, se rellena con la letra desde ahí.
  desde?.addEventListener('change', () => {
    if (area && area.value === relleno) {
      const k = desdeNota(desde.value);
      area.value = relleno = yaTiene(k) ? lyricsText(voice.notes.slice(k)) : '';
    }
    actualiza();
  });
  auto?.addEventListener('change', actualiza);
  sinalefa?.addEventListener('change', actualiza);
  actualiza();

  const r = await pendiente;
  if (!r) return;
  const k = desdeNota(r.values.desde);
  const quitar = r.action === 'quitar' || !r.values.texto.trim();
  const sil = quitar ? [] : splitSyllables(r.values.texto, { sinalefa: r.checks.sinalefa, auto: r.checks.auto });
  let res: LyricsResult = { puestas: 0, sobran: 0, sinLetra: 0, otras: 0, otroRitmo: [] };
  // Al quitar, solo se toca esta voz.
  deps.edit(() => {
    res = assignLyrics(song, voice, sil, k, !quitar && r.checks.otras);
  });
  const desdeTxt = k > 0 ? ` desde el segundo ${voice.notes[k].start.toFixed(1)}` : '';
  if (quitar) return deps.toast(`Letra quitada de «${voice.name}»${desdeTxt}.`);
  const partes = [`Letra puesta: ${res.puestas} sílabas en «${voice.name}»${res.otras ? ` y en ${res.otras} notas de las otras voces` : ''}`];
  if (res.otroRitmo.length) partes.push(`no se copia a ${res.otroRitmo.map((n) => `«${n}»`).join(', ')}: va a otro ritmo`);
  if (res.sobran) partes.push(`sobran ${res.sobran} (no hay más notas)`);
  else if (res.sinLetra) partes.push(`${res.sinLetra} notas se quedan sin letra`);
  deps.toast(partes.join('; ') + '.');
}
