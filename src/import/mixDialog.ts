// «Mezclar grabación y partitura»: el camino bueno para pasar un ensayo a Vocify.
// Las notas las pone la partitura (están bien) y el ritmo, el tono y la octava los pone la grabación.
// El módulo que hace el trabajo (y el modelo, ~1 MB) solo se descarga al pulsar Fusionar.
import { decodeMono, encodeWav, putTrack, TRACK_SR } from '../audio/track';
import { isNative } from '../native';
import { esc } from '../ui/dialog';
import { openFusion } from '../ui/fusion';
import type { Song } from '../model';
import { isSung } from '../ai/fusion';
import { AUDIO_EXT, importFile } from './index';
import type { PalabraOida } from './transcribe';

export interface MixResult {
  song: Song;
  /** Resumen de lo que ha encontrado, para contárselo a la persona. */
  notes: string[];
}

const SCORE_EXT = '.musicxml,.xml,.mxl,.mid,.midi';
const AUDIO_ACCEPT = AUDIO_EXT.map((e) => '.' + e).join(',') + ',audio/*';
const SCORE_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 16h36M6 24h36M6 32h36"/><circle cx="17" cy="28" r="4.4" fill="currentColor" stroke="none"/><path d="M21.4 28V12"/><circle cx="33" cy="20" r="4.4" fill="currentColor" stroke="none"/><path d="M37.4 20V6"/></svg>`;
const AUDIO_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 24h4m4-9v18m4-13v8m4-14v20m4-15v10m4-16v22m4-14v6m4-11v16m4-9v2"/></svg>`;

