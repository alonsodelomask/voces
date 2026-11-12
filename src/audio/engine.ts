import type { Song, Voice } from '../model';
import { midiToFreq } from '../music';

export type Preset = 'synth' | 'coro' | 'organo' | 'suave';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'synth', label: 'Sintetizador' },
  { id: 'coro', label: 'Coro (aah)' },
  { id: 'organo', label: 'Órgano' },
  { id: 'suave', label: 'Suave (seno)' },
];

interface Playing {
  end: number;
  stop: (at: number) => void;
}

/**
 * Motor de audio con Web Audio API: sintetiza cada nota y la programa con antelación
 * para que el tiempo sea preciso. Expone el tiempo de la canción para sincronizar el visualizador.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private voiceGains = new Map<string, GainNode>();
  private nextIdx = new Map<string, number>();
  private active: Playing[] = [];
  private timer: number | null = null;

  song: Song | null = null;
  playing = false;
  rate = 1;
  preset: Preset = 'synth';
  loop = false;
  private startCtx = 0;
  private startSong = 0;
  private pausedAt = 0;
  onEnded: (() => void) | null = null;
  /** No detener al llegar al final (para grabar más allá de la última nota). */
  holdOpen = false;

  /** Contexto de audio compartido (crea uno si hace falta). */
  context(): AudioContext {
    return this.ensure();
  }

  /** Convierte un instante del reloj de audio en tiempo de canción. */
  ctxToSong(ctxTime: number): number {
    return this.startSong + (ctxTime - this.startCtx) * this.rate;
  }
  songToCtx(songTime: number): number {
    return this.startCtx + (songTime - this.startSong) / this.rate;
  }

  /** Silencia/reactiva la mezcla general (el metrónomo no pasa por aquí). */
  setMasterMuted(m: boolean) {
    const ctx = this.ensure();
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.01);
  }

  /** Clic de metrónomo directamente a la salida. */
  click(when: number, accent = false) {
    const ctx = this.ensure();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(when);
    o.stop(when + 0.08);
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(ctx, 2.4);
    this.dry.connect(comp);
    this.dry.connect(conv);
    conv.connect(this.wet);
    this.wet.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);
    return ctx;
  }

  private makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  /** Flujo de audio para grabar vídeo. */
  getRecordStream(): MediaStream {
    const ctx = this.ensure();
    if (!this.recDest) {
      this.recDest = ctx.createMediaStreamDestination();
      this.master.connect(this.recDest);
    }
    return this.recDest.stream;
  }

  setSong(song: Song) {
    this.stopAll();
    this.song = song;
    this.pausedAt = 0;
    this.playing = false;
    this.voiceGains.clear();
  }

  get duration(): number {
    if (!this.song) return 0;
    let end = 0;
    for (const v of this.song.voices) for (const n of v.notes) end = Math.max(end, n.start + n.dur);
    return end;
  }

  /** Tiempo actual de la canción en segundos (compensando la latencia de salida). */
  get time(): number {
    if (!this.playing || !this.ctx) return this.pausedAt;
    const lat = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.max(0, this.startSong + (this.ctx.currentTime - lat - this.startCtx) * this.rate);
  }

  private gainFor(v: Voice): GainNode {
    const ctx = this.ensure();
    let g = this.voiceGains.get(v.id);
    if (!g) {
      g = ctx.createGain();
      g.connect(this.dry);
      this.voiceGains.set(v.id, g);
    }
    return g;
  }

  /** Aplica volumen, silencio y solo de cada voz. */
  updateMix() {
    if (!this.song || !this.ctx) return;
    const anySolo = this.song.voices.some((v) => v.solo);
    for (const v of this.song.voices) {
      const g = this.gainFor(v);
      const audible = !v.muted && (!anySolo || v.solo);
      g.gain.setTargetAtTime(audible ? v.volume : 0, this.ctx.currentTime, 0.02);
    }
  }

  async play(from?: number, delay = 0.06) {
    if (!this.song) return;
    const ctx = this.ensure();
    if (ctx.state !== 'running') await ctx.resume();
    this.stopAll();
    const start = from ?? this.pausedAt;
    this.startSong = !this.holdOpen && start >= this.duration - 0.01 ? 0 : start;
    this.startCtx = ctx.currentTime + delay;
    this.playing = true;
    this.updateMix();
    for (const v of this.song.voices) {
      // Primera nota que todavía no ha terminado.
      let i = 0;
      while (i < v.notes.length && v.notes[i].start + v.notes[i].dur <= this.startSong) i++;
      this.nextIdx.set(v.id, i);
    }
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.time;
    this.playing = false;
    this.stopAll();
  }

  seek(t: number) {
    const was = this.playing;
    this.stopAll();
    this.playing = false;
    this.pausedAt = Math.max(0, this.holdOpen ? t : Math.min(t, this.duration));
    if (was) this.play(this.pausedAt);
  }

  setRate(r: number) {
    const t = this.time;
    this.rate = r;
    if (this.playing) this.play(t);
    else this.pausedAt = t;
  }

  private stopAll() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx?.currentTime ?? 0;
    for (const p of this.active) p.stop(now);
    this.active = [];
  }

  private schedule() {
    if (!this.song || !this.ctx || !this.playing) return;
    const ctx = this.ctx;
    const horizon = ctx.currentTime + 0.3;
    const toCtx = (songT: number) => this.startCtx + (songT - this.startSong) / this.rate;
    for (const v of this.song.voices) {
      let i = this.nextIdx.get(v.id) ?? 0;
      while (i < v.notes.length) {
        const n = v.notes[i];
        let when = toCtx(n.start);
        if (when > horizon) break;
        let dur = n.dur / this.rate;
        if (when < this.startCtx) {
          // Nota que ya estaba sonando al empezar: suena el resto.
          dur -= this.startCtx - when;
          when = this.startCtx;
        }
        if (dur > 0.01) this.voiceNote(v, n.midi, when, dur);
        i++;
      }
      this.nextIdx.set(v.id, i);
    }
    this.active = this.active.filter((p) => p.end > ctx.currentTime);
    if (!this.holdOpen && this.time >= this.duration + 0.4) {
      if (this.loop) {
        this.play(0);
      } else {
        this.pausedAt = this.duration;
        this.playing = false;
        this.stopAll();
        this.onEnded?.();
      }
    }
  }

  /** Toca una nota suelta (al editar). */
  preview(midi: number, voice?: Voice, dur = 0.35) {
    const ctx = this.ensure();
    if (ctx.state !== 'running') ctx.resume();
    const out = voice ? this.gainFor(voice) : this.dry;
    if (voice) this.voiceGains.get(voice.id)!.gain.value = Math.max(0.4, voice.volume);
    this.synth(out, midi, ctx.currentTime + 0.01, dur);
  }

  private voiceNote(v: Voice, midi: number, when: number, dur: number) {
    this.synth(this.gainFor(v), midi, when, dur);
  }

  private synth(out: AudioNode, midi: number, when: number, dur: number) {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.connect(env);
    env.connect(out);
    const oscs: OscillatorNode[] = [];
    const add = (type: OscillatorType, mult: number, detune: number, gain: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(filter);
      oscs.push(o);
      return o;
    };

    let attack = 0.02;
    let release = 0.18;
    let peak = 0.16;
    let sustain = 0.75;
    switch (this.preset) {
      case 'synth':
        add('sawtooth', 1, -6, 0.5);
        add('sawtooth', 1, 6, 0.5);
        add('square', 0.5, 0, 0.18);
        filter.frequency.setValueAtTime(Math.min(9000, f * 6), when);
        filter.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 3.2), when + 0.25);
        attack = 0.015;
        peak = 0.13;
        break;
      case 'coro': {
        // "aah": dientes de sierra filtrados con vibrato lento.
        add('sawtooth', 1, -4, 0.45);
        add('sawtooth', 1, 5, 0.45);
        add('triangle', 2, 0, 0.12);
        filter.type = 'bandpass';
        filter.frequency.value = 900;
        filter.Q.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, when);
        depth.gain.linearRampToValueAtTime(14, when + Math.min(0.5, dur));
        lfo.connect(depth);
        for (const o of oscs) depth.connect(o.detune);
        oscs.push(lfo);
        attack = 0.08;
        release = 0.3;
        peak = 0.3;
        sustain = 0.85;
        break;
      }
      case 'organo':
        add('sine', 1, 0, 0.6);
        add('sine', 2, 0, 0.3);
        add('sine', 3, 0, 0.12);
        add('sine', 0.5, 0, 0.25);
        filter.frequency.value = 8000;
        attack = 0.01;
        release = 0.08;
        peak = 0.22;
        sustain = 1;
        break;
      case 'suave':
        add('sine', 1, 0, 0.8);
        add('triangle', 1, 3, 0.25);
        filter.frequency.value = 5000;
        attack = 0.03;
        release = 0.25;
        peak = 0.3;
        break;
    }
    // Las notas graves suenan algo más fuertes para equilibrar.
    peak *= midi < 52 ? 1.25 : 1;

    const g = env.gain;
    const a = Math.min(attack, dur * 0.5);
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(peak, when + a);
    g.setTargetAtTime(peak * sustain, when + a, 0.12);
    const off = when + dur;
    g.setValueAtTime(peak * sustain, off);
    g.setTargetAtTime(0, off, release / 3);
    const end = off + release * 1.5;
    for (const o of oscs) {
      o.start(when);
      o.stop(end);
    }
    this.active.push({
      end,
      stop: (at: number) => {
        try {
          g.cancelScheduledValues(at);
          g.setTargetAtTime(0, at, 0.015);
          for (const o of oscs) o.stop(at + 0.08);
        } catch {
          /* ya parado */
        }
      },
    });
  }
}
