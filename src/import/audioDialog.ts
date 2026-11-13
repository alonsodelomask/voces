// Diálogo para convertir una grabación en voces: opciones sencillas y una barra de progreso.
// El módulo de transcripción (y el modelo, ~1 MB) solo se descarga cuando se usa.
// Si hay una partitura abierta, también lleva a mezclarla con la grabación (mixDialog.ts), que es lo que mejor sale.
import type { Song } from '../model';
import { esc, form } from '../ui/dialog';

export type AudioImport =
  /** Canción nueva con las notas sacadas de la grabación. */
  | { kind: 'new'; song: Song }
  /** Las voces de la grabación se suman a la canción abierta (pistas grabadas por separado). */
  | { kind: 'add'; song: Song }
  /** Mezclar con la partitura abierta: lo hace `openMix`. */
  | { kind: 'mix' };

/**
 * `current`: la canción abierta, para ofrecer mezclarla con la grabación o añadir el audio como voz nueva.
 * `prefer`: la opción que sale elegida.
 */
export async function importAudio(file: File, current?: Song, prefer: 'new' | 'add' | 'mix' = 'new'): Promise<AudioImport | null> {
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
                { value: 'mix', label: `Mezclar con «${current!.title}»` },
                { value: 'new', label: 'Sacar las notas de la grabación' },
                { value: 'add', label: `Añadir a «${current!.title}» como voz nueva` },
              ],
              hint:
                '<b>Mezclar</b>: si «' + esc(current!.title) + '» es la partitura de lo que se canta, sus notas se colocan donde suenan en la grabación. Es lo que mejor sale. ' +
                '<b>Añadir</b>: cuando cada cantante graba su voz por separado, empezando todos en el mismo punto.',
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
    // Al mezclar, las opciones las pregunta el diálogo de la mezcla.
    const sync = () => {
      const mix = target.value === 'mix';
      for (const n of ['voices', 'grid', 'bpm', 'start', 'end', 'sens']) row(n)!.hidden = mix;
    };
    target.addEventListener('change', sync);
    sync();
  }
  const r = await pending;
  if (!r) return null;
  if (canAdd && r.values.target === 'mix') return { kind: 'mix' };
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
    const { audioToSong } = await import('./audio');
    const song = await audioToSong(await file.arrayBuffer(), title, { ...opts, onProgress });
    return cancelled ? null : { kind: add ? 'add' : 'new', song };
  } finally {
    if (dlg.open) dlg.close();
    dlg.remove();
  }
}
