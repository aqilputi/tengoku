/**
 * Mock determinístico do AudioContext para testes de timing.
 * - `currentTime` só avança via advance()/advanceGranular(), nunca sozinho.
 * - suspend() congela; resume() retoma.
 * - Sources/gains registram chamadas para asserções (agendamento exato).
 */
export interface StartedSource {
  when: number;
  /** ctx.currentTime no instante do agendamento (para assertar when > now). */
  scheduledAtCtxTime: number;
  buffer: unknown;
}

export class MockGainNode {
  gain = { value: 1, setValueAtTime: (_v: number, _t: number) => {} };
  connected: unknown[] = [];
  connect(dest: unknown) { this.connected.push(dest); return dest; }
  disconnect() {}
}

export class MockBufferSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  private ctx: MockAudioContext;
  constructor(ctx: MockAudioContext) { this.ctx = ctx; }
  connect(dest: unknown) { return dest; }
  start(when = 0) {
    this.ctx.startedSources.push({ when, scheduledAtCtxTime: this.ctx.currentTime, buffer: this.buffer });
  }
  stop() {}
}

export class MockAudioContext {
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  baseLatency = 0.005;
  /** Configurável; use `delete (ctx as any).outputLatency`-like via withoutOutputLatency(). */
  outputLatency: number | undefined = 0.02;
  destination = { __dest: true };
  sampleRate = 44100;

  startedSources: StartedSource[] = [];
  createdGains: MockGainNode[] = [];

  /** Avança o relógio de áudio (só quando running, como o real). */
  advance(s: number) { if (this.state === "running") this.currentTime += s; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }

  createBufferSource() { return new MockBufferSource(this); }
  createGain() { const g = new MockGainNode(); this.createdGains.push(g); return g; }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return { channels, length, sampleRate, duration: length / sampleRate };
  }
}

/** Relógio de parede injetável (substitui performance.now nos testes). */
export class MockWallClock {
  ms = 0;
  now = () => this.ms;
  advance(ms: number) { this.ms += ms; }
}
