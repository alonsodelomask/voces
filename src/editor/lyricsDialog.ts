// La letra de una voz: se escribe (o se saca de la grabación), se parte en sílabas (en castellano, con sinalefa) y se
// pone en las notas de dos maneras: una sílaba en cada nota, en orden, o cada sílaba en la nota en que se oye cantar en
// la grabación. Las demás voces que van al mismo ritmo pueden llevar la misma sílaba: en un coro casi siempre cantan
// lo mismo.
import { isSung } from '../ai/fusion';
import { trackIds } from '../audio/track';
import { heardBefore, hearTrack, isAbort, lyricsFromWords, type PalabraOida } from '../import/transcribe';
import { splitSyllables } from '../lyrics';
import type { Note, Song, Voice } from '../model';
import { midiToName, prettyAccidentals } from '../music';
import { esc, form } from '../ui/dialog';
import {
  assignLyrics,
  copyLyrics,
  copyNotices,
  heardFrom,
  lyricsCopied,
  placeHeard,
  placeHeardPreview,
  type LyricsResult,
} from './lyricsPlace';

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

/**
 * La letra que ya tienen unas notas, sin las marcas de cómo cae en ellas (ni «_» ni «‿»), con un salto de línea en
 * cada silencio largo: para volver a colocarla según la grabación. Los guiones de las palabras partidas se quedan.
 */
export function plainLyrics(notes: Note[]): string {
  let s = '';
  let fin = -Infinity;
  for (const n of notes) {
    const l = n.lyric?.trim();
    if (l) {
      if (s && !s.endsWith('-')) s += n.start - fin > 0.6 ? '\n' : ' ';
      s += l.replace(/[‿\s]+/g, ' ');
    }
    fin = Math.max(fin, n.start + n.dur);
  }
  return s.trim();
}

