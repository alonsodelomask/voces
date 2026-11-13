// La fusión de la partitura con la grabación, mientras se calcula: las dos se acercan, se cargan de energía
// y al final se juntan en un destello. Con «menos movimiento» activado en el sistema, solo la barra de progreso.
import { esc } from './dialog';

export interface Fusion {
  /** Fase y fracción (0..1) del cálculo. */
  progress(fase: string, p: number): void;
  /** Destello final; se resuelve cuando acaba la animación. */
  finish(): Promise<void>;
  close(): void;
  /** true si se ha pulsado Cancelar. */
  readonly cancelled: boolean;
}

const SCORE_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M6 16h36M6 24h36M6 32h36"/>
  <circle cx="17" cy="28" r="4.4" fill="currentColor" stroke="none"/><path d="M21.4 28V12"/>
  <circle cx="33" cy="20" r="4.4" fill="currentColor" stroke="none"/><path d="M37.4 20V6"/>
</svg>`;
const AUDIO_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M4 24h4m4-9v18m4-13v8m4-14v20m4-15v10m4-16v22m4-14v6m4-11v16m4-9v2"/>
</svg>`;

export function openFusion(opts: { scoreName: string; audioName: string }): Fusion {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg fusion';
  dlg.innerHTML = `<div class="form">
    <h2>Fusión</h2>
    <div class="fu-stage" style="--p:0">
      <div class="fu fu-a"><i>${SCORE_SVG}</i><b>Partitura</b><small>${esc(opts.scoreName)}</small></div>
      <div class="fu-core" aria-hidden="true"></div>
      <div class="fu fu-b"><i>${AUDIO_SVG}</i><b>Grabación</b><small>${esc(opts.audioName)}</small></div>
    </div>
    <p class="intro" data-fase>Preparando…</p>
    <progress max="1" value="0" style="width:100%"></progress>
    <p class="hint-s">Las notas las pone la partitura; el ritmo y el tono, la grabación. Una canción de 3 minutos tarda alrededor de un minuto.</p>
    <div class="row end"><button class="btn" data-cancel>Cancelar</button></div>
  </div>`;
  document.body.appendChild(dlg);
  const stage = dlg.querySelector<HTMLElement>('.fu-stage')!;
  const fase = dlg.querySelector<HTMLElement>('[data-fase]')!;
  const bar = dlg.querySelector('progress')!;
  const state = { cancelled: false };
  dlg.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
    state.cancelled = true;
    dlg.close();
  };
  dlg.addEventListener('cancel', () => (state.cancelled = true));
  dlg.showModal();

  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return {
    get cancelled() {
      return state.cancelled;
    },
    progress(f, p) {
      fase.textContent = f;
      bar.value = p;
      stage.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
    },
    async finish() {
      bar.value = 1;
      stage.style.setProperty('--p', '1');
      stage.classList.add('fused');
      fase.textContent = '¡Fusión!';
      await new Promise((r) => setTimeout(r, quieto ? 120 : 900));
    },
    close() {
      if (dlg.open) dlg.close();
      dlg.remove();
    },
  };
}
