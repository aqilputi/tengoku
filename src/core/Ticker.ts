/**
 * Fonte de tick do Scheduler (adendo A1): Web Worker em produção — imune ao
 * throttling de aba oculta e ao jitter de GC/layout da main thread.
 * Testes usam ManualTicker (determinístico).
 */
export interface Ticker {
  start(cb: () => void, intervalMs: number): void;
  stop(): void;
}

export class WorkerTicker implements Ticker {
  private worker: Worker | null = null;

  start(cb: () => void, intervalMs: number): void {
    this.stop();
    const src = `let id=null;onmessage=(e)=>{if(e.data.cmd==="start"){clearInterval(id);id=setInterval(()=>postMessage(0),e.data.ms)}else{clearInterval(id);id=null}};`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    this.worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.worker.onmessage = () => cb();
    this.worker.postMessage({ cmd: "start", ms: intervalMs });
  }

  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ cmd: "stop" });
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/** Fallback para ambientes sem Worker; e base do ManualTicker de teste. */
export class IntervalTicker implements Ticker {
  private id: ReturnType<typeof setInterval> | null = null;
  start(cb: () => void, intervalMs: number): void {
    this.stop();
    this.id = setInterval(cb, intervalMs);
  }
  stop(): void {
    if (this.id !== null) { clearInterval(this.id); this.id = null; }
  }
}