/** La primera nota desde la que se pone la letra si se empieza en el segundo `t`: la que suena ahí, o la siguiente. */
export function noteAt(voice: Voice, t: number): number {
  const k = voice.notes.findIndex((n) => n.start - 0.02 <= t && t < n.start + n.dur);
  return k >= 0 ? k : voice.notes.findIndex((n) => n.start >= t - 0.02);
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

/** «1 nota», «3 notas». */
const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que no ha cabido en ninguna nota, entre comillas: «Coro:», «uh»… (las 4 primeras). */
const fuera = (xs: string[]) => xs.slice(0, 4).map((x) => `«${x}»`).join(', ') + (xs.length > 4 ? '…' : '');

/**
 * El aviso final: las otras voces (las notas con otra sílaba, las voces y las frases que no van al mismo ritmo), lo que
 * no ha cabido y lo que queda en ámbar (`ambar`: las notas marcadas desde la de inicio; `buenas`: las que la persona ha
 * dado por buenas). En orden, la última nota se queda con media palabra si la palabra sigue en lo que sobra
 * (`res.dudosas`): esa se cuenta con lo que sobra; las demás en ámbar siguen así de antes.
 */
function resumen(res: LyricsResult, voice: Voice, oido: boolean, ambar: number, buenas: number): string {
  const partes = [
    `Letra puesta${oido ? ' donde se oye' : ''}: ${cuenta(res.puestas, 'sílaba', 'sílabas')} en «${voice.name}»` +
      (res.otras ? ` y en ${cuenta(res.otras, 'nota', 'notas')} de las otras voces` : ''),
    ...copyNotices(res),
  ];
  const siguen = oido ? ambar : Math.max(0, ambar - res.dudosas);
  if (siguen) partes.push(oido ? `${cuenta(ambar, 'nota', 'notas')} en ámbar para revisar` : `${cuenta(siguen, 'nota sigue', 'notas siguen')} en ámbar para revisar`);
  if (buenas) partes.push(cuenta(buenas, 'nota en ámbar dada por buena', 'notas en ámbar dadas por buenas'));
  if (oido) {
    if (res.descartadas.length) partes.push(`se queda${res.descartadas.length === 1 ? '' : 'n'} fuera, sin nota: ${fuera(res.descartadas)}`);
  } else if (res.sobran) {
    const media = res.dudosas ? `; la última se queda con media palabra${buenas ? '' : ', en ámbar'}` : '';
    partes.push(`${res.sobran === 1 ? 'sobra 1' : `sobran ${res.sobran}`} (no hay más notas${media})`);
  } else if (res.sinLetra) partes.push(`${cuenta(res.sinLetra, 'nota se queda', 'notas se quedan')} sin letra`);
  return partes.join('; ') + '.';
}

/** El diálogo «Letra» del editor. Termina cuando se cierra (y, si se acepta, con la letra ya puesta). */
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
  const enAmbar = (k: number) => voice.notes.slice(k).some((n) => n.lyricDoubt);
  // Si ya hay letra, se abre para corregirla: tal cual está, sin volver a partirla ni a unir palabras.
  const corrige = yaTiene(0);
  // Con grabación, cada sílaba puede ir a la nota en que se oye. Lo oído se recuerda mientras la app está abierta. Para
  // escucharla tiene que estar guardada en este dispositivo: una canción traída de otro lleva sus datos, no el audio.
  let oidas: PalabraOida[] | null = song.audioTrack ? heardBefore(song) : null;
  const enDispositivo = !!song.audioTrack && (await trackIds()).includes(song.id);
  const conGrabacion = enDispositivo || !!oidas;
  /** El texto que sale de lo oído (desde la nota de inicio): si no se toca, se pone lo oído tal cual. */
  let textoOido: string | null = null;
  const oidoDesde = (k: number) => {
    // Las palabras que, colocando lo oído en toda la voz, caen desde esa nota: no lo cantado justo antes.
    textoOido = lyricsFromWords(heardFrom(voice.notes, k, oidas ?? []));
    return textoOido;
  };
  /** Lo que se pone en el cuadro de texto para cada manera y nota de inicio. */
  const relleno = (modo: string, k: number) =>
    modo === 'oido' ? (yaTiene(k) ? plainLyrics(voice.notes.slice(k)) : oidas ? oidoDesde(k) : '') : yaTiene(k) ? lyricsText(voice.notes.slice(k)) : '';
  const modo0 = conGrabacion && !corrige ? 'oido' : 'orden';

  const cuerpo = document.createElement('div');
  cuerpo.innerHTML = `${
    conGrabacion
      ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn" data-oir>🎧 Escribir lo que se oye</button><small class="hint-s" data-oido></small></div>
        <progress max="1" value="0" hidden data-barra style="width:100%"></progress>`
      : song.audioTrack
        ? '<p class="hint-s" data-sin-grabacion>La grabación de esta canción no está guardada en este dispositivo: no se puede escuchar, así que la letra va en orden.</p>'
        : ''
  }<p class="hint-s" data-vista></p>`;
  const vista = cuerpo.querySelector<HTMLElement>('[data-vista]')!;
  const pendiente = form({
    title: `Letra de «${voice.name}»`,
    intro:
      'Escribe lo que canta esta voz y cada sílaba irá a una nota. Si quieres separarlas tú, usa guiones ' +
      '(<i>a-só-ma-te</i>). En orden, un <b>_</b> deja una nota sin sílaba nueva (la anterior se alarga) y <b>‿</b> une dos palabras en una nota.' +
      (conGrabacion
        ? ' Con la grabación, la app escucha lo que se canta y pone cada sílaba en la nota en que se oye: pulsa <b>🎧 Escribir lo que se oye</b>, corrige lo que haga falta y pulsa «Poner la letra».'
        : ''),
    fields: [
      { name: 'texto', label: 'Letra', type: 'textarea', value: relleno(modo0, 0), placeholder: 'Asómate a la calle, por favor…' },
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
      ...(conGrabacion
        ? [
            {
              name: 'como',
              label: 'Cómo poner las sílabas',
              type: 'select' as const,
              value: modo0,
              options: [
                { value: 'oido', label: 'Cada una en la nota en que se oye en la grabación' },
                { value: 'orden', label: 'Una en cada nota, en orden' },
              ],
            },
          ]
        : []),
      { name: 'auto', label: 'Separar las sílabas solas (si no, cada palabra sin guiones va en una nota)', type: 'checkbox', value: !corrige },
      { name: 'sinalefa', label: 'Unir la vocal final con la de la palabra siguiente («ma-te a» → «ma-te‿a»)', type: 'checkbox', value: !corrige },
      // Marcada si las otras voces no tienen letra o la que tienen es copia de esta (así se corrigen con ella, y al quitarla
      // se va también de ellas).
      { name: 'otras', label: 'La misma sílaba en las voces que van al mismo ritmo, también al quitarla (si cantan otra letra, no se toca)', type: 'checkbox', value: lyricsCopied(song, voice) },
      // Solo se ve si hay notas en ámbar desde la nota de inicio.
      { name: 'buenas', label: 'Dar por buenas las sílabas en ámbar', type: 'checkbox', value: false },
    ],
    body: cuerpo,
    extra: [{ action: 'quitar', label: 'Quitar la letra', danger: true }],
    okLabel: 'Poner la letra',
  });

  const dlg = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].pop();
  const campo = <T extends HTMLElement>(n: string) => dlg?.querySelector<T>(`[name=${n}]`) ?? null;
  const area = campo<HTMLTextAreaElement>('texto');
  const desde = campo<HTMLSelectElement>('desde');
  const como = campo<HTMLSelectElement>('como');
  const auto = campo<HTMLInputElement>('auto');
  const sinalefa = campo<HTMLInputElement>('sinalefa');
  const otras = campo<HTMLInputElement>('otras');
  const buenas = campo<HTMLInputElement>('buenas');
  const filaBuenas = buenas?.closest('label') ?? null;
  const oir = cuerpo.querySelector<HTMLButtonElement>('[data-oir]');
  const estado = cuerpo.querySelector<HTMLElement>('[data-oido]');
  const barra = cuerpo.querySelector<HTMLProgressElement>('[data-barra]');
  const modo = () => como?.value ?? 'orden';
  const inicio = () => desdeNota(desde?.value ?? 'inicio');
  const partir = (texto: string) => splitSyllables(texto, { sinalefa: sinalefa?.checked ?? true, auto: auto?.checked ?? true });
  /** El texto que hay en el cuadro sin tocar: al cambiar la manera o la nota de inicio, se cambia por el que toque. */
  let rellenado = area?.value ?? '';
  /** La letra que se coloca según lo oído: null = lo oído tal cual (cuadro vacío o sin tocar). */
  const textoAColocar = (texto: string) => (!texto.trim() || texto === textoOido ? null : texto);
  const nombre = (n: Note) => prettyAccidentals(n.name ?? midiToName(n.midi, song.keyFifths));
  /** Si al aceptar se quita la marca ámbar desde la nota de inicio. */
  const daPorBuenas = () => !!buenas?.checked && !filaBuenas?.hidden;
  const muestraBuenas = () => {
    if (!filaBuenas) return;
    filaBuenas.hidden = !enAmbar(inicio());
    if (filaBuenas.hidden && buenas) buenas.checked = false;
  };

  // Vista previa mientras se escribe: cuántas sílabas hay, para cuántas notas, y cómo caen las primeras.
  const vistaEnOrden = () => {
    if (!area) return;
    const sil = partir(area.value);
    const notas = voice.notes.slice(inicio());
    const reales = sil.filter((s) => s !== '_').length;
    if (!reales) {
      vista.textContent = 'Sin letra.';
      return;
    }
    const n = Math.min(sil.length, notas.length);
    const sobran = sil.slice(notas.length).filter((s) => s !== '_').length;
    // Si la palabra de la última sílaba que cabe sigue en las que sobran, esa nota se queda sin el guion y en ámbar.
    let ultima = -1;
    for (let i = 0; i < n; i++) if (sil[i] !== '_') ultima = i;
    const media = sobran > 0 && ultima >= 0 && sil[ultima].endsWith('-') ? ultima : -1;
    const escrita = (i: number) => (i === media ? sil[i].slice(0, -1) : sil[i]);
    // La marca ámbar se queda en las notas que vuelven a recibir la misma sílaba: nadie la ha revisado todavía.
    const sigue = (i: number) => i !== media && sil[i] !== '_' && !!notas[i].lyricDoubt && notas[i].lyric === sil[i];
    let ambar = 0;
    for (let i = 0; i < n; i++) if (sigue(i)) ambar++;
    const pinta = !daPorBuenas();
    const pares: string[] = [];
    for (let i = 0; i < Math.min(n, 10); i++) {
      if (sil[i] === '_') continue;
      pares.push(`${(sigue(i) || i === media) && pinta ? `<span class="ambar">${esc(escrita(i))}</span>` : esc(escrita(i))} <small>(${nombre(notas[i])})</small>`);
    }
    const libres = notas.length - sil.length;
    const para = `${cuenta(reales, 'sílaba', 'sílabas')} para ${cuenta(notas.length, 'nota', 'notas')}`;
    let txt = sobran
      ? `<b>${para}</b>: ${sobran === 1 ? 'sobra 1' : `sobran ${sobran}`}.` +
        (media >= 0 ? ` La última nota se queda con media palabra («${esc(escrita(media))}»)${pinta ? ', en ámbar' : ''}.` : '')
      : `${para}${libres === 1 ? ' (la última, sin letra)' : libres > 1 ? ` (las ${libres} últimas, sin letra)` : ''}.`;
    if (ambar && pinta) txt += ambar === 1 ? ' 1 sigue en ámbar para revisar.' : ` ${ambar} siguen en ámbar para revisar.`;
    else if (ambar) txt += ambar === 1 ? ' 1 en ámbar se da por buena.' : ` ${ambar} en ámbar se dan por buenas.`;
    vista.innerHTML = `${txt}<br>${pares.join(' · ')}${sil.length > 10 ? ' …' : ''}`;
  };
  const vistaOida = () => {
    if (!area) return;
    if (!oidas) {
      vista.textContent =
        'Al pulsar «Poner la letra», la app escucha la grabación y pone cada sílaba donde se oye. La primera vez descarga ' +
        'unos 80 MB; el audio no sale de este dispositivo.';
      return;
    }
    const k = inicio();
    const notas = voice.notes.slice(k);
    const c = placeHeardPreview(voice.notes, k, oidas, textoAColocar(area.value));
    const puestas = c.porNota.filter(Boolean).length;
    if (!puestas) {
      vista.textContent = oidas.length ? 'Ninguna sílaba encaja con estas notas.' : 'No se ha oído letra en la grabación.';
      return;
    }
    const pinta = !daPorBuenas();
    const pares: string[] = [];
    for (let i = 0; i < notas.length && pares.length < 10; i++) {
      const l = c.porNota[i];
      if (l) pares.push(`${c.dudosas[i] && pinta ? `<span class="ambar">${esc(l)}</span>` : esc(l)} <small>(${nombre(notas[i])})</small>`);
    }
    const dudosas = c.dudosas.filter(Boolean).length;
    const extra = [
      dudosas ? (pinta ? `${dudosas} en ámbar para revisar` : `${dudosas} en ámbar: ${dudosas === 1 ? 'se da por buena' : 'se dan por buenas'}`) : '',
      c.descartadas.length ? `fuera, sin nota: ${esc(fuera(c.descartadas))}` : '',
    ].filter(Boolean);
    vista.innerHTML = `${cuenta(puestas, 'sílaba', 'sílabas')} en ${cuenta(notas.length, 'nota', 'notas')}${extra.length ? ` · ${extra.join(' · ')}` : ''}.<br>${pares.join(' · ')}${puestas > 10 ? ' …' : ''}`;
  };
  // Colocar según lo oído tarda un poco en canciones largas: se espera a que se deje de escribir.
  let espera = 0;
  const actualiza = (yaMismo = false) => {
    window.clearTimeout(espera);
    if (modo() !== 'oido') return vistaEnOrden();
    if (yaMismo) return vistaOida();
    espera = window.setTimeout(vistaOida, 250);
  };
  const cambiaManera = () => {
    const oido = modo() === 'oido';
    for (const c of [auto, sinalefa]) {
      const fila = c?.closest('label');
      if (fila) fila.hidden = oido;
    }
    if (area) area.placeholder = oido ? 'Déjalo vacío para poner lo que se oye, o pulsa 🎧 para verlo y corregirlo.' : 'Asómate a la calle, por favor…';
  };

  // Escuchar se puede parar: al cerrar el diálogo mientras escucha, se deja de escuchar.
  const corta = new AbortController();
  let escuchando = false;
  /** Mientras escucha no se puede cambiar nada (se pone lo que había al pulsar); «Cancelar», sí. */
  const bloquea = (si: boolean) => {
    dlg?.querySelectorAll<HTMLButtonElement>('button[value=ok], button[value=quitar], [data-oir]').forEach((b) => (b.disabled = si));
    for (const c of [desde, como, auto, sinalefa, otras, buenas]) if (c) c.disabled = si;
    if (area) area.readOnly = si;
  };
  /** Escucha la grabación (si no se ha hecho ya) con el avance en el diálogo. */
  const escuchar = async (): Promise<boolean> => {
    if (oidas) {
      if (!oidas.length && estado) estado.textContent = 'No se ha oído letra en la grabación.';
      return oidas.length > 0;
    }
    if (escuchando) return false;
    escuchando = true;
    bloquea(true);
    if (barra) barra.hidden = false;
    try {
      oidas = await hearTrack(
        song,
        (fase, f) => {
          if (estado) estado.textContent = fase;
          if (barra) barra.value = f;
        },
        corta.signal,
      );
      if (estado) estado.textContent = oidas.length ? `${oidas.length === 1 ? 'Oída' : 'Oídas'} ${cuenta(oidas.length, 'palabra', 'palabras')}.` : 'No se ha oído letra en la grabación.';
      return oidas.length > 0;
    } catch (e) {
      // Pararla al cerrar el diálogo no es un error que haya que contar.
      if (estado && !isAbort(e)) estado.textContent = (e as Error).message || 'No se ha podido escuchar la grabación.';
      return false;
    } finally {
      escuchando = false;
      // Se devuelve todo antes de que se pueda cerrar con «Poner la letra».
      bloquea(false);
      if (barra) barra.hidden = true;
    }
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
  // Al cambiar desde dónde se empieza o la manera de ponerla, si no se ha tocado el texto, se cambia por el que toca.
  const rellena = () => {
    if (area && area.value === rellenado) area.value = rellenado = relleno(modo(), inicio());
  };
  desde?.addEventListener('change', () => {
    rellena();
    muestraBuenas();
    actualiza(true);
  });
  como?.addEventListener('change', () => {
    rellena();
    cambiaManera();
    actualiza(true);
  });
  auto?.addEventListener('change', () => actualiza());
  sinalefa?.addEventListener('change', () => actualiza());
  buenas?.addEventListener('change', () => actualiza(true));
  /** Lo escrito por la persona que 🎧 no ha pisado: si se vuelve a pulsar con ese mismo texto, se cambia. */
  let respetado: string | null = null;
  if (oir)
    oir.onclick = async () => {
      if (!(await escuchar()) || !area || !dlg?.open) return;
      // Lo que ha escrito la persona (no lo que puso el diálogo) no se cambia sin avisar: no se podría deshacer.
      if (area.value.trim() && area.value !== rellenado && area.value !== respetado) {
        respetado = area.value;
        if (estado) estado.textContent = 'No se ha cambiado lo que has escrito: vuelve a pulsar 🎧 para cambiarlo por lo que se oye.';
        actualiza(true);
        return;
      }
      respetado = null;
      area.value = rellenado = oidoDesde(inicio());
      if (como) como.value = 'oido';
      cambiaManera();
      actualiza(true);
    };
  // «Poner la letra» donde se oye sin haber escuchado todavía: se escucha antes de cerrar. Mientras, no se puede tocar
  // nada; aun así, si algo ha cambiado, no se cierra solo: la persona tiene que ver lo que se va a poner.
  const foto = () => JSON.stringify([modo(), desde?.value, area?.value, auto?.checked, sinalefa?.checked, otras?.checked, buenas?.checked]);
  dlg?.querySelector('form')?.addEventListener('submit', (e) => {
    const boton = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (boton?.value !== 'ok' || modo() !== 'oido' || oidas) return;
    e.preventDefault();
    const antes = foto();
    void escuchar().then((ok) => {
      if (!dlg?.open) return;
      if (ok && modo() === 'oido' && foto() === antes) return dlg.close('ok');
      if (ok && estado) estado.textContent = 'Ya está escuchada: revisa y pulsa «Poner la letra».';
      actualiza(true);
    });
  });
  cambiaManera();
  muestraBuenas();
  actualiza(true);

  const r = await pendiente;
  window.clearTimeout(espera);
  // Cerrado mientras escuchaba (Cancelar o Esc): se deja de escuchar (si no lo espera nadie más, se para).
  if (escuchando) {
    corta.abort();
    if (!r) deps.toast('Escucha parada.');
  }
  if (!r) return;
  // Mientras estaba abierto (escuchar tarda), alguien del grupo ha podido guardar la canción: la abierta ya es otra y lo
  // que se pusiera aquí no se vería ni se guardaría. Lo oído sigue en memoria.
  if (deps.song() !== song || !song.voices.includes(voice)) return deps.toast('La canción ha cambiado mientras tanto: vuelve a poner la letra.');
  const k = desdeNota(r.values.desde);
  const texto = r.values.texto ?? '';
  const oido = r.values.como === 'oido';
  const desdeTxt = k > 0 ? ` desde el segundo ${voice.notes[k].start.toFixed(1)}` : '';
  if (r.action === 'quitar' || (!oido && !texto.trim())) {
    // Con la casilla de las otras voces, se van también las copias de esta letra en las voces que van a su ritmo (su
    // propia letra, no). Si se quedaran, el karaoke y el MIDI pasarían a una de ellas, y la letra que se pusiera después
    // ya no se les copiaría: la tomaría por suya. Sin la casilla, solo se quita la de esta voz.
    const otrasVoces = song.voices.filter((v) => v !== voice && !isSung(v));
    const conSilaba = () => otrasVoces.reduce((s, v) => s + v.notes.filter((n) => n.lyric).length, 0);
    const habia = conSilaba();
    deps.edit(() => assignLyrics(song, voice, [], k, !!r.checks.otras));
    const quitadas = habia - conSilaba();
    return deps.toast(`Letra quitada de «${voice.name}»${quitadas ? ` y de ${cuenta(quitadas, 'nota', 'notas')} de las otras voces` : ''}${desdeTxt}.`);
  }
  const conOtras = !!r.checks.otras;
  const aceptar = !!r.checks.buenas && !filaBuenas?.hidden;
  let res = null as LyricsResult | null;
  let dadas = 0;
  /** La persona da por buenas las sílabas en ámbar desde la nota de inicio: se les quita la marca, y a sus copias. */
  const quitaAmbar = (puesta: LyricsResult) => {
    const notas = voice.notes.slice(k);
    dadas = notas.filter((n) => n.lyricDoubt).length;
    for (const n of notas) delete n.lyricDoubt;
    // Las voces que van a su ritmo llevan la marca en sus copias: se vuelven a copiar, ya sin ella (tampoco en las que
    // se quedan con media palabra).
    if (conOtras) puesta.cortadas = copyLyrics(song, voice, notas, new Map(notas.map((n) => [n, n.lyric])), true).cortadas;
  };
  if (oido) {
    const palabras = oidas ?? [];
    const propia = textoAColocar(texto);
    // Sin nada oído no hay qué poner, salvo la letra escrita: entonces va lo que enseña la vista (sin tiempos, en ámbar),
    // en vez de cerrar y perder lo escrito.
    if (!palabras.length && !propia) return deps.toast('No se ha oído letra en la grabación: escríbela y ponla en orden.');
    deps.edit(() => {
      res = placeHeard(song, voice, palabras, propia, k, conOtras);
      if (aceptar) quitaAmbar(res);
    });
  } else {
    const sil = splitSyllables(texto, { sinalefa: r.checks.sinalefa, auto: r.checks.auto });
    deps.edit(() => {
      res = assignLyrics(song, voice, sil, k, conOtras);
      if (aceptar) quitaAmbar(res);
    });
  }
  const ambar = voice.notes.slice(k).filter((n) => n.lyricDoubt).length;
  if (res) deps.toast(resumen(res, voice, oido, ambar, dadas));
}
