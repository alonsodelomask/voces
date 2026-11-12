import './styles.css';
import { AudioEngine, PRESETS, type Preset } from './audio/engine';
import { demoSong } from './demo';
import { PianoRoll, type Tool } from './editor/pianoroll';
import { download, exportMidi, exportProject, safeName } from './export';
import { ACCEPTED, importFile } from './import';
import { makeSong, makeVoice, VOICE_COLORS, type Song, type Voice } from './model';
import { computeChords } from './music';
import { deleteSong, getLast, loadSongs, saveSong, setLast } from './storage';
import { Visualizer } from './viz/visualizer';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const engine = new AudioEngine();
const viz = new Visualizer($<HTMLCanvasElement>('#viz'));
const roll = new PianoRoll($<HTMLCanvasElement>('#roll'));
let song: Song;
let view: 'viz' | 'edit' = 'viz';
let dirty = false;
let saveTimer: number | undefined;

// ---------------- Canción ----------------

function setSong(s: Song, save = false) {
  engine.pause();
  song = s;
  engine.setSong(s);
  viz.setSong(s);
  roll.setSong(s);
  setLast(s.id);
  renderPanel();
  renderEditorControls();
  updateDuration();
  $('#empty').hidden = s.voices.some((v) => v.notes.length);
  if (save) persist();
}

function persist() {
  if (!saveSong(song)) toast('No se pudo guardar (almacenamiento lleno).', true);
  dirty = false;
}

/** Llamar tras cualquier edición de notas. */
function changed() {
  if (song.chordsAuto) song.chords = computeChords(song);
  viz.updateRange();
  updateDuration();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 800);
}

function updateDuration() {
  $('#dur').textContent = fmt(engine.duration);
}

function fmt(t: number) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------- Panel de voces ----------------

function renderPanel() {
  const title = $<HTMLInputElement>('#song-title');
  title.value = song.title;
  const list = $('#voice-list');
  list.innerHTML = '';
  song.voices.forEach((v) => list.appendChild(voiceRow(v)));
  $<HTMLInputElement>('#opt-chords-auto').checked = song.chordsAuto;
}

function voiceRow(v: Voice): HTMLElement {
  const row = document.createElement('div');
  row.className = 'voice' + (view === 'edit' && roll.activeVoice === v ? ' active' : '');
  row.innerHTML = `
    <input type="color" value="${v.color}" title="Color" />
    <input class="vname" value="" />
    <div class="vbtns">
      <button data-k="m" title="Silenciar">M</button>
      <button data-k="s" title="Escuchar solo esta voz">S</button>
      <button data-k="h" title="Ocultar">👁</button>
      <button data-k="x" title="Eliminar voz">✕</button>
    </div>
    <div class="vrange"><span>Vol</span><input type="range" min="0" max="1" step="0.01" /><span class="n"></span></div>`;
  const color = row.querySelector<HTMLInputElement>('input[type=color]')!;
  const name = row.querySelector<HTMLInputElement>('.vname')!;
  const vol = row.querySelector<HTMLInputElement>('input[type=range]')!;
  name.value = v.name;
  vol.value = String(v.volume);
  row.querySelector('.n')!.textContent = `${v.notes.length} notas`;
  const refresh = () => {
    row.querySelector('[data-k=m]')!.classList.toggle('on-m', v.muted);
    row.querySelector('[data-k=s]')!.classList.toggle('on-s', v.solo);
    row.querySelector('[data-k=h]')!.classList.toggle('on-h', v.hidden);
  };
  refresh();
  color.oninput = () => {
    v.color = color.value;
    dirty = true;
  };
  name.onchange = () => {
    v.name = name.value.trim() || v.name;
    renderEditorControls();
    persist();
  };
  vol.oninput = () => {
    v.volume = parseFloat(vol.value);
    engine.updateMix();
  };
  row.querySelector('.vbtns')!.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest('button')?.dataset.k;
    if (k === 'm') v.muted = !v.muted;
    if (k === 's') v.solo = !v.solo;
    if (k === 'h') {
      v.hidden = !v.hidden;
      viz.updateRange();
    }
    if (k === 'x') {
      if (!confirm(`¿Eliminar la voz "${v.name}" y sus ${v.notes.length} notas?`)) return;
      song.voices = song.voices.filter((x) => x !== v);
      engine.setSong(song);
      changed();
      renderPanel();
      renderEditorControls();
      return;
    }
    engine.updateMix();
    refresh();
    dirty = true;
  });
  row.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input,button')) return;
    roll.activeVoiceId = v.id;
    renderEditorControls();
    renderPanel();
  });
  return row;
}

