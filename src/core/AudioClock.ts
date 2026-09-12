import type { Beats, CtxSeconds, SongSeconds } from "./types";
import type { TempoMap } from "./TempoMap";

/**
 * Dona do tempo (SPEC §2.1 + adendo A2/A3 do PLANO).
 *
 * Três relógios, um único tradutor:
 * - relógio de áudio (ctx.currentTime): dono do AGENDAMENTO. Nunca sai daqui.
 * - relógio de parede (performance.now): dono dos timestamps de INPUT.
 * - clock híbrido (Bemuse): para LEITURA por frame/julgamento — performance.now
 *   ancorado numa média móvel de (perf/1000 - ctx.currentTime), porque
 *   ctx.currentTime anda em degraus em alguns dispositivos (Android).
 *
 * Convenções de conversão (testadas em AudioClock.test.ts):
 * - songTime  = hybridCtx - audioAnchor - outputLatency - audioOffset
 *   (o que o jogador OUVE agora foi agendado outputLatency atrás; audioOffset
 *   é o resíduo calibrado do jogador)
 * - agendamento: songTimeToCtxTime(t) = audioAnchor + t — alinhado ao arquivo,
 *   SEM offsets (offsets são de percepção/julgamento, não de agendamento)
 * - input: perfTimeToSongTime aplica exatamente os mesmos descontos do songTime,
 *   então input e cue vivem na mesma linha do tempo.
 */
export class AudioClock {
  private readonly ctx: AudioContext;
  private readonly tempoMap: TempoMap;
  private readonly now: () => number;

  private audioAnchor: CtxSeconds = 0;
  private perfAnchor = 0;
  private perfAnchorCtxTime: CtxSeconds = 0;
  private started = false;

  private audioOffset = 0;
  private visualOffset = 0;

  /** Ring buffer do clock híbrido: delta = perf/1000 - ctx.currentTime. Pré-alocado (NFR: zero alloc). */
  private static readonly RING = 60;
  private readonly deltas = new Float64Array(AudioClock.RING);
  private deltaCount = 0;
  private deltaIdx = 0;
  private deltaSum = 0;
  private lastSampledPerf = -1;

  private frozenSongTime: SongSeconds = 0;
  private frozenVisualTime: SongSeconds = 0;
  private pausedByUs = false;

  constructor(ctx: AudioContext, tempoMap: TempoMap, now: () => number = () => performance.now()) {
    this.ctx = ctx;
    this.tempoMap = tempoMap;
    this.now = now;
  }

  /**
   * Fixa as âncoras e (se houver música) agenda o buffer em currentTime + leadIn.
   * Pré-condição: ctx.state === "running" (resume() já aconteceu num gesto do usuário).
   */
  start(music: AudioBuffer | null, leadIn = 0.15): void {
    if (this.ctx.state !== "running") {
      throw new Error("AudioClock.start: AudioContext precisa estar running (autoplay policy)");
    }
    const startAt = this.ctx.currentTime + leadIn;
    if (music) {
      const src = this.ctx.createBufferSource();
      src.buffer = music;
      src.connect(this.ctx.destination);
      src.start(startAt);
    }
    this.audioAnchor = startAt;
    this.perfAnchor = this.now();
    this.perfAnchorCtxTime = this.ctx.currentTime;
    this.resetRing();
    this.started = true;
  }

  get isRunning(): boolean {
    return this.started && this.ctx.state === "running";
  }

  /** outputLatency -> baseLatency -> 0. Lido a cada acesso: muda ao trocar de dispositivo. */
  get outputLatencyS(): number {
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency;
    if (typeof out === "number" && Number.isFinite(out)) return out; // disponível (mesmo 0) => usa
    if (typeof this.ctx.baseLatency === "number" && this.ctx.baseLatency > 0) return this.ctx.baseLatency;
    return 0;
  }

  setUserOffsets(audioOffsetS: number, visualOffsetS: number): void {
    this.audioOffset = audioOffsetS;
    this.visualOffset = visualOffsetS;
  }

  private resetRing(): void {
    this.deltaCount = 0;
    this.deltaIdx = 0;
    this.deltaSum = 0;
    this.lastSampledPerf = -1;
  }

  /** Amostra o par (perf, ctx) no máximo 1x por instante de parede. */
  private sample(): void {
    if (!this.isRunning) return;
    const p = this.now();
    if (p === this.lastSampledPerf) return;
    this.lastSampledPerf = p;
    const d = p / 1000 - this.ctx.currentTime;
    if (this.deltaCount < AudioClock.RING) {
      this.deltas[this.deltaIdx] = d;
      this.deltaSum += d;
      this.deltaCount++;
    } else {
      this.deltaSum += d - this.deltas[this.deltaIdx]!;
      this.deltas[this.deltaIdx] = d;
    }
    this.deltaIdx = (this.deltaIdx + 1) % AudioClock.RING;
  }

  /** Estimativa suave de ctx.currentTime a partir da parede. */
  private hybridCtxTime(): CtxSeconds {
    this.sample();
    if (this.deltaCount === 0) return this.ctx.currentTime;
    return this.now() / 1000 - this.deltaSum / this.deltaCount;
  }

  get songTime(): SongSeconds {
    if (!this.isRunning) return this.frozenSongTime;
    const t = this.hybridCtxTime() - this.audioAnchor - this.outputLatencyS - this.audioOffset;
    this.frozenSongTime = t;
    return t;
  }

  get visualTime(): SongSeconds {
    if (!this.isRunning) return this.frozenVisualTime;
    const t = this.hybridCtxTime() - this.audioAnchor - this.outputLatencyS - this.visualOffset;
    this.frozenVisualTime = t;
    return t;
  }

  get songBeat(): Beats {
    return this.tempoMap.timeToBeat(this.songTime);
  }

  get visualBeat(): Beats {
    return this.tempoMap.timeToBeat(this.visualTime);
  }

  /** Para o Scheduler: `when` do source.start(). Alinhado ao arquivo, sem offsets. */
  songTimeToCtxTime(t: SongSeconds): CtxSeconds {
    return this.audioAnchor + t;
  }

  /** ctx.currentTime cru — só para decisões de agendamento (Scheduler). */
  get ctxTime(): CtxSeconds {
    return this.ctx.currentTime;
  }

  /** Para o InputManager: e.timeStamp (ms, base performance.now) -> songTime. */
  perfTimeToSongTime(perfMs: number): SongSeconds {
    const avgDelta = this.deltaCount > 0 ? this.deltaSum / this.deltaCount : this.now() / 1000 - this.ctx.currentTime;
    const ctxEstimate = perfMs / 1000 - avgDelta;
    return ctxEstimate - this.audioAnchor - this.outputLatencyS - this.audioOffset;
  }

  /** Pause do JOGO = ctx.suspend(): sources agendados congelam e retomam alinhados (PLANO §3.1). */
  async pause(): Promise<void> {
    // captura os valores congelados antes de suspender
    void this.songTime;
    void this.visualTime;
    this.pausedByUs = true;
    await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    await this.ctx.resume();
    if (this.pausedByUs) {
      // re-ancora SÓ o par perf<->ctx (a parede andou durante o suspend; a âncora de áudio não muda)
      this.perfAnchor = this.now();
      this.perfAnchorCtxTime = this.ctx.currentTime;
      this.resetRing();
      this.pausedByUs = false;
    }
  }

  /** Drift parede vs. áudio desde a última âncora perf<->ctx (HUD/diagnóstico, aceite M1). */
  get driftMs(): number {
    return (this.now() - this.perfAnchor) - (this.ctx.currentTime - this.perfAnchorCtxTime) * 1000;
  }
}
