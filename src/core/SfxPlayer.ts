import type { CtxSeconds } from "./types";

/**
 * Pool de reprodução de SFX (PLANO M2 + adendo A8).
 * Pré-aloca: buffers decodificados no boot + pool circular de GainNodes já
 * conectados ao destino. AudioBufferSourceNode é one-shot por design da API —
 * criar um por disparo custa µs e não aloca memória de áudio; o que NÃO pode
 * acontecer no loop é decodificar ou criar gains.
 */
export class SfxPlayer {
  private static readonly POOL_SIZE = 16;
  private readonly ctx: AudioContext;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly gains: GainNode[];
  private gainIdx = 0;

  readonly stats = { played: 0, unknownName: 0 };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gains = new Array(SfxPlayer.POOL_SIZE);
    for (let i = 0; i < SfxPlayer.POOL_SIZE; i++) {
      const g = ctx.createGain();
      g.connect(ctx.destination);
      this.gains[i] = g;
    }
  }

  /** Só no boot, nunca no loop. */
  register(name: string, buffer: AudioBuffer): void {
    this.buffers.set(name, buffer);
  }

  has(name: string): boolean {
    return this.buffers.has(name);
  }

  /** Agenda um disparo sample-accurate. `when` em tempo de contexto. */
  playAt(name: string, when: CtxSeconds, gain = 1): void {
    const buf = this.buffers.get(name);
    if (!buf) {
      // conteúdo (chart) nunca derruba o áudio: conta e segue
      this.stats.unknownName++;
      return;
    }
    const g = this.gains[this.gainIdx]!;
    this.gainIdx = (this.gainIdx + 1) % SfxPlayer.POOL_SIZE;
    g.gain.value = gain;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g as unknown as AudioNode);
    src.start(when);
    this.stats.played++;
  }

  /** Disparo imediato (feedback de input, calibração). */
  playNow(name: string, gain = 1): void {
    this.playAt(name, this.ctx.currentTime, gain);
  }

  /**
   * Pré-aquece o pipeline de áudio (A8, taiko-web): primeiro disparo real
   * não paga o custo de inicialização do subsistema. Toca o primeiro buffer
   * registrado com gain 0.
   */
  warmup(): void {
    const first = this.buffers.keys().next();
    if (!first.done) this.playAt(first.value, this.ctx.currentTime, 0);
  }
}