$('#add-voice').onclick = () => {
  const v = makeVoice(`Voz ${song.voices.length + 1}`, song.voices.length);
  // Evita repetir color si es posible.
  const used = new Set(song.voices.map((x) => x.color));
  v.color = VOICE_COLORS.find((c) => !used.has(c)) ?? v.color;
  song.voices.push(v);
  roll.activeVoiceId = v.id;
  engine.updateMix();
  renderPanel();
  renderEditorControls();
  persist();
  if (view !== 'edit') switchView('edit');
};

$<HTMLInputElement>('#song-title').onchange = (e) => {
  song.title = (e.target as HTMLInputElement).value.trim() || 'Sin título';
  persist();
};
$<HTMLInputElement>('#opt-chords-auto').onchange = (e) => {
  song.chordsAuto = (e.target as HTMLInputElement).checked;
  if (song.chordsAuto) song.chords = computeChords(song);
  persist();
};
$<HTMLInputElement>('#opt-names').onchange = (e) => (viz.opts.showNames = (e.target as HTMLInputElement).checked);
$<HTMLInputElement>('#opt-loop').onchange = (e) => (engine.loop = (e.target as HTMLInputElement).checked);
$<HTMLInputElement>('#opt-watermark').oninput = (e) => (viz.opts.watermark = (e.target as HTMLInputElement).value);

const panel = $('#panel');
if (window.innerWidth < 760) panel.classList.add('closed');
$('#btn-voices').onclick = () => panel.classList.toggle('closed');
$('#panel-close').onclick = () => panel.classList.add('closed');

// ---------------- Editor ----------------

function renderEditorControls() {
  const sel = $<HTMLSelectElement>('#ed-voice');
  sel.innerHTML = '';
  for (const v of song.voices) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
  if (roll.activeVoice) sel.value = roll.activeVoice.id;
  $<HTMLInputElement>('#ed-bpm').value = String(song.bpm);
  const bar = $<HTMLSelectElement>('#ed-bar');
  bar.value = String(song.beatsPerBar);
  if (bar.value !== String(song.beatsPerBar)) {
    const o = document.createElement('option');
    o.value = o.textContent = String(song.beatsPerBar);
    bar.appendChild(o);
    bar.value = o.value;
  }
}

$<HTMLSelectElement>('#ed-voice').onchange = (e) => {
  roll.activeVoiceId = (e.target as HTMLSelectElement).value;
  renderPanel();
};
$('#ed-tools').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  roll.tool = b.dataset.tool as Tool;
  document.querySelectorAll('#ed-tools button').forEach((x) => x.classList.toggle('active', x === b));
});
$<HTMLSelectElement>('#ed-len').onchange = (e) => (roll.noteLen = parseFloat((e.target as HTMLSelectElement).value));
$<HTMLSelectElement>('#ed-snap').onchange = (e) => (roll.snap = parseFloat((e.target as HTMLSelectElement).value));
$<HTMLInputElement>('#ed-bpm').onchange = (e) => {
  const nb = Math.max(30, Math.min(300, parseFloat((e.target as HTMLInputElement).value) || song.bpm));
  // Mantiene las notas en su sitio de la rejilla: reescala los tiempos.
  const k = song.bpm / nb;
  for (const v of song.voices) for (const n of v.notes) {
    n.start *= k;
    n.dur *= k;
  }
  for (const c of song.chords) c.time *= k;
  song.bpm = nb;
  engine.seek(engine.time * k);
  changed();
};
$<HTMLSelectElement>('#ed-bar').onchange = (e) => {
  song.beatsPerBar = parseInt((e.target as HTMLSelectElement).value) || 4;
  persist();
};
$('#ed-zoom-in').onclick = () => (roll.pxPerBeat = Math.min(220, roll.pxPerBeat * 1.25));
$('#ed-zoom-out').onclick = () => (roll.pxPerBeat = Math.max(12, roll.pxPerBeat / 1.25));

roll.onChange = changed;
roll.onPreview = (midi, v) => engine.preview(midi, v);
roll.onSeek = (t) => engine.seek(t);

// ---------------- Vistas ----------------

function switchView(v: 'viz' | 'edit') {
  view = v;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.view === v));
  $('#view-viz').classList.toggle('active', v === 'viz');
  $('#view-edit').classList.toggle('active', v === 'edit');
  if (v === 'edit') {
    requestAnimationFrame(() => roll.centerOnNotes());
  }
  renderPanel();
}
document.querySelectorAll<HTMLElement>('.tab').forEach((t) => (t.onclick = () => switchView(t.dataset.view as 'viz' | 'edit')));

