import type { Note, Song, Voice } from '../model';
import { noteLabel } from '../music';

interface Particle {
  t: number; // tiempo de canción en el que nació (ancla horizontal)
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

export interface VizOptions {
  zoom: number; // multiplica los píxeles por segundo
  showTitle: boolean;
  showChord: boolean;
  showNames: boolean;
  watermark: string;
}

const smoother = (s: number) => {
  s = Math.max(0, Math.min(1, s));
  return s * s * s * (s * (s * 6 - 15) + 10);
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex: string, k: number) {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number) => Math.round(c + (255 - c) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/**
 * Dibuja las voces como líneas de neón que se desplazan hacia la izquierda,
 * con transiciones suaves entre notas, el cabezal fijo y chispas en cada ataque.
 */
export class Visualizer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private lastTime = -1;
  private lastFrame = performance.now();
  private flash = new Map<string, number>();
  song: Song | null = null;
  opts: VizOptions = { zoom: 1, showTitle: true, showChord: true, showNames: true, watermark: '' };
  /** Si se fija, el lienzo no se adapta a la ventana (para grabar en 1080x1920). */
  fixedSize: { w: number; h: number } | null = null;
  private range = { min: 48, max: 72 };

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setSong(song: Song | null) {
    this.song = song;
    this.particles = [];
    this.lastTime = -1;
    this.updateRange();
  }

  updateRange() {
    if (!this.song) return;
    let min = Infinity;
    let max = -Infinity;
    for (const v of this.song.voices) {
      if (v.hidden) continue;
      for (const n of v.notes) {
        min = Math.min(min, n.midi);
        max = Math.max(max, n.midi);
      }
    }
    if (!isFinite(min)) {
      min = 48;
      max = 72;
    }
    if (max - min < 12) {
      const c = (max + min) / 2;
      min = c - 6;
      max = c + 6;
    }
    this.range = { min, max };
  }

  private resize(): { w: number; h: number; dpr: number } {
    if (this.fixedSize) {
      const { w, h } = this.fixedSize;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      // En 1080 px de ancho, escala la interfaz como un móvil de ~400 px.
      return { w, h, dpr: w / 420 };
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h, dpr };
  }

  render(time: number, playing: boolean) {
    const { w, h, dpr } = this.resize();
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    // Si se ha saltado en el tiempo, se limpian las chispas.
    if (Math.abs(time - this.lastTime) > 0.5) this.particles = [];

    const u = dpr; // unidad de interfaz
    const short = Math.min(w / u, h / u);
    const pps = short * 0.32 * this.opts.zoom * u; // píxeles por segundo
    const headX = Math.round(w * 0.34);
    const yTop = h * 0.3;
    const yBot = h * 0.8;
    const { min, max } = this.range;
    const Y = (m: number) => yBot - ((m - min) / (max - min)) * (yBot - yTop);
    const X = (t: number) => headX + (t - time) * pps;
    const t0 = time - headX / pps - 0.5;
    const t1 = time + (w - headX) / pps + 0.5;

    this.drawBackground(w, h, headX);

    const song = this.song;
    if (!song) {
      this.lastTime = time;
      return;
    }

    // Marcas de acorde.
    const lineTop = yTop - 58 * u;
    const lineBot = h * 0.93;
    ctx.font = `${11 * u}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const c of song.chords) {
      if (c.time < t0 || c.time > t1) continue;
      const x = Math.round(X(c.time)) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, lineTop);
      ctx.lineTo(x, lineBot);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(c.name, x + 4 * u, lineTop - 6 * u);
    }

    // Líneas de cada voz.
    const visible = song.voices.filter((v) => !v.hidden && v.notes.length);
    const anySolo = song.voices.some((v) => v.solo);
    for (const v of visible) {
      const dim = v.muted || (anySolo && !v.solo);
      this.drawVoice(v, X, Y, t0, t1, u, dim);
    }

    // Cabezal.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, u);
    ctx.beginPath();
    ctx.moveTo(headX + 0.5, lineTop - 10 * u);
    ctx.lineTo(headX + 0.5, lineBot + 10 * u);
    ctx.stroke();

    // Puntos y nombres en el cabezal + chispas en los ataques.
    const labels: { y: number; text: string; color: string; dim: boolean }[] = [];
    for (const v of visible) {
      const dim = v.muted || (anySolo && !v.solo);
      const st = this.stateAt(v.notes, time, Y);
      if (!st) continue;
      // Ataques que acaban de cruzar el cabezal.
      if (playing && this.lastTime >= 0 && time > this.lastTime) {
        for (const n of st.near) {
          if (n.start > this.lastTime && n.start <= time) {
            this.burst(v, n.start, Y(n.midi), dim ? 6 : 18);
            this.flash.set(v.id, 1);
          }
        }
      }
      if (st.sounding && playing && !dim && Math.random() < 0.55) this.burst(v, time, st.y, 1);

      const fl = this.flash.get(v.id) ?? 0;
      this.flash.set(v.id, Math.max(0, fl - dt * 4));
      if (st.sounding || st.gliding) {
        const r = (4.5 + fl * 4) * u;
        ctx.save();
        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.shadowColor = v.color;
        ctx.shadowBlur = 16 * u;
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.arc(headX, st.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(headX, st.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (st.sounding && st.note) labels.push({ y: st.y, text: noteLabel(st.note, song.keyFifths), color: v.color, dim });
      }
    }

    this.updateParticles(dt, X, u);

    if (this.opts.showNames) this.drawLabels(labels, headX + 12 * u, u);

    // Cabecera: acorde actual y título.
    let current = '';
    for (const c of song.chords) if (c.time <= time + 0.02) current = c.name;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (this.opts.showChord && current) {
      const size = Math.min(78 * u, w * 0.17);
      ctx.font = `600 ${size}px system-ui, "Segoe UI", sans-serif`;
      ctx.fillStyle = 'rgba(240,236,245,0.94)';
      ctx.shadowColor = 'rgba(255,255,255,0.25)';
      ctx.shadowBlur = 20 * u;
      ctx.fillText(current, w / 2, yTop - 110 * u);
      ctx.shadowBlur = 0;
    }
    const caption = this.opts.watermark || (this.opts.showTitle ? song.title : '');
    if (caption) {
      ctx.font = `${16 * u}px system-ui, "Segoe UI", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(caption, w / 2, yTop - 78 * u);
    }

    this.lastTime = time;
  }

