import type { AudioClock } from "../core/AudioClock";
import type { Scheduler } from "../core/Scheduler";
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
  private renderer: Renderer;

  constructor(clock: AudioClock, renderer: Renderer, sched: Scheduler | null = null) {
    this.clock = clock;
    this.sched = sched;
    this.renderer = renderer;
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