// ---------------- Transporte ----------------

const seek = $<HTMLInputElement>('#seek');
let seeking = false;
seek.addEventListener('input', () => {
  seeking = true;
  engine.seek((parseFloat(seek.value) / 1000) * engine.duration);
});
seek.addEventListener('change', () => (seeking = false));

async function togglePlay() {
  if (engine.playing) engine.pause();
  else await engine.play();
}
$('#btn-play').onclick = togglePlay;
$('#btn-rewind').onclick = () => engine.seek(0);
$<HTMLSelectElement>('#rate').onchange = (e) => engine.setRate(parseFloat((e.target as HTMLSelectElement).value));
const presetSel = $<HTMLSelectElement>('#preset');
for (const p of PRESETS) {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.label;
  presetSel.appendChild(o);
}
presetSel.onchange = () => (engine.preset = presetSel.value as Preset);
$<HTMLInputElement>('#vzoom').oninput = (e) => (viz.opts.zoom = parseFloat((e.target as HTMLInputElement).value));

// Gestos en el visualizador: arrastrar para desplazarse en el tiempo, pellizco/rueda para zoom.
{
  const c = $<HTMLCanvasElement>('#viz');
  let startX = 0;
  let startT = 0;
  let wasPlaying = false;
  let down = false;
  c.addEventListener('pointerdown', (e) => {
    down = true;
    startX = e.clientX;
    startT = engine.time;
    wasPlaying = engine.playing;
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 4) return;
    if (engine.playing) engine.pause();
    const pps = Math.min(c.clientWidth, c.clientHeight) * 0.32 * viz.opts.zoom;
    engine.seek(Math.max(0, startT - dx / pps));
  });
  c.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    const tap = Math.abs(e.clientX - startX) < 4;
    if (tap) togglePlay();
    else if (wasPlaying) engine.play();
  });
  c.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        viz.opts.zoom = Math.max(0.4, Math.min(2.5, viz.opts.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        $<HTMLInputElement>('#vzoom').value = String(viz.opts.zoom);
      } else {
        engine.seek(engine.time + (e.deltaY + e.deltaX) * 0.004);
      }
    },
    { passive: false },
  );
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowRight') engine.seek(engine.time + 5);
  else if (e.code === 'ArrowLeft') engine.seek(engine.time - 5);
  else if (e.code === 'Home') engine.seek(0);
});

engine.onEnded = () => {};

// ---------------- Importar ----------------

const fileInput = $<HTMLInputElement>('#file');
fileInput.accept = ACCEPTED;
$('#btn-open').onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (f) await openFile(f);
};

async function openFile(f: File) {
  try {
    const s = await importFile(f);
    setSong(s, true);
    const n = s.voices.reduce((a, v) => a + v.notes.length, 0);
    toast(`"${s.title}": ${s.voices.length} voces, ${n} notas.`);
  } catch (err) {
    console.error(err);
    toast((err as Error).message || 'No se pudo leer el archivo.', true);
  }
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('#drop').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $('#drop').hidden = true;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (f) openFile(f);
});

// ---------------- Menú ----------------

const menu = $('#menu');
$('#btn-menu').onclick = (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
};
document.addEventListener('click', () => (menu.hidden = true));
menu.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.act;
  menu.hidden = true;
  switch (act) {
    case 'new':
      $<HTMLDialogElement>('#dlg-new').showModal();
      break;
    case 'library':
      openLibrary();
      break;
    case 'save':
      persist();
      toast('Guardado en este dispositivo.');
      break;
    case 'export-midi':
      exportMidi(song);
      break;
    case 'export-project':
      exportProject(song);
      break;
    case 'record':
      recordVideo();
      break;
    case 'demo':
      setSong(demoSong(), true);
      break;
    case 'help':
      $<HTMLDialogElement>('#dlg-help').showModal();
      break;
  }
});

