/**
 * Tela "toque para começar" (armadilha #1: AudioContext nasce suspenso) +
 * sanidade de e.timeStamp (SPEC §2.3 / adendo A4).
 */
export interface BootResult {
  ctx: AudioContext;
  /** true => e.timeStamp não é confiável neste browser; usar performance.now(). */
  unreliableTimestamps: boolean;
}

export function bootScreen(ui: HTMLElement): Promise<BootResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:#111;color:#eee;font:24px system-ui;cursor:pointer;user-select:none";
    overlay.textContent = "toque para começar";
    ui.appendChild(overlay);

    const onGesture = async (e: PointerEvent | KeyboardEvent) => {
      overlay.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      // sanidade do timestamp NO GESTO (A4, guard do first-input-delay):
      const nowMs = performance.now();
      const unreliable = e.timeStamp > nowMs || e.timeStamp < 0 || Math.abs(e.timeStamp - nowMs) > 5000;
      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.resume(); // dentro do gesto
      overlay.remove();
      resolve({ ctx, unreliableTimestamps: unreliable });
    };
    overlay.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
  });
}
