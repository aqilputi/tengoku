import type { Ticker } from "../../src/core/Ticker";

/** Ticker manual: os testes disparam tick() quando querem (inclusive "atrasado"). */
export class ManualTicker implements Ticker {
  private cb: (() => void) | null = null;
  running = false;
  start(cb: () => void): void { this.cb = cb; this.running = true; }
  stop(): void { this.running = false; this.cb = null; }
  tick(): void { if (this.running && this.cb) this.cb(); }
}
