/**
 * Canvas 2D + rAF. Pode atrasar/perder frames sem afetar julgamento (SPEC §1).
 * DPI: backing store por devicePixelRatio; código de desenho em pixels CSS (armadilha #8).
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private rafId = 0;
  private frameCb: ((g: CanvasRenderingContext2D, w: number, h: number) => void) | null = null;

  // FPS: atualizado a cada 500ms para não alocar strings por frame (NFR)
  private frames = 0;
  private lastFpsAt = 0;
  fps = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas 2D indisponível");
    this.g = g;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  onFrame(cb: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.frameCb = cb;
  }

  start(): void {
    const loop = (t: number) => {
      this.frames++;
      if (t - this.lastFpsAt >= 500) {
        this.fps = Math.round((this.frames * 1000) / (t - this.lastFpsAt));
        this.frames = 0;
        this.lastFpsAt = t;
      }
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.g.clearRect(0, 0, w, h);
      if (this.frameCb) this.frameCb(this.g, w, h);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }
}
