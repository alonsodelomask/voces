// Diálogo para convertir una grabación en voces: opciones sencillas y una barra de progreso.
// El módulo de transcripción (y el modelo, ~1 MB) solo se descarga cuando se usa.
import type { Song } from '../model';
import { esc, form } from '../ui/dialog';

export async function importAudio(file: File): Promise<Song | null> {
  const title = file.name.replace(/\.[^.]+$/, '');
  const r = await form({
    title: 'Convertir audio en voces',
    intro:
      `<b>${esc(file.name)}</b><br>Funciona mejor con voces solas (a cappella o una sola voz), sin instrumentos ni mucho eco. ` +
      'El audio no sale de tu dispositivo. Después podrás corregir las notas en el editor.',
    fields: [
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
  const opts = {
    voices: Number(r.values.voices) || 0,
    grid: Number(r.values.grid) || 0,
    bpm: num(r.values.bpm),
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
    return cancelled ? null : song;
  } finally {
    if (dlg.open) dlg.close();
    dlg.remove();
  }
}
