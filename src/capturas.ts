// Escenas para las capturas de la App Store (solo en desarrollo, con ?captura=…). Datos ficticios: la canción de ejemplo.
import type { AudioEngine } from './audio/engine';
import { demoSong } from './demo';
import type { PianoRoll } from './editor/pianoroll';
import type { Song } from './model';
import type { Visualizer } from './viz/visualizer';
import { showAuthScreen } from './ui/authScreen';

type Api = {
  engine: AudioEngine;
  viz: Visualizer;
  roll: PianoRoll;
  setSong: (s: Song) => void;
  switchView: (v: 'viz' | 'edit') => void;
  openAssistant: () => void;
  freeze: (f: boolean) => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pinta el visualizador como si estuviera sonando hasta el instante t (con chispas). */
function pintarSonando(api: Api, t: number) {
  const v = api.viz as unknown as { lastFrame: number };
  for (let k = 90; k >= 0; k--) {
    v.lastFrame = performance.now() - 1000 / 60;
    api.viz.render(t - k / 60, true);
  }
}

export async function preparar(escena: string, api: Api) {
  const song = demoSong();
  api.setSong(song);
  document.querySelector('#toast')?.setAttribute('hidden', '');
  await wait(300);
  const T = 10.9; // en pleno acorde de Si menor, con la soprano subiendo
  api.engine.seek(T);
  switch (escena) {
    case 'entrada': {
      showAuthScreen({ allowSkip: true });
      await wait(800);
      break;
    }
    case 'voces': {
      api.switchView('viz');
      const s = song.voices[0];
      s.solo = true;
      document.querySelector('#panel')?.classList.remove('closed');
      await wait(150);
      api.freeze(true);
      pintarSonando(api, T);
      break;
    }
    case 'editar':
    case 'asistente': {
      api.switchView('edit');
      api.roll.activeVoiceId = song.voices[0].id;
      api.roll.pxPerBeat = 34;
      api.roll.rowH = 13;
      await wait(150);
      api.roll.centerOnNotes();
      api.roll.scrollX = 0;
      if (escena === 'asistente') {
        api.openAssistant();
        await wait(150);
        (document.querySelector('#as-ch-go') as HTMLButtonElement | null)?.click();
      }
      break;
    }
    case 'guitarra':
    case 'piano':
    case 'ukelele': {
      api.viz.opts.chordDiagram = escena === 'guitarra' ? 'guitar' : escena === 'piano' ? 'piano' : 'ukulele';
      api.switchView('viz');
      await wait(150);
      api.freeze(true);
      pintarSonando(api, T);
      break;
    }
    default: {
      api.switchView('viz');
      await wait(150);
      api.freeze(true);
      pintarSonando(api, T);
    }
  }
  await wait(200);
  document.body.dataset.captura = 'lista';
}
