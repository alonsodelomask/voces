import type { Note, Song, Voice } from '../model';
import { insertMonophonic, midiToName, prettyAccidentals } from '../music';

export type Tool = 'draw' | 'erase' | 'pan';

const KEYS_W = 46;
const BAR_H = 20;
const CHORD_H = 22;
const TOP = BAR_H + CHORD_H;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Drag {
  kind: 'new' | 'move' | 'resize' | 'pan' | 'seek';
  note?: Note;
  startX: number;
  startY: number;
  origStart: number;
  origDur: number;
  origMidi: number;
  scrollX: number;
  scrollY: number;
  moved: boolean;
}

/**
 * Editor tipo "piano roll": cada voz es una línea monofónica.
 * Las posiciones se manejan en pulsos (negras) y se guardan en segundos.
 */
export class PianoRoll {
  private ctx: CanvasRenderingContext2D;
  song: Song | null = null;
  activeVoiceId: string | null = null;
  tool: Tool = 'draw';
  /** Duración por defecto de las notas nuevas, en pulsos. */
  noteLen = 1;
  /** Rejilla en pulsos. */
  snap = 0.5;
  pxPerBeat = 48;
  rowH = 14;
  scrollX = 0; // en px
  scrollY = 0;
  playTime = 0;
  private drag: Drag | null = null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private hover: Note | null = null;