/** Pregunta los dos archivos y las opciones, y devuelve la canción fusionada. `current`: la canción abierta. */
export async function openMix(current: Song | null, preset: { score?: File; audio?: File } = {}): Promise<MixResult | null> {
  const canUseOpen = !!current && current.voices.some((v) => v.notes.length && !isSung(v));
  // Si la canción abierta ya es una mezcla, sus notas van al ritmo de aquella grabación (y repetidas en cada vuelta):
  // no sirve como partitura, así que no viene marcada.
  const yaMezcla = !!current && (!!current.audioTrack || current.voices.some(isSung));
  let scoreFile = preset.score ?? null;
  let audioFile = preset.audio ?? null;

  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `<form class="form" novalidate>
    <h2>Mezclar grabación y partitura</h2>
    <p class="intro">Las notas las pone la partitura, que están bien. El ritmo, el tono y la octava los pone la grabación, que es como lo cantáis de verdad.</p>
    <div class="mix-pick">
      <button type="button" class="mix-slot" data-pick="score"><i>${SCORE_SVG}</i><b>Partitura</b><small data-name>MusicXML o MIDI</small></button>
      <span class="mix-plus" aria-hidden="true">+</span>
      <button type="button" class="mix-slot" data-pick="audio"><i>${AUDIO_SVG}</i><b>Grabación</b><small data-name>WAV, MP3, M4A…</small></button>
    </div>
    ${canUseOpen ? `<label class="check"><input type="checkbox" name="useOpen" ${yaMezcla ? '' : 'checked'}/> Usar como partitura la canción abierta, «${esc(current!.title)}»</label>` : ''}
    ${canUseOpen && yaMezcla ? '<small class="hint-s">La canción abierta ya es una mezcla con una grabación: para volver a mezclar, elige el archivo de la partitura original.</small>' : ''}
    <label class="field col">Tonalidad<select name="key">
      <option value="audio" selected>La de la grabación (como se canta)</option>
      <option value="score">La de la partitura</option>
    </select></label>
    <label class="field col">Duración<select name="span">
      <option value="audio" selected>Toda la grabación</option>
      <option value="match">Una vuelta: el trozo que mejor encaja</option>
      <option value="score">Toda la partitura, una vez</option>
    </select><small class="hint-s">Con «Toda la grabación», si cantáis la partitura más de una vez (repeticiones que no están escritas, otra toma…), cada vuelta se coloca donde suena.</small></label>
    <label class="check"><input type="checkbox" name="sung" checked/> Añadir una voz con lo que se canta de verdad</label>
    <label class="check"><input type="checkbox" name="lyrics"/> Poner la letra: la app la escucha en la grabación y pone cada sílaba en su nota</label>
    <small class="hint-s">La primera vez descarga unos 80 MB. El audio no sale de este dispositivo. Si la partitura ya trae letra, se queda la suya.</small>
    <label class="check"><input type="checkbox" name="track" checked/> Oír la grabación junto a las voces</label>
    <small class="hint-s" data-track-hint>La grabación se guarda en este dispositivo (no se sube al grupo) y se puede silenciar como una voz más.</small>
    <p class="hint-s" data-error hidden></p>
    <div class="row end"><button type="button" class="btn" data-cancel>Cancelar</button><button type="button" class="btn primary" data-ok>Fusionar</button></div>
  </form>`;
  document.body.appendChild(dlg);

  const input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  dlg.appendChild(input);
  const err = dlg.querySelector<HTMLElement>('[data-error]')!;
  const useOpen = dlg.querySelector<HTMLInputElement>('[name=useOpen]');
  // Poner la letra o no: se recuerda en este dispositivo.
  const lyricsBox = dlg.querySelector<HTMLInputElement>('[name=lyrics]')!;
  try {
    lyricsBox.checked = localStorage.getItem('voces.mezcla.letra') === 'si';
  } catch {
    /* nada */
  }
  const slot = (k: string) => dlg.querySelector<HTMLElement>(`[data-pick=${k}]`)!;
  const setName = (k: string, f: File | null, fallback: string) => {
    slot(k).querySelector('[data-name]')!.textContent = f ? f.name : fallback;
    slot(k).classList.toggle('filled', !!f);
  };
  setName('score', scoreFile, 'MusicXML o MIDI');
  setName('audio', audioFile, 'WAV, MP3, M4A…');

  const syncOpen = () => {
    const on = !!useOpen?.checked;
    slot('score').hidden = on;
    dlg.querySelector<HTMLElement>('.mix-plus')!.hidden = on;
  };
  useOpen?.addEventListener('change', syncOpen);
  if (useOpen && scoreFile) useOpen.checked = false;
  syncOpen();

  for (const k of ['score', 'audio']) {
    slot(k).onclick = () => {
      input.accept = isNative ? '' : k === 'score' ? SCORE_EXT : AUDIO_ACCEPT;
      input.value = '';
      input.onchange = () => {
        const f = input.files?.[0] ?? null;
        if (!f) return;
        if (k === 'score') {
          scoreFile = f;
          if (useOpen) useOpen.checked = false;
          syncOpen();
        } else audioFile = f;
        setName(k, f, '');
        err.hidden = true;
      };
      input.click();
    };
  }

  const answer = await new Promise<'ok' | null>((resolve) => {
    dlg.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => resolve(null);
    dlg.addEventListener('cancel', () => resolve(null));
    dlg.querySelector<HTMLButtonElement>('[data-ok]')!.onclick = () => {
      const fallo = !audioFile ? 'Elige la grabación.' : !scoreFile && !useOpen?.checked ? 'Elige la partitura.' : '';
      if (fallo) {
        err.textContent = fallo;
        err.hidden = false;
        return;
      }
      resolve('ok');
    };
    dlg.showModal();
  });
  const values = {
    keepKey: dlg.querySelector<HTMLSelectElement>('[name=key]')!.value === 'score',
    span: dlg.querySelector<HTMLSelectElement>('[name=span]')!.value as 'match' | 'score' | 'audio',
    sung: dlg.querySelector<HTMLInputElement>('[name=sung]')!.checked,
    track: dlg.querySelector<HTMLInputElement>('[name=track]')!.checked,
    useOpen: !!useOpen?.checked,
    lyrics: lyricsBox.checked,
  };
  try {
    localStorage.setItem('voces.mezcla.letra', values.lyrics ? 'si' : 'no');
  } catch {
    /* nada */
  }
  if (dlg.open) dlg.close();
  dlg.remove();
  if (!answer || !audioFile) return null;

  const score = values.useOpen && current ? current : await importFile(scoreFile!);
  return mix(score, audioFile, values);
}

