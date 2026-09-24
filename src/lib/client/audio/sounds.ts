type ToneShape = { freq: number; start: number; duration: number; gain: number; type?: OscillatorType };

interface AudioSessionLike {
  type?: string;
}

/**
 * Short earcons made with the Web Audio API (PROMPT.md 6.7): shutter, tick, error, page found.
 * Each is under 300 ms. The audio context is created and resumed inside the Start tap, which
 * iOS requires before any sound can play.
 */
export class Sounds {
  private ctx: AudioContext | null = null;

  constructor(private readonly enabled: () => boolean) {}

  /** Call from a tap handler. */
  unlock(): void {
    try {
      // iOS 17+: play through the ring/silent switch like a media app.
      const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
      if (session) session.type = "playback";
    } catch {
      // ignore
    }
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx ??= new Ctor();
      void this.ctx.resume();
      // A one-sample silent buffer finishes the unlock on older iOS versions.
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch {
      this.ctx = null;
    }
  }

  shutter(): void {
    this.noise(0.08, 0.35);
    this.tones([{ freq: 1800, start: 0, duration: 0.03, gain: 0.25, type: "square" }]);
  }

  tick(): void {
    this.tones([{ freq: 880, start: 0, duration: 0.04, gain: 0.12 }]);
  }

  error(): void {
    this.tones([
      { freq: 440, start: 0, duration: 0.12, gain: 0.25, type: "triangle" },
      { freq: 311, start: 0.13, duration: 0.14, gain: 0.25, type: "triangle" },
    ]);
  }

  pageFound(): void {
    this.tones([
      { freq: 660, start: 0, duration: 0.08, gain: 0.2 },
      { freq: 990, start: 0.09, duration: 0.1, gain: 0.2 },
    ]);
  }

  private context(): AudioContext | null {
    if (!this.enabled() || !this.ctx) return null;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tones(shapes: ToneShape[]): void {
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const shape of shapes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = shape.type ?? "sine";
      osc.frequency.value = shape.freq;
      const t0 = now + shape.start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(shape.gain, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + shape.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + shape.duration + 0.02);
    }
  }

  private noise(duration: number, level: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }
}