  onChange: (() => void) | null = null;
  onPreview: ((midi: number, v: Voice) => void) | null = null;
  onSeek: ((t: number) => void) | null = null;
  /** Se llama justo antes de modificar notas (para deshacer). */
  onBeforeEdit: (() => void) | null = null;
  /** Clic en la fila de acordes: tiempo (s) ajustado a la rejilla y el acorde pulsado, si lo hay. */
  onChordClick: ((time: number, index: number) => void) | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const n = this.hit(this.pos(e));
      if (n) {
        this.onBeforeEdit?.();
        this.remove(n);
      }
    });
    canvas.addEventListener('dblclick', (e) => {
      const n = this.hit(this.pos(e));
      if (n) {
        this.onBeforeEdit?.();
        this.remove(n);
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
          const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          const p = this.pos(e);
          const beat = this.xToBeat(p.x);
          this.pxPerBeat = Math.max(12, Math.min(220, this.pxPerBeat * f));
          this.scrollX = Math.max(0, beat * this.pxPerBeat - (p.x - KEYS_W));
        } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          this.scrollX = Math.max(0, this.scrollX + (e.deltaX || e.deltaY));
        } else {
          this.scrollY = this.clampY(this.scrollY + e.deltaY);
        }
      },
      { passive: false },
    );
  }

  get spb() {
    return 60 / (this.song?.bpm ?? 100);
  }
  get activeVoice(): Voice | undefined {
    return this.song?.voices.find((v) => v.id === this.activeVoiceId) ?? this.song?.voices[0];
  }

  setSong(song: Song | null) {
    this.song = song;
    this.activeVoiceId = song?.voices[0]?.id ?? null;
    this.scrollX = 0;
    this.centerOnNotes();
  }

  centerOnNotes() {
    const notes = this.song?.voices.flatMap((v) => v.notes) ?? [];
    const mid = notes.length ? notes.reduce((s, n) => s + n.midi, 0) / notes.length : 60;
    const rect = this.canvas.getBoundingClientRect();
    this.scrollY = this.clampY((127 - mid) * this.rowH - (rect.height - TOP) / 2);
  }

  private clampY(y: number) {
    const rect = this.canvas.getBoundingClientRect();
    return Math.max(0, Math.min(128 * this.rowH - (rect.height - TOP), y));
  }

  // ---- Coordenadas (en px CSS) ----
  private pos(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private beatToX(b: number) {
    return KEYS_W + b * this.pxPerBeat - this.scrollX;
  }
  private xToBeat(x: number) {
    return (x - KEYS_W + this.scrollX) / this.pxPerBeat;
  }
  private midiToY(m: number) {
    return TOP + (127 - m) * this.rowH - this.scrollY;
  }
  private yToMidi(y: number) {
    return 127 - Math.floor((y - TOP + this.scrollY) / this.rowH);
  }
  private snapBeat(b: number) {
    return Math.round(b / this.snap) * this.snap;
  }

  private hit(p: { x: number; y: number }): Note | null {
    const v = this.activeVoice;
    if (!v) return null;
    const beat = this.xToBeat(p.x);
    const midi = this.yToMidi(p.y);
    const t = beat * this.spb;
    for (const n of v.notes) if (n.midi === midi && t >= n.start && t <= n.start + n.dur) return n;
    return null;
  }

  private remove(n: Note) {
    const v = this.activeVoice;
    if (!v) return;
    v.notes = v.notes.filter((x) => x !== n);
    this.onChange?.();
  }

  private down(e: PointerEvent) {
    if (!this.song) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    const base = { startX: p.x, startY: p.y, origStart: 0, origDur: 0, origMidi: 0, scrollX: this.scrollX, scrollY: this.scrollY, moved: false };
    if (p.y >= BAR_H && p.y < TOP && p.x >= KEYS_W) {
      // Fila de acordes.
      const t = this.chordTimeAt(p.x);
      this.onChordClick?.(t.time, t.index);
      return;
    }
    if (p.y < TOP) {
      this.drag = { ...base, kind: 'seek' };
      this.onSeek?.(Math.max(0, this.xToBeat(p.x)) * this.spb);
      return;
    }
    if (this.tool === 'pan' || e.button === 1 || p.x < KEYS_W) {
      if (p.x < KEYS_W && this.tool !== 'pan') {
        const v = this.activeVoice;
        if (v) this.onPreview?.(this.yToMidi(p.y), v);
      }
      this.drag = { ...base, kind: 'pan' };
      return;
    }
    const v = this.activeVoice;
    if (!v) return;
    const hitN = this.hit(p);
    if (this.tool === 'erase') {
      if (hitN) {
        this.onBeforeEdit?.();
        this.remove(hitN);
      }
      this.drag = null;
      return;
    }
    if (hitN) {
      this.onBeforeEdit?.();
      const xEnd = this.beatToX((hitN.start + hitN.dur) / this.spb);
      const kind = xEnd - p.x < 8 ? 'resize' : 'move';
      this.drag = { ...base, kind, note: hitN, origStart: hitN.start, origDur: hitN.dur, origMidi: hitN.midi };
      if (kind === 'move') this.onPreview?.(hitN.midi, v);
      return;
    }
    // Nota nueva.
    this.onBeforeEdit?.();
    const beat = Math.max(0, Math.floor(this.xToBeat(p.x) / this.snap) * this.snap);
    const midi = this.yToMidi(p.y);
    const n: Note = { midi, start: beat * this.spb, dur: this.noteLen * this.spb };
    v.notes = insertMonophonic(v.notes, n);
    this.onPreview?.(midi, v);
    this.drag = { ...base, kind: 'new', note: n, origStart: n.start, origDur: n.dur, origMidi: midi };
    this.onChange?.();
  }

  private move(e: PointerEvent) {
    const p = this.pos(e);
    if (!this.drag) {
      if (this.tool === 'draw') {
        const n = this.hit(p);
        this.hover = n;
        const nearEnd = n && this.beatToX((n.start + n.dur) / this.spb) - p.x < 8;
        this.canvas.style.cursor = nearEnd ? 'ew-resize' : n ? 'grab' : p.y < TOP ? 'pointer' : 'crosshair';
      } else {
        this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'not-allowed';
      }
      return;
    }
    const d = this.drag;
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const v = this.activeVoice;
    switch (d.kind) {
      case 'seek':
        this.onSeek?.(Math.max(0, this.xToBeat(p.x)) * this.spb);
        break;
      case 'pan':
        this.scrollX = Math.max(0, d.scrollX - dx);
        this.scrollY = this.clampY(d.scrollY - dy);
        break;
      case 'new':
      case 'resize': {
        const n = d.note!;
        const startBeat = n.start / this.spb;
        const endBeat = Math.max(startBeat + this.snap, this.snapBeat(this.xToBeat(p.x)));
        const newDur = (endBeat - startBeat) * this.spb;
        if (Math.abs(newDur - n.dur) > 1e-6) {
          n.dur = newDur;
          if (v) v.notes = insertMonophonic(v.notes, n);
          this.onChange?.();
        }
        break;
      }
      case 'move': {
        const n = d.note!;
        const db = this.snapBeat(dx / this.pxPerBeat);
        const dm = -Math.round(dy / this.rowH);
        const ns = Math.max(0, d.origStart + db * this.spb);
        const nm = Math.max(0, Math.min(127, d.origMidi + dm));
        if (Math.abs(ns - n.start) > 1e-6 || nm !== n.midi) {
          const pitchChanged = nm !== n.midi;
          n.start = ns;
          n.midi = nm;
          n.name = undefined;
          if (v) {
            if (pitchChanged) this.onPreview?.(nm, v);
          }
          this.onChange?.();
        }
        break;
      }
    }
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const v = this.activeVoice;
    if (d.kind === 'move' && d.note && v) {
      v.notes = insertMonophonic(v.notes, d.note);
      this.onChange?.();
    }
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* nada */
    }
  }

  /** Acorde bajo la posición x (o tiempo ajustado a la rejilla para uno nuevo). */
  private chordTimeAt(x: number): { time: number; index: number } {
    const chords = this.song?.chords ?? [];
    for (let i = 0; i < chords.length; i++) {
      const cx = this.beatToX(chords[i].time / this.spb);
      const nx = i + 1 < chords.length ? this.beatToX(chords[i + 1].time / this.spb) : Infinity;
      const label = Math.max(36, chords[i].name.length * 8 + 8);
      if (x >= cx - 2 && x <= Math.min(nx, cx + label)) return { time: chords[i].time, index: i };
    }
    const beat = Math.max(0, Math.floor(this.xToBeat(x) / Math.max(this.snap, 0.5)) * Math.max(this.snap, 0.5));
    return { time: beat * this.spb, index: -1 };
  }

  ensureVisible(t: number) {
    const x = this.beatToX(t / this.spb);
    const rect = this.canvas.getBoundingClientRect();
    if (x > rect.width - 40 || x < KEYS_W) this.scrollX = Math.max(0, (t / this.spb) * this.pxPerBeat - 80);
  }

  render() {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.dpr = dpr;
    this.w = rect.width;
    this.h = rect.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = this.w;
    const h = this.h;
    ctx.fillStyle = '#1a0820';
    ctx.fillRect(0, 0, w, h);
    const song = this.song;
    if (!song) return;
    const spb = this.spb;

    // Filas.
    const mTop = this.yToMidi(TOP);
    const mBot = this.yToMidi(h);
    for (let m = mBot; m <= mTop; m++) {
      const y = this.midiToY(m);
      ctx.fillStyle = BLACK.has(m % 12) ? '#200a28' : '#2a0f33';
      ctx.fillRect(KEYS_W, y, w - KEYS_W, this.rowH);
      if (m % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(KEYS_W, y + this.rowH - 1, w - KEYS_W, 1);
      }
    }

    // Rejilla vertical.
    const b0 = Math.floor(this.xToBeat(KEYS_W));
    const b1 = Math.ceil(this.xToBeat(w));
    const bpb = song.beatsPerBar || 4;
    for (let b = b0; b <= b1; b += this.snap < 1 ? this.snap : 1) {
      const x = Math.round(this.beatToX(b)) + 0.5;
      const isBar = Math.abs(b % bpb) < 1e-6;
      const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.28)' : isBeat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Marcas de acorde.
    ctx.font = '11px system-ui, sans-serif';
    for (const c of song.chords) {
      const x = this.beatToX(c.time / spb);
      if (x < KEYS_W - 20 || x > w) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, TOP, 1, h);
    }

    // Notas: primero las voces inactivas, luego la activa.
    const active = this.activeVoice;
    const order = song.voices.filter((v) => v !== active && !v.hidden);
    if (active) order.push(active);
    for (const v of order) {
      const isActive = v === active;
      for (const n of v.notes) {
        const x = this.beatToX(n.start / spb);
        const x2 = this.beatToX((n.start + n.dur) / spb);
        if (x2 < KEYS_W || x > w) continue;
        const y = this.midiToY(n.midi);
        if (y < TOP - this.rowH || y > h) continue;
        ctx.globalAlpha = isActive ? 1 : 0.28;
        ctx.fillStyle = v.color;
        roundRect(ctx, x + 0.5, y + 1, Math.max(3, x2 - x - 1), this.rowH - 2, 3);
        ctx.fill();
        if (isActive) {
          ctx.strokeStyle = n === this.hover ? '#fff' : 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
          if (x2 - x > 26 && this.rowH >= 12) {
            ctx.fillStyle = 'rgba(20,0,25,0.85)';
            ctx.font = '600 10px system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(prettyAccidentals(n.name ?? midiToName(n.midi, song.keyFifths)), x + 4, y + this.rowH / 2);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // Teclado.
    for (let m = mBot; m <= mTop; m++) {
      const y = this.midiToY(m);
      const black = BLACK.has(m % 12);
      ctx.fillStyle = black ? '#1b1b22' : '#e9e6ee';
      ctx.fillRect(0, y, KEYS_W, this.rowH);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + this.rowH - 1, KEYS_W, 1);
      if (m % 12 === 0) {
        ctx.fillStyle = '#444';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('C' + (m / 12 - 1), 4, y + this.rowH / 2);
      }
    }

    // Regla.
    ctx.fillStyle = '#12051a';
    ctx.fillRect(0, 0, w, TOP);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let b = Math.ceil(b0 / bpb) * bpb; b <= b1; b += bpb) {
      const x = this.beatToX(b);
      if (x < KEYS_W) continue;
      ctx.fillText(String(b / bpb + 1), x + 3, BAR_H / 2);
      ctx.fillRect(x, BAR_H - 6, 1, 6);
    }
    // Fila de acordes (editable).
    ctx.fillStyle = '#1c0a24';
    ctx.fillRect(KEYS_W, BAR_H, w - KEYS_W, CHORD_H);
    ctx.font = '600 12px system-ui, sans-serif';
    for (const c of song.chords) {
      const x = this.beatToX(c.time / spb);
      if (x < KEYS_W - 60 || x > w) continue;
      const tw = ctx.measureText(c.name).width + 10;
      ctx.fillStyle = song.chordsAuto ? 'rgba(233,64,214,0.25)' : 'rgba(233,64,214,0.45)';
      roundRect(ctx, x + 1, BAR_H + 3, tw, CHORD_H - 6, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(c.name, x + 6, BAR_H + CHORD_H / 2 + 0.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Acorde', 4, BAR_H + CHORD_H / 2);
    ctx.fillText('Compás', 4, BAR_H / 2);

    // Cabezal.
    const px = this.beatToX(this.playTime / spb);
    if (px >= KEYS_W) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(px, 0, 1.5, h);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