  private drawBackground(w: number, h: number, headX: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a0a49');
    g.addColorStop(0.55, '#2a0734');
    g.addColorStop(1, '#16031a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rg = ctx.createRadialGradient(w / 2, h * 0.18, 0, w / 2, h * 0.18, Math.max(w, h) * 0.6);
    rg.addColorStop(0, 'rgba(150,40,170,0.35)');
    rg.addColorStop(1, 'rgba(150,40,170,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    // Franja tenue alrededor del cabezal.
    const sg = ctx.createLinearGradient(headX - w * 0.25, 0, headX + w * 0.25, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.035)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  }

  /** Construye la polilínea de una voz entre t0 y t1. Devuelve tramos activos y "fantasma" (silencios). */
  private drawVoice(
    v: Voice,
    X: (t: number) => number,
    Y: (m: number) => number,
    t0: number,
    t1: number,
    u: number,
    dim: boolean,
  ) {
    const notes = v.notes;
    if (!notes.length) return;
    // Primer índice visible (búsqueda binaria).
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].start + notes[mid].dur < t0) lo = mid + 1;
      else hi = mid;
    }
    const first = Math.max(0, lo - 1);

    const active: [number, number][][] = [];
    const ghost: [number, number][][] = [];
    let cur: [number, number][] | null = null;

    for (let i = first; i < notes.length; i++) {
      const n = notes[i];
      if (n.start > t1) break;
      const y = Y(n.midi);
      const next = notes[i + 1];
      const end = n.start + n.dur;
      if (!cur) {
        cur = [[X(n.start), y]];
        active.push(cur);
      }
      if (!next) {
        cur.push([X(end), y]);
        cur = null;
        break;
      }
      const gap = next.start - end;
      const ny = Y(next.midi);
      const g = glideTime(n, next);
      if (gap < 0.06) {
        // Legato: mantiene y luego curva suave hasta la siguiente.
        const gs = next.start - g;
        cur.push([X(Math.max(n.start, gs)), y]);
        if (ny !== y) pushCurve(cur, X(Math.max(n.start, gs)), X(next.start), y, ny);
        else cur.push([X(next.start), ny]);
      } else {
        // Silencio: termina la línea activa y une con una línea tenue.
        cur.push([X(end), y]);
        cur = null;
        const gh: [number, number][] = [[X(end), y]];
        const gs = Math.max(end, next.start - g);
        gh.push([X(gs), y]);
        if (ny !== y) pushCurve(gh, X(gs), X(next.start), y, ny);
        else gh.push([X(next.start), ny]);
        ghost.push(gh);
      }
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const alpha = dim ? 0.3 : 1;
    // Tramos fantasma.
    ctx.globalAlpha = alpha * 0.22;
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([3 * u, 5 * u]);
    for (const p of ghost) strokePath(ctx, p);
    ctx.setLineDash([]);
    // Resplandor.
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 14 * u;
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 3.2 * u;
    for (const p of active) strokePath(ctx, p);
    ctx.shadowBlur = 0;
    // Núcleo brillante.
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = lighten(v.color, 0.45);
    ctx.lineWidth = 1.3 * u;
    for (const p of active) strokePath(ctx, p);
    ctx.restore();
  }

