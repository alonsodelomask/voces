// Diálogo para convertir una grabación en voces: opciones sencillas y una barra de progreso.
// El módulo de transcripción (y el modelo, ~1 MB) solo se descarga cuando se usa.
// Con una partitura abierta, también puede usar sus notas y sacar de la grabación solo el ritmo (align.ts).
import type { Song } from '../model';
import { esc, form } from '../ui/dialog';

export interface AudioImport {
  song: Song;
  /** true: añadir sus voces a la canción abierta en lugar de abrirla como canción nueva. */
  add: boolean;
  /** Si se usaron las notas de la partitura: lo que se ha encontrado, para contarlo. */
  aligned?: { transpose: number; match: number; octaves: { name: string; semis: number }[]; from: number; to: number };
}

/**
 * `current`: la canción abierta, para ofrecer añadir el audio como voz nueva (pistas grabadas por separado)
 * o usar sus notas con el ritmo de la grabación. `prefer`: la opción que sale elegida.
 */
export async function importAudio(file: File, current?: Song, prefer: 'new' | 'add' | 'align' = 'new'): Promise<AudioImport | null> {
  const title = file.name.replace(/\.[^.]+$/, '');
  const canAdd = !!current && current.voices.some((v) => v.notes.length);
  const pending = form({
    title: 'Convertir audio en voces',
    intro:
      `<b>${esc(file.name)}</b><br>Funciona mejor con voces solas (a cappella o una sola voz), sin instrumentos ni mucho eco. ` +
      'El audio no sale de tu dispositivo. Después podrás corregir las notas en el editor.',
    fields: [
      ...(canAdd
        ? [
            {
              name: 'target',
              label: 'Qué hacer',
              type: 'select' as const,
              value: prefer,
              options: [
                { value: 'new', label: 'Sacar las notas de la grabación' },
                { value: 'align', label: `Notas de «${current!.title}», ritmo de la grabación` },
                { value: 'add', label: `Añadir a «${current!.title}» como voz nueva` },
              ],
              hint:
                '<b>Notas de la partitura</b>: si «' + esc(current!.title) + '» es la partitura de lo que se canta, sus notas se colocan donde suenan en la grabación (mucho más fiable que sacarlas del audio). ' +
                '<b>Añadir</b>: cuando cada cantante graba su voz por separado, empezando todos en el mismo punto.',
            },
            {
              name: 'key',
              label: 'Tonalidad',
              type: 'select' as const,
              value: 'audio',
              options: [
                { value: 'audio', label: 'La de la grabación' },
                { value: 'score', label: 'La de la partitura' },
              ],
              hint: 'Si la cantáis más alta o más baja que la partitura.',
            },
          ]
        : []),
      {
        name: 'voices',
        label: 'Voces que se oyen',
        type: 'select',
        value: '0',
        options: [
          { value: '0', label: 'Averiguarlo' },
          { value: '1', label: '1 (solo la melodía)' },
          ...[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) })),
        ],
      },
      {
        name: 'grid',
        label: 'Ajustar el ritmo a',
        type: 'select',
        value: '0.5',
        options: [
          { value: '0.5', label: 'Corcheas (recomendado)' },
          { value: '0.25', label: 'Semicorcheas' },
          { value: '1', label: 'Negras' },
          { value: '0', label: 'No ajustar (tal cual se canta)' },
        ],
      },
      { name: 'bpm', label: 'Tempo (BPM)', type: 'number', value: '', placeholder: 'Averiguarlo', min: 40, max: 240 },
      { name: 'start', label: 'Desde el segundo', type: 'number', value: 0, min: 0, step: 0.5 },
      { name: 'end', label: 'Hasta el segundo', type: 'number', value: '', placeholder: 'Hasta el final', min: 0, step: 0.5 },
      {
        name: 'sens',
        label: 'Sensibilidad',
        type: 'select',
        value: '0.5',
        options: [
          { value: '0.3', label: 'Baja: solo lo que está claro' },
          { value: '0.5', label: 'Normal' },
          { value: '0.8', label: 'Alta: más notas (y más errores)' },
        ],
      },
    ],
    okLabel: 'Convertir',
  });
  // Cada opción enseña solo lo que usa.
  const dlgForm = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].pop();
  const target = dlgForm?.querySelector<HTMLSelectElement>('[name=target]');
  if (dlgForm && target) {
    const row = (name: string) => dlgForm.querySelector(`[name=${name}]`)?.closest<HTMLElement>('label');
    const sync = () => {
      const align = target.value === 'align';
      for (const n of ['voices', 'grid', 'bpm', 'sens']) row(n)!.hidden = align;
      row('key')!.hidden = !align;
    };
    target.addEventListener('change', sync);
    sync();
  }
  const r = await pending;
  if (!r) return null;
  const align = canAdd && r.values.target === 'align';
  const num = (s: string) => (s.trim() === '' ? 0 : Math.max(0, Number(s.replace(',', '.')) || 0));
  const add = canAdd && r.values.target === 'add';
  const opts = {
    voices: Number(r.values.voices) || (add ? 1 : 0),
    grid: Number(r.values.grid) || 0,
    bpm: add ? current!.bpm : num(r.values.bpm),
    keepTime: add,
    phase: add ? (current!.audioPhase ?? 0) : 0,
    start: num(r.values.start),
    end: num(r.values.end),
    sensitivity: Number(r.values.sens) || 0.5,
  };

  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `<div class="form"><h2>Convirtiendo…</h2>
    <p class="intro" data-fase>Preparando…</p>
    <progress max="1" value="0" style="width:100%"></progress>
    <p class="hint-s">Una canción de 3 minutos tarda alrededor de un minuto. No cierres la app.</p>
    <div class="row end"><button class="btn" data-cancel>Cancelar</button></div></div>`;
  document.body.appendChild(dlg);
  let cancelled = false;
  dlg.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
    cancelled = true;
    dlg.close();
  };
  dlg.addEventListener('cancel', () => (cancelled = true));
  dlg.showModal();
  const fase = dlg.querySelector<HTMLElement>('[data-fase]')!;
  const bar = dlg.querySelector('progress')!;
  try {
    const onProgress = (f: string, p: number) => {
      fase.textContent = f;
      bar.value = p;
    };
    if (align) {
      const { alignScoreToAudio } = await import('./align');
      const res = await alignScoreToAudio(current!, await file.arrayBuffer(), `${current!.title} (${title})`, {
        start: opts.start,
        end: opts.end,
        keepKey: r.values.key === 'score',
        onProgress,
      });
      const { song, ...aligned } = res;
      return cancelled ? null : { song, add: false, aligned };
    }
    const { audioToSong } = await import('./audio');
    const song = await audioToSong(await file.arrayBuffer(), title, { ...opts, onProgress });
    return cancelled ? null : { song, add };
  } finally {
    if (dlg.open) dlg.close();
    dlg.remove();
  }
}
