// Diálogo para convertir una grabación en voces: opciones sencillas y una barra de progreso.
// El módulo de transcripción (y el modelo, ~1 MB) solo se descarga cuando se usa.
import type { Song } from '../model';
import { esc, form } from '../ui/dialog';

export interface AudioImport {
  song: Song;
  /** true: añadir sus voces a la canción abierta en lugar de abrirla como canción nueva. */
  add: boolean;
}

/** `current`: la canción abierta, para ofrecer añadir el audio como voz nueva (pistas grabadas por separado). */
export async function importAudio(file: File, current?: { title: string; bpm: number; voices: number; audioPhase?: number }): Promise<AudioImport | null> {
  const title = file.name.replace(/\.[^.]+$/, '');
  const canAdd = !!current && current.voices > 0;
  const r = await form({
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
              value: 'new',
              options: [
                { value: 'new', label: 'Crear una canción nueva' },
                { value: 'add', label: `Añadir a «${current!.title}» como voz nueva` },
              ],
              hint: 'Añadir sirve cuando cada cantante graba su voz por separado, empezando todos en el mismo punto. Usa el tempo de la canción abierta.',
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
  if (!r) return null;
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
    const { audioToSong } = await import('./audio');
    const song = await audioToSong(await file.arrayBuffer(), title, {
      ...opts,
      onProgress: (f, p) => {
        fase.textContent = f;
        bar.value = p;
      },
    });
    return cancelled ? null : { song, add };
  } finally {
    if (dlg.open) dlg.close();
    dlg.remove();
  }
}
