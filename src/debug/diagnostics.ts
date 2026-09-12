import type { AudioClock } from "../core/AudioClock";
import type { Scheduler } from "../core/Scheduler";
import type { Judge } from "../core/Judge";
import type { JudgementResult } from "../core/types";
import type { Renderer } from "../render/Renderer";

/**
 * HUD de diagnóstico (aceite M1): songTime, songBeat, drift, latência, FPS,
 * drops/lateTicks do Scheduler. Toggle: F1. Strings realocadas só a cada
 * 250ms (NFR: nada de garbage por frame).
 */
export class DiagnosticsHud {
  private visible = true;
  private lines: string[] = [];
  private lastTextAt = 0;
  private clock: AudioClock;
  private sched: Scheduler | null;
  private judge: Judge | null;
  private renderer: Renderer;
  private lastJudgement = "";

  constructor(clock: AudioClock, renderer: Renderer, sched: Scheduler | null = null, judge: Judge | null = null) {
    this.clock = clock;
    this.sched = sched;
    this.judge = judge;
    this.renderer = renderer;
    if (judge) {
      judge.onJudgement((r: JudgementResult) => {
        this.lastJudgement =
          r.errorMs !== null
            ? `${r.verdict} ${r.errorMs >= 0 ? "+" : ""}${r.errorMs.toFixed(1)}ms${r.early ? " (early)" : ""}`
            : r.cue
              ? "MISS (omissão)"
              : "MISS (extra!)";
      });
    }
    window.addEventListener("keydown", (e) => {
      if (e.code === "F1") { e.preventDefault(); this.visible = !this.visible; }
    });
  }

  draw(g: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    const now = performance.now();
    if (now - this.lastTextAt >= 250) {
      this.lastTextAt = now;
      this.lines.length = 0;
      this.lines.push(`songTime  ${this.clock.songTime.toFixed(3)}s`);
      this.lines.push(`songBeat  ${this.clock.songBeat.toFixed(2)}`);
      this.lines.push(`drift     ${this.clock.driftMs.toFixed(2)}ms`);
      this.lines.push(`latency   ${(this.clock.outputLatencyS * 1000).toFixed(1)}ms`);
      this.lines.push(`fps       ${this.renderer.fps}`);
      if (this.sched) {
        this.lines.push(`sched     ok:${this.sched.stats.scheduled} drop:${this.sched.stats.dropped} late:${this.sched.stats.lateTicks}`);
      }
      if (this.judge) {
        const st = this.judge.stats;
        this.lines.push(`judge     hit:${st.hits} miss:${st.misses} μ:${st.meanErrorMs.toFixed(1)}ms med:${st.medianErrorMs.toFixed(1)}ms`);
        this.lines.push(`último    ${this.lastJudgement}`);
      }
    }
    g.font = "13px monospace";
    g.textBaseline = "top";
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(8, 8, 260, 18 * this.lines.length + 10);
    g.fillStyle = "#7CFC00";
    for (let i = 0; i < this.lines.length; i++) {
      g.fillText(this.lines[i]!, 14, 14 + i * 18);
    }
  }
}
