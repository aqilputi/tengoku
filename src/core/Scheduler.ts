import type { ChartEvent, SongSeconds } from "./types";
import type { AudioClock } from "./AudioClock";
import type { SfxPlayer } from "./SfxPlayer";
import type { TempoMap } from "./TempoMap";
import type { Ticker } from "./Ticker";

export interface SchedulerOptions {
  intervalMs: number; // default 25 (Chris Wilson)
  lookaheadS: number; // default 0.1 (adendo A2; era 0.2 na spec)
}

interface RuntimeEvent {
  event: ChartEvent;
  time: SongSeconds; // pré-computado na carga — zero conversão no loop
  sfxName: string | null;
}

/**
 * Loop de lookahead (SPEC §1 + adendo A1/A2):
 * - tick vem de um Ticker (Web Worker em produção) — nunca setTimeout p/ som
 * - cursor monotônico sobre lista ordenada: O(1) amortizado, zero alocação,
 *   evento nunca é re-agendado
 * - evento cujo `when` já passou é DROPADO (contado em stats), nunca tocado
 *   atrasado; SFX dependentes de input NÃO passam por aqui (SfxPlayer.playNow)
 */
export class Scheduler {
  private readonly clock: AudioClock;
  private readonly sfx: SfxPlayer;
  private readonly ticker: Ticker;
  private readonly opts: SchedulerOptions;

  private events: RuntimeEvent[] = [];
  private cursor = 0;
  private running = false;
  private visualCb: ((ev: ChartEvent) => void) | null = null;

  readonly stats = { scheduled: 0, dropped: 0, lateTicks: 0 };
  private lastTickAt = -1;

  constructor(clock: AudioClock, sfx: SfxPlayer, ticker: Ticker, opts?: Partial<SchedulerOptions>) {
    this.clock = clock;
    this.sfx = sfx;
    this.ticker = ticker;
    this.opts = { intervalMs: 25, lookaheadS: 0.1, ...opts };
  }

  /** Recebe eventos ordenados por beat; pré-computa o time de cada um. */
  load(events: ChartEvent[], tempoMap: TempoMap): void {
    const rt = new Array<RuntimeEvent>(events.length);
    let prevBeat = -Infinity;
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.beat < prevBeat) throw new Error("Scheduler.load: eventos fora de ordem");
      prevBeat = e.beat;
      const sfxName = e.kind === "sfx" ? e.name : e.kind === "cue" && e.sfx ? e.sfx : null;
      rt[i] = { event: e, time: tempoMap.beatToTime(e.beat), sfxName };
    }
    this.events = rt;
    this.cursor = 0;
    this.stats.scheduled = 0;
    this.stats.dropped = 0;
  }

  onVisualEvent(cb: (ev: ChartEvent) => void): void {
    this.visualCb = cb;
  }

  start(): void {
    this.running = true;
    this.ticker.start(() => this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    this.running = false;
    this.ticker.stop();
  }

  /** Pause só congela o cursor; nada a desagendar — ctx.suspend() congela os sources (PLANO §3.1). */
  pause(): void {
    this.running = false;
  }

  resume(): void {
    this.running = true;
  }

  private tick(): void {
    if (!this.running || !this.clock.isRunning) return;
    const now = performance.now();
    if (this.lastTickAt >= 0 && now - this.lastTickAt > 100) this.stats.lateTicks++;
    this.lastTickAt = now;

    // Horizonte e drop no relógio ctx cru: agendamento nunca envolve offsets
    // de percepção (audioOffset/outputLatency são de julgamento, não de áudio).
    const ctxNow = this.clock.ctxTime;
    const ctxHorizon = ctxNow + this.opts.lookaheadS;
    while (
      this.cursor < this.events.length &&
      this.clock.songTimeToCtxTime(this.events[this.cursor]!.time) <= ctxHorizon
    ) {
      const rt = this.events[this.cursor]!;
      this.cursor++;
      if (rt.sfxName !== null) {
        const when = this.clock.songTimeToCtxTime(rt.time);
        if (when < ctxNow) {
          this.stats.dropped++; // A2: perdeu a janela => dropa, nunca toca atrasado
        } else {
          this.sfx.playAt(rt.sfxName, when);
          this.stats.scheduled++;
        }
      }
      const k = rt.event.kind;
      if ((k === "cue" || k === "anim") && this.visualCb) this.visualCb(rt.event);
    }
  }
}
