import type { AudioEngine } from '../audio/engine';
import { makeVoice, VOICE_COLORS, type Song } from '../model';
import { insertMonophonic, midiToName, prettyAccidentals } from '../music';
import { esc } from '../ui/dialog';
import { freqToMidi, Yin } from './pitch';
import { segmentPitch, type PitchFrame } from './segment';

export interface HumDeps {
  engine: AudioEngine;
  song: () => Song;
  activeVoiceId: () => string | null;
  setActiveVoice: (id: string) => void;
  /** Aplica un cambio con deshacer y refresco. */
  apply: (fn: () => void) => void;
  toast: (msg: string, error?: boolean) => void;
  snapBeats: () => number;
}

const LAT_KEY = 'voces.hum.latency';

/** Panel para cantar o tararear y convertirlo en notas de una voz. */
export async function openHumPanel(deps: HumDeps) {
  const { engine } = deps;
  const song = deps.song();
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg hum-dlg';
  const voiceOpts = song.voices
    .map((v) => `<option value="${v.id}" ${v.id === deps.activeVoiceId() ? 'selected' : ''}>${esc(v.name)}</option>`)
    .join('');
  const savedLat = (() => {
    try {
      return localStorage.getItem(LAT_KEY) ?? '80';
    } catch {
      return '80';
    }
  })();
  const snap = deps.snapBeats();
  dlg.innerHTML = `
    <h2>🎤 Tararear una voz</h2>
    <div class="hum-live">
      <div class="hum-note" id="hum-note">—</div>
      <canvas id="hum-trail" width="600" height="150"></canvas>
      <div class="hum-status" id="hum-status">Preparando el micrófono…</div>
    </div>
    <div class="hum-grid">
      <label class="field col">Voz<select id="hum-voice">${voiceOpts}<option value="__new">＋ Nueva voz</option></select></label>
      <label class="field col">Empezar en<select id="hum-from">
        <option value="now">Posición actual (${fmt(engine.time)})</option>
        <option value="start">Principio</option>
        <option value="end">Al final de la voz</option>
      </select></label>
      <label class="field col">Ajustar a<select id="hum-grid">
        <option value="0.25" ${snap === 0.25 ? 'selected' : ''}>Semicorcheas</option>
        <option value="0.5" ${snap === 0.5 ? 'selected' : ''}>Corcheas</option>
        <option value="1" ${snap === 1 ? 'selected' : ''}>Negras</option>
        <option value="0">Sin ajustar</option>
      </select></label>
      <label class="field col">Octava<select id="hum-oct">
        <option value="0">Tal cual</option>
        <option value="1">Subir una</option>
        <option value="-1">Bajar una</option>
      </select></label>
    </div>
    <div class="hum-checks">
      <label class="check"><input type="checkbox" id="hum-acc" ${song.voices.some((v) => v.notes.length) ? 'checked' : ''}/> Oír las otras voces</label>
      <label class="check"><input type="checkbox" id="hum-met" checked/> Metrónomo (${song.bpm} BPM)</label>
      <label class="check"><input type="checkbox" id="hum-count" checked/> Cuenta atrás de 1 compás</label>
    </div>
    <details class="hum-adv"><summary>Ajustes avanzados</summary>
      <label class="field">Compensar retraso <input type="number" id="hum-lat" min="0" max="400" step="10" value="${esc(savedLat)}"/> ms</label>
      <p class="hint-s">Si las notas quedan un poco tarde respecto al metrónomo, sube este valor. Con auriculares suele bastar 60-100 ms.</p>
    </details>
    <p class="hint-s">Consejo: usa auriculares si oyes las otras voces, y canta con «na» o «du» para que cada nota se separe bien.</p>
    <div class="row end">
      <button class="btn" id="hum-close">Cerrar</button>
      <button class="btn primary" id="hum-rec">● Grabar</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.showModal();

  const $ = <T extends HTMLElement>(id: string) => dlg.querySelector('#' + id) as T;
  const status = $<HTMLElement>('hum-status');
  const noteEl = $<HTMLElement>('hum-note');
  const trail = $<HTMLCanvasElement>('hum-trail');
  const tctx = trail.getContext('2d')!;
  const recBtn = $<HTMLButtonElement>('hum-rec');

  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let tick: number | undefined;
  let metro: number | undefined;
  const live: { t: number; midi: number | null }[] = [];
  let recording = false;
  let frames: PitchFrame[] = [];
  let recStart = 0;
  let restoreMute: (() => void) | null = null;

  const ctx = engine.context();
  try {
    if (ctx.state !== 'running') await ctx.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    status.textContent = 'No se pudo usar el micrófono. Revisa los permisos del navegador o de la app.';
    status.classList.add('err');
    recBtn.disabled = true;
    console.error(err);
  }

  const yin = new Yin(ctx.sampleRate, 2048);
  const buf = new Float32Array(2048);
  if (stream) {
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    status.textContent = 'Micrófono listo. Prueba a cantar una nota.';
    tick = window.setInterval(onTick, 15);
  }

  function onTick() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const r = yin.detect(buf);
    const voiced = r.freq > 0 && r.clarity > 0.8 && r.rms > 0.01;
    const midi = voiced ? freqToMidi(r.freq) : null;
    const now = ctx.currentTime;
    live.push({ t: now, midi });
    while (live.length && now - live[0].t > 4) live.shift();
    if (midi !== null) {
      const rounded = Math.round(midi);
      const cents = Math.round((midi - rounded) * 100);
      noteEl.innerHTML = `${prettyAccidentals(midiToName(rounded, song.keyFifths))}<small>${cents > 0 ? '+' : ''}${cents}¢</small>`;
    } else noteEl.textContent = '—';
    if (recording) {
      const lat = (parseFloat($<HTMLInputElement>('hum-lat').value) || 0) / 1000;
      const frameCtx = now - 1024 / ctx.sampleRate - lat - ((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0);
      const t = engine.ctxToSong(frameCtx);
      if (t >= recStart) {
        frames.push({ t, midi });
        status.textContent = `Grabando… ${fmt(t)}  ·  ${frames.filter((f) => f.midi !== null).length > 0 ? 'te oigo' : 'esperando voz'}`;
      } else {
        const left = Math.ceil((recStart - t) / (60 / song.bpm));
        status.textContent = `Preparados… ${left}`;
      }
    }
    drawTrail();
  }

  function drawTrail() {
    const w = trail.width;
    const h = trail.height;
    tctx.fillStyle = '#1a0820';
    tctx.fillRect(0, 0, w, h);
    const vals = live.filter((p) => p.midi !== null).map((p) => p.midi!) as number[];
    const center = vals.length ? vals[vals.length - 1] : 60;
    const lo = Math.round(center) - 7;
    const hi = Math.round(center) + 7;
    const Y = (m: number) => h - ((m - lo) / (hi - lo)) * h;
    tctx.font = '10px system-ui';
    for (let m = lo; m <= hi; m++) {
      tctx.fillStyle = m % 12 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      tctx.fillRect(0, Y(m), w, 1);
      if (m % 12 === 0 || m === Math.round(center)) {
        tctx.fillStyle = 'rgba(255,255,255,0.4)';
        tctx.fillText(midiToName(m, song.keyFifths), 4, Y(m) - 2);
      }
    }
    const now = ctx.currentTime;
    tctx.strokeStyle = recording ? '#ff2d6f' : '#1fd6f2';
    tctx.lineWidth = 3;
    tctx.beginPath();
    let pen = false;
    for (const p of live) {
      const x = w - ((now - p.t) / 4) * w;
      if (p.midi === null || p.midi < lo - 2 || p.midi > hi + 2) {
        pen = false;
        continue;
      }
      if (!pen) tctx.moveTo(x, Y(p.midi));
      else tctx.lineTo(x, Y(p.midi));
      pen = true;
    }
    tctx.stroke();
  }

  async function startRec() {
    const s = deps.song();
    let voiceId = $<HTMLSelectElement>('hum-voice').value;
    if (voiceId === '__new') {
      const used = new Set(s.voices.map((v) => v.color));
      const v = makeVoice(`Tarareo ${s.voices.length + 1}`, s.voices.length);
      v.color = VOICE_COLORS.find((c) => !used.has(c)) ?? v.color;
      deps.apply(() => s.voices.push(v));
      voiceId = v.id;
      const sel = $<HTMLSelectElement>('hum-voice');
      sel.insertAdjacentHTML('afterbegin', `<option value="${v.id}">${esc(v.name)}</option>`);
      sel.value = v.id;
    }
    deps.setActiveVoice(voiceId);
    const voice = s.voices.find((v) => v.id === voiceId)!;
    const spb = 60 / s.bpm;
    const from = $<HTMLSelectElement>('hum-from').value;
    let start = from === 'start' ? 0 : from === 'end' ? voice.notes.reduce((e, n) => Math.max(e, n.start + n.dur), 0) : engine.time;
    start = Math.round(start / spb) * spb; // empieza en un pulso
    const countIn = $<HTMLInputElement>('hum-count').checked ? s.beatsPerBar * spb : 0;
    const acc = $<HTMLInputElement>('hum-acc').checked;
    const met = $<HTMLInputElement>('hum-met').checked;

    // La voz que se graba no suena; sin acompañamiento, no suena nada salvo el metrónomo.
    const wasMuted = voice.muted;
    voice.muted = true;
    engine.updateMix();
    if (!acc) engine.setMasterMuted(true);
    restoreMute = () => {
      voice.muted = wasMuted;
      engine.updateMix();
      engine.setMasterMuted(false);
    };

    engine.holdOpen = true;
    frames = [];
    recStart = start;
    await engine.play(start, 0.15 + countIn / engine.rate);
    recording = true;
    recBtn.textContent = '■ Parar y guardar';
    recBtn.classList.add('rec');

    // Metrónomo (incluida la cuenta atrás).
    let nextBeat = start - countIn;
    const bar = s.beatsPerBar;
    const schedule = () => {
      const horizon = ctx.currentTime + 0.3;
      while (engine.songToCtx(nextBeat) < horizon) {
        const inCount = nextBeat < start - 1e-6;
        if (met || inCount) {
          const beatIdx = Math.round(nextBeat / spb);
          engine.click(engine.songToCtx(nextBeat), ((beatIdx % bar) + bar) % bar === 0);
        }
        nextBeat += spb;
      }
    };
    schedule();
    metro = window.setInterval(schedule, 80);
  }

  function stopRec(save: boolean) {
    if (!recording) return;
    recording = false;
    clearInterval(metro);
    engine.pause();
    engine.holdOpen = false;
    restoreMute?.();
    restoreMute = null;
    recBtn.textContent = '● Grabar';
    recBtn.classList.remove('rec');
    if (!save) return;

    const s = deps.song();
    const voice = s.voices.find((v) => v.id === deps.activeVoiceId());
    if (!voice) return;
    const gridBeats = parseFloat($<HTMLSelectElement>('hum-grid').value);
    const notes = segmentPitch(frames, {
      grid: gridBeats ? (gridBeats * 60) / s.bpm : 0,
      octaveShift: parseInt($<HTMLSelectElement>('hum-oct').value) || 0,
    }).filter((n) => n.start >= recStart - 0.05);
    if (!notes.length) {
      status.textContent = 'No he detectado notas. Canta un poco más fuerte o acércate al micrófono.';
      return;
    }
    const end = frames.length ? frames[frames.length - 1].t : recStart;
    deps.apply(() => {
      // Sustituye lo que hubiera en el tramo grabado.
      voice.notes = voice.notes.filter((n) => n.start + n.dur <= recStart + 1e-6 || n.start >= end - 1e-6);
      for (const n of notes) voice.notes = insertMonophonic(voice.notes, n);
    });
    try {
      localStorage.setItem(LAT_KEY, $<HTMLInputElement>('hum-lat').value);
    } catch {
      /* nada */
    }
    status.textContent = `✓ ${notes.length} notas añadidas a «${voice.name}». Puedes grabar otra vez o cerrar.`;
    deps.toast(`${notes.length} notas añadidas a «${voice.name}».`);
  }

  recBtn.onclick = () => (recording ? stopRec(true) : startRec());

  const cleanup = () => {
    stopRec(false);
    clearInterval(tick);
    source?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    dlg.remove();
  };
  $<HTMLButtonElement>('hum-close').onclick = () => dlg.close();
  dlg.addEventListener('close', cleanup);
}

function fmt(t: number) {
  t = Math.max(0, t);
  return `${Math.floor(t / 60)}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;
}