$<HTMLDialogElement>('#dlg-new').addEventListener('close', () => {
  const dlg = $<HTMLDialogElement>('#dlg-new');
  if (dlg.returnValue !== 'ok') return;
  const fd = new FormData($<HTMLFormElement>('#form-new'));
  const n = Math.max(1, Math.min(8, parseInt(String(fd.get('voices'))) || 4));
  const names = n === 4 ? ['Soprano', 'Contralto', 'Tenor', 'Bajo'] : Array.from({ length: n }, (_, i) => `Voz ${i + 1}`);
  const s = makeSong({
    title: String(fd.get('title') || 'Nueva canción'),
    bpm: parseInt(String(fd.get('bpm'))) || 90,
    beatsPerBar: parseInt(String(fd.get('bar'))) || 4,
    voices: names.map((nm, i) => makeVoice(nm, i)),
  });
  setSong(s, true);
  switchView('edit');
});

function openLibrary() {
  const list = $('#library-list');
  list.innerHTML = '';
  const songs = loadSongs();
  if (!songs.length) list.innerHTML = '<p style="color:var(--muted)">Aún no hay canciones guardadas.</p>';
  for (const s of songs) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    const nNotes = s.voices.reduce((a, v) => a + v.notes.length, 0);
    item.innerHTML = `<div class="meta"><b></b><small>${s.voices.length} voces · ${nNotes} notas · ${new Date(s.updatedAt).toLocaleDateString()}</small></div><button class="btn small" title="Eliminar">✕</button>`;
    item.querySelector('b')!.textContent = s.title;
    item.querySelector<HTMLElement>('.meta')!.onclick = () => {
      $<HTMLDialogElement>('#dlg-library').close();
      setSong(s);
    };
    item.querySelector('button')!.onclick = () => {
      if (!confirm(`¿Eliminar "${s.title}" de este dispositivo?`)) return;
      deleteSong(s.id);
      openLibrary();
    };
    list.appendChild(item);
  }
  const dlg = $<HTMLDialogElement>('#dlg-library');
  if (!dlg.open) dlg.showModal();
}

// ---------------- Grabar vídeo ----------------

async function recordVideo() {
  if (!('MediaRecorder' in window)) return toast('Tu navegador no permite grabar vídeo.', true);
  const canvas = document.createElement('canvas');
  const recViz = new Visualizer(canvas);
  recViz.fixedSize = { w: 1080, h: 1920 };
  recViz.opts = { ...viz.opts };
  recViz.setSong(song);
  const preview = $<HTMLCanvasElement>('#rec-preview');
  const pctx = preview.getContext('2d')!;
  preview.width = 270;
  preview.height = 480;

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...engine.getRecordStream().getAudioTracks()]);
  const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let raf = 0;
  const dlg = $<HTMLDialogElement>('#dlg-record');
  const finish = () => {
    if (rec.state !== 'inactive') rec.stop();
  };
  rec.onstop = () => {
    cancelAnimationFrame(raf);
    engine.pause();
    engine.onEnded = null;
    dlg.close();
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime || 'video/webm' }), `${safeName(song.title)}.${ext}`);
    toast(`Vídeo guardado (.${ext}).`);
  };
  $('#rec-stop').onclick = finish;
  dlg.onclose = finish;
  engine.onEnded = finish;
  dlg.showModal();

  // Un pequeño margen inicial para que se vea la entrada de las líneas.
  const lead = 1.0;
  engine.seek(0);
  rec.start(250);
  const t0 = performance.now();
  let started = false;
  const frame = () => {
    const el = (performance.now() - t0) / 1000;
    if (!started && el >= lead) {
      started = true;
      engine.play(0);
    }
    const t = started ? engine.time : el - lead;
    recViz.render(t, started && engine.playing);
    pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
    raf = requestAnimationFrame(frame);
  };
  frame();
}

// ---------------- Avisos ----------------

let toastTimer: number | undefined;
function toast(msg: string, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), error ? 7000 : 3500);
}

// ---------------- Bucle de dibujo ----------------

function loop() {
  const t = engine.time;
  document.body.classList.toggle('playing', engine.playing);
  if (view === 'viz') viz.render(t, engine.playing);
  else {
    roll.playTime = t;
    if (engine.playing) roll.ensureVisible(t);
    roll.render();
  }
  if (!seeking) seek.value = String(engine.duration ? Math.round((t / engine.duration) * 1000) : 0);
  $('#time').textContent = fmt(t);
  requestAnimationFrame(loop);
}

window.addEventListener('beforeunload', () => {
  if (dirty) persist();
});

// ---------------- Inicio ----------------

const saved = loadSongs();
const last = getLast();
setSong(saved.find((s) => s.id === last) ?? saved[0] ?? demoSong());
requestAnimationFrame(loop);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Para depurar desde la consola.
(window as unknown as Record<string, unknown>).voces = { engine, viz, roll, openFile, get song() { return song; } };
