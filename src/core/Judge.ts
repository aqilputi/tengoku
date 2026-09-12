import type { AudioClock } from "./AudioClock";
import type { ChartEvent, Cue, InputSample, JudgementResult, JudgeWindows } from "./types";
import type { TempoMap } from "./TempoMap";

/** Materializa os `expect` do chart em Cues com time pré-computado (zero conversão no loop). */
export function cuesFromEvents(events: ChartEvent[], tempoMap: TempoMap): Cue[] {
  const cues: Cue[] = [];
  let id = 0;
  for (const e of events) {
    if (e.kind === "expect") {
      cues.push({ id: id++, beat: e.beat, time: tempoMap.beatToTime(e.beat), state: "pending" });
    }
  }
  return cues;
}

export type JudgementCallback = (r: JudgementResult) => void;

/**
 * Julgamento (SPEC §2.5 + PLANO M3):
 * - pareamento: nearest PENDENTE dentro da janela goodMs (anti-roubo — input só
 *   enxerga cues realmente ativos; entre dois candidatos, o de menor erro)
 * - input sem candidato => miss explícito com cue null (regra Rhythm Heaven, A9)
 * - miss por omissão emitido NO MOMENTO em que o cue expira (update por frame)
 * - roda no rAF; a precisão vem do timestamp do input, não do instante do update
 */
export class Judge {
  private readonly clock: AudioClock;
  private readonly windows: JudgeWindows;

  private cues: Cue[] = [];
  /** Primeiro índice possivelmente pendente (cursor monotônico). */
  private cursor = 0;

  // fila de inputs pré-alocada (NFR: zero alocação no caminho quente)
  private static readonly QUEUE = 64;
  private readonly queue: InputSample[] = Array.from({ length: Judge.QUEUE }, () => ({
    time: 0,
    source: "key" as const,
    code: "",
  }));
  private qHead = 0;
  private qCount = 0;

  private listeners: JudgementCallback[] = [];

  private hitErrors: Float64Array = new Float64Array(0);
  private hitCount = 0;
  private missCount = 0;
  private perfectCount = 0;
  private goodCount = 0;
  private omissionCount = 0;
  private extraCount = 0;

  constructor(clock: AudioClock, windows: JudgeWindows) {
    this.clock = clock;
    this.windows = windows;
  }

  load(cues: Cue[]): void {
    this.cues = cues;
    this.cursor = 0;
    this.hitErrors = new Float64Array(Math.max(1, cues.length));
    this.hitCount = 0;
    this.missCount = 0;
    this.perfectCount = 0;
    this.goodCount = 0;
    this.omissionCount = 0;
    this.extraCount = 0;
    this.qHead = 0;
    this.qCount = 0;
  }

  onJudgement(cb: JudgementCallback): void {
    this.listeners.push(cb);
  }

  /** Enfileira um input já convertido para songTime (vindo do InputManager). */
  submit(s: InputSample): void {
    const idx = (this.qHead + this.qCount) % Judge.QUEUE;
    const slot = this.queue[idx]!;
    slot.time = s.time;
    slot.source = s.source;
    slot.code = s.code;
    if (this.qCount < Judge.QUEUE) this.qCount++;
    else this.qHead = (this.qHead + 1) % Judge.QUEUE; // estouro: descarta o mais antigo
  }

  private emit(r: JudgementResult): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i]!(r);
  }

  /** Uma vez por frame (rAF): processa inputs, depois expira cues. */
  update(): void {
    const goodS = this.windows.goodMs / 1000;
    const EPS = 1e-9;

    // 1) inputs
    while (this.qCount > 0) {
      const s = this.queue[this.qHead]!;
      this.qHead = (this.qHead + 1) % Judge.QUEUE;
      this.qCount--;

      let best: Cue | null = null;
      let bestAbs = Infinity;
      for (let i = this.cursor; i < this.cues.length; i++) {
        const c = this.cues[i]!;
        if (c.time > s.time + goodS + EPS) break; // ordenado: nada mais na janela
        if (c.state !== "pending") continue;
        const abs = Math.abs(s.time - c.time);
        if (abs <= goodS + EPS && abs < bestAbs) {
          best = c;
          bestAbs = abs;
        }
      }

      if (best) {
        best.state = "hit";
        const errorMs = (s.time - best.time) * 1000;
        this.hitErrors[this.hitCount] = errorMs;
        this.hitCount++;
        const verdict = Math.abs(errorMs) <= this.windows.perfectMs + EPS ? "perfect" : "good";
        if (verdict === "perfect") this.perfectCount++;
        else this.goodCount++;
        this.emit({ verdict, cue: best, inputTime: s.time, errorMs, early: errorMs < 0 });
      } else {
        // regra RH: bateu quando não tinha cue => falha explícita
        this.missCount++;
        this.extraCount++;
        this.emit({ verdict: "miss", cue: null, inputTime: s.time, errorMs: null, early: false });
      }
    }

    // 2) expiração por omissão
    const now = this.clock.songTime;
    for (let i = this.cursor; i < this.cues.length; i++) {
      const c = this.cues[i]!;
      if (c.state === "pending") {
        if (c.time + goodS < now - EPS) {
          c.state = "missed";
          this.missCount++;
          this.omissionCount++;
          this.emit({ verdict: "miss", cue: c, inputTime: null, errorMs: null, early: false });
        } else {
          break; // ordenado: os próximos ainda não expiraram
        }
      }
      // aqui o cue i está resolvido (hit ou missed) — cursor avança se for o primeiro
      if (i === this.cursor) this.cursor++;
    }
  }

  get stats(): {
    hits: number;
    misses: number;
    perfects: number;
    goods: number;
    omissions: number;
    extras: number;
    meanErrorMs: number;
    medianErrorMs: number;
  } {
    const n = this.hitCount;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.hitErrors[i]!;
    mean = n > 0 ? mean / n : 0;
    let median = 0;
    if (n > 0) {
      const sorted = Array.from(this.hitErrors.subarray(0, n)).sort((a, b) => a - b);
      median = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
    }
    return {
      hits: n,
      misses: this.missCount,
      perfects: this.perfectCount,
      goods: this.goodCount,
      omissions: this.omissionCount,
      extras: this.extraCount,
      meanErrorMs: mean,
      medianErrorMs: median,
    };
  }

  reset(): void {
    for (const c of this.cues) c.state = "pending";
    this.cursor = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.perfectCount = 0;
    this.goodCount = 0;
    this.omissionCount = 0;
    this.extraCount = 0;
    this.qHead = 0;
    this.qCount = 0;
  }
}