  /** Estado de una voz en el instante t: altura (interpolada en las transiciones) y nota sonando. */
  private stateAt(notes: Note[], t: number, Y: (m: number) => number) {
    if (!notes.length) return null;
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].start <= t) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1; // última nota que ya ha empezado
    const near = notes.slice(Math.max(0, i - 3), i + 2);
    const n = notes[i];
    const next = notes[i + 1];
    if (!n) {
      return next && next.start - t < glideTime(next, next) ? { y: Y(next.midi), sounding: false, gliding: false, note: null, near } : { y: 0, sounding: false, gliding: false, note: null, near };
    }
    const end = n.start + n.dur;
    const sounding = t < end;
    let y = Y(n.midi);
    let gliding = false;
    if (next) {
      const g = glideTime(n, next);
      const gs = next.start - g;
      if (t > gs && next.start - end < 0.06) {
        y = Y(n.midi) + (Y(next.midi) - Y(n.midi)) * smoother((t - gs) / g);
        gliding = true;
      }
    }
    return { y, sounding, gliding, note: n, near };
  }

  private burst(v: Voice, t: number, y: number, count: number) {
    for (let k = 0; k < count; k++) {
      const max = 0.4 + Math.random() * 0.9;
      this.particles.push({
        t,
        y,
        dx: 0,
        dy: 0,
        vx: -10 - Math.random() * 45,
        vy: (Math.random() - 0.25) * 70,
        life: max,
        max,
        color: Math.random() < 0.3 ? '#ffffff' : v.color,
      });
    }
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
  }

  private updateParticles(dt: number, X: (t: number) => number, u: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += 40 * dt;
      p.dx += p.vx * dt;
      p.dy += p.vy * dt;
      const x = X(p.t) + p.dx * u;
      const y = p.y + p.dy * u;
      const a = p.life / p.max;
      ctx.strokeStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', a * 0.85);
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * 0.05 * u, y - p.vy * 0.05 * u);
      ctx.stroke();
      alive.push(p);
    }
    this.particles = alive;
    ctx.restore();
  }

  private drawLabels(labels: { y: number; text: string; color: string; dim: boolean }[], x: number, u: number) {
    const ctx = this.ctx;
    const minGap = 17 * u;
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].y - labels[i - 1].y < minGap) labels[i].y = labels[i - 1].y + minGap;
    }
    ctx.font = `700 ${14 * u}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of labels) {
      ctx.globalAlpha = l.dim ? 0.4 : 1;
      ctx.strokeStyle = 'rgba(20,0,25,0.9)';
      ctx.lineWidth = 3.5 * u;
      ctx.strokeText(l.text, x, l.y - 2 * u);
      ctx.fillStyle = lighten(l.color, 0.15);
      ctx.fillText(l.text, x, l.y - 2 * u);
    }
    ctx.globalAlpha = 1;
  }
}

function glideTime(n: Note, next: Note): number {
  return Math.max(0.05, Math.min(0.32, n.dur * 0.45, next.dur * 0.9));
}

function pushCurve(pts: [number, number][], x0: number, x1: number, y0: number, y1: number) {
  const steps = Math.max(6, Math.min(28, Math.ceil(Math.abs(x1 - x0) / 3)));
  for (let k = 1; k <= steps; k++) {
    const s = k / steps;
    pts.push([x0 + (x1 - x0) * s, y0 + (y1 - y0) * smoother(s)]);
  }
}

function strokePath(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