/**
 * Por qué no se ha podido poner la letra, como una parte más del aviso final de la mezcla (en minúscula y sin punto), y
 * cómo volver a intentarlo: con el botón Letra, que puede escuchar la grabación si se ha guardado.
 */
function sinLetra(e: unknown, conGrabacion: boolean): string {
  const err = e as Error | undefined;
  const motivo =
    err?.name === 'NetworkError'
      ? 'sin conexión para descargar el modelo que la escucha'
      : // En la web, sin conexión, la parte de la app que escucha puede no estar guardada aún (el navegador da su
        // mensaje en inglés: «Failed to fetch dynamically imported module…», «Importing a module script failed»).
        /dynamically imported module|importing a module script failed|failed to fetch/i.test(err?.message ?? '')
        ? 'sin conexión para cargar la parte de la app que escucha la letra'
        : (err?.message || 'error desconocido').replace(/^No se ha podido sacar la letra:\s*/i, '').replace(/[.\s]+$/, '');
  const reintento = conGrabacion ? '; puedes volver a intentarlo con el botón Letra' : '';
  return `no se ha podido poner la letra (${motivo.charAt(0).toLowerCase()}${motivo.slice(1)})${reintento}`;
}

/** Hace la fusión (con su animación) de una partitura ya leída y un archivo de audio. */
export async function mix(
  score: Song,
  audioFile: File,
  values: { keepKey: boolean; span: 'match' | 'score' | 'audio'; sung: boolean; track: boolean; lyrics?: boolean },
): Promise<MixResult | null> {
  const fusion = openFusion({ scoreName: score.title, audioName: audioFile.name });
  try {
    const data = await audioFile.arrayBuffer();
    const { alignScoreToAudio } = await import('./align');
    const r = await alignScoreToAudio(score, data.slice(0), `${score.title} (grabación)`, {
      start: 0,
      end: 0,
      keepKey: values.keepKey,
      span: values.span,
      addSung: values.sung,
      onProgress: (f, p) => fusion.progress(f, p * (values.lyrics ? 0.8 : 0.95)),
    });
    if (fusion.cancelled) return null;
    const song = r.song;
    const notes: string[] = [];
    if (r.transpose) {
      const n = Math.abs(r.transpose);
      notes.push(`se canta ${n} semitono${n === 1 ? '' : 's'} más ${r.transpose < 0 ? 'baja' : 'alta'} que la partitura`);
    }
    if (r.laps > 1) notes.push(`la partitura se canta ${r.laps} veces a lo largo de la grabación`);
    if (r.passes.length > r.laps) notes.push('se repite o se salta algún trozo de la partitura');
    // Voces con el mismo nombre: se distinguen por su posición.
    const repe = (o: { name: string }) => r.octaves.filter((x) => x.name === o.name).length > 1;
    for (const o of r.octaves) {
      if (!o.semis) continue;
      const cuanto = Math.abs(o.semis) === 12 ? 'una octava' : `${Math.abs(o.semis) / 12} octavas`;
      notes.push(`«${o.name}»${repe(o) ? ` (voz ${o.index + 1})` : ''} ${cuanto} más ${o.semis < 0 ? 'baja' : 'alta'} de lo escrito`);
    }
    if (r.sung) notes.push(r.sung.matches ? `la voz que se oye es la de «${r.sung.matches}»` : 'añadida la voz que se oye');

    // La letra: se escucha en la grabación y cada sílaba va a la nota de la melodía en que se oye (y a las de las voces
    // que van a su ritmo). Si falla, la mezcla sigue sin letra.
    let oidas: PalabraOida[] | null = null;
    if (values.lyrics) {
      const partitura = song.voices.filter((v) => !isSung(v) && v.notes.length);
      // La melodía: la voz de la partitura que más se oye en la grabación; si no se sabe, la primera (la de arriba).
      const melodia = partitura.find((v) => v.id === r.sung?.voice.sungOf) ?? partitura[0];
      // Si la partitura ya trae la letra de la melodía (no unas sílabas sueltas), se queda la suya.
      if (melodia && melodia.notes.filter((n) => n.lyric).length >= 0.25 * melodia.notes.length) notes.push('la letra es la de la partitura');
      else if (melodia) {
        // Cancelar la fusión también deja de escuchar: para la descarga del modelo y Whisper.
        const corta = new AbortController();
        const vigila = window.setInterval(() => {
          if (fusion.cancelled) corta.abort();
        }, 150);
        try {
          fusion.progress('Preparando la grabación para escuchar la letra…', 0.8);
          const { hearSong, SR_LETRA } = await import('./transcribe');
          const audio16 = await decodeMono(data.slice(0), SR_LETRA);
          if (fusion.cancelled) return null;
          oidas = await hearSong(song, audio16, r.audioOffset, (f, p) => fusion.progress(f, 0.8 + 0.15 * p), corta.signal);
          if (fusion.cancelled) return null;
          if (!oidas.length) notes.push('no se ha oído letra en la grabación');
          else {
            const { copyNotices, placeHeard } = await import('../editor/lyricsPlace');
            const res = placeHeard(song, melodia, oidas, null, 0, true);
            // Las copias llevan la marca ámbar de su sílaba: también hay que revisarlas.
            const ambar = partitura.reduce((s, v) => s + v.notes.filter((n) => n.lyricDoubt).length, 0);
            const enOtras = ambar - res.dudosas;
            notes.push(
              `letra puesta en «${melodia.name}» (${res.puestas} ${res.puestas === 1 ? 'sílaba' : 'sílabas'})${res.otras ? ' y en las voces que van a su ritmo' : ''}`,
              ...copyNotices(res),
            );
            if (ambar)
              notes.push(
                `${ambar} ${ambar === 1 ? 'nota' : 'notas'} en ámbar para revisar con el botón Letra` +
                  (enOtras > 0 ? ` (${enOtras} en las otras voces)` : ''),
              );
          }
        } catch (e) {
          // Cancelada: no se avisa de nada (la escucha se ha parado a propósito).
          if (fusion.cancelled) return null;
          console.warn('[voces] no se ha podido poner la letra', e);
          notes.push(sinLetra(e, values.track));
        } finally {
          window.clearInterval(vigila);
        }
      }
    }
    // Si se ha cancelado mientras tanto, no se guarda la grabación de una canción que no se va a abrir.
    if (fusion.cancelled) return null;

    if (values.track) {
      fusion.progress('Guardando la grabación…', 0.97);
      try {
        const mono = await decodeMono(data.slice(0));
        if (fusion.cancelled) return null;
        // Solo se guarda lo que hace falta: del principio de la canción al final, con un segundo de margen.
        const cut0 = values.span === 'audio' ? 0 : Math.max(0, r.audioOffset - 1);
        const end = values.span === 'audio' ? mono.length / TRACK_SR : Math.min(mono.length / TRACK_SR, r.audioTo + 1.5);
        const slice = mono.subarray(Math.floor(cut0 * TRACK_SR), Math.max(0, Math.floor(end * TRACK_SR)));
        if (slice.length > TRACK_SR) {
          await putTrack(song.id, encodeWav(slice, TRACK_SR));
          song.audioTrack = {
            name: audioFile.name,
            offset: r.audioOffset - cut0,
            duration: slice.length / TRACK_SR,
            volume: 0.8,
            muted: false,
            solo: false,
          };
          notes.push('la grabación suena junto a las voces');
          // Lo oído se recuerda: el diálogo Letra no tiene que volver a escuchar la grabación.
          if (oidas) (await import('./transcribe')).rememberHeard(song, oidas);
        }
      } catch (e) {
        console.warn('[voces] no se ha podido guardar la grabación', e);
        notes.push('no se ha podido guardar la grabación para oírla');
      }
    }
    await fusion.finish();
    return fusion.cancelled ? null : { song, notes };
  } finally {
    fusion.close();
  }
}
