import type { InputManager } from "../core/InputManager";
import type { InputSample } from "../core/types";
import { AudioClock } from "../core/AudioClock";
import { TempoMap } from "../core/TempoMap";

/**
 * Estima o offset do arquivo (segundos até o beat 0) a partir de taps do
 * usuário sobre a música crua, por MÉDIA CIRCULAR módulo a duração do beat —
 * offset perto de 0 não "enrola" para perto de beatDur.
 */
export function estimateOffset(tapsS: number[], beatDurS: number): number | null {
  if (tapsS.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const t of tapsS) {
    const th = 2 * Math.PI * (((t % beatDurS) + beatDurS) % beatDurS) / beatDurS;
    sx += Math.cos(th);
    sy += Math.sin(th);
  }
  const frac = (Math.atan2(sy, sx) / (2 * Math.PI) + 1) % 1;
  return frac * beatDurS;
}

/**
 * Ferramenta do dev-mode (?offset): toca a música SEM offset e coleta taps no
 * beat; mostra a sugestão ao vivo para copiar no `song{ offset = ... }`.
 */
export function runOffsetFinder(
  ui: HTMLElement,
  ctx: AudioContext,
  music: AudioBuffer,
  bpm: number,
  input: InputManager,
): void {
  const beatDur = 60 / bpm;
  const tm = new TempoMap(0, [{ startBeat: 0, bpm }]);
  const clock = new AudioClock(ctx, tm);
  input.setClock(clock);
  clock.start(music, 0.3);

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;" +
    "justify-content:center;background:#111;color:#eee;font:18px system-ui;text-align:center";
  overlay.innerHTML =
    `<div><b>offset finder</b> — bata no beat da música (bpm ${bpm})</div>` +
    `<div id="of-taps" style="opacity:.7">0 taps</div>` +
    `<div id="of-sugg" style="font-size:40px;font-family:monospace">–</div>` +
    `<div style="font-size:14px;opacity:.6">copie para o chart: song { offset = &lt;valor&gt; }</div>`;
  ui.appendChild(overlay);
  const tapsEl = overlay.querySelector("#of-taps") as HTMLElement;
  const suggEl = overlay.querySelector("#of-sugg") as HTMLElement;

  const taps: number[] = [];
  const buf: InputSample[] = Array.from({ length: 64 }, () => ({
    time: 0,
    source: "key" as const,
    code: "",
  }));
  const poll = () => {
    const n = input.drain(buf);
    for (let i = 0; i < n; i++) {
      if (buf[i]!.time > 0) taps.push(buf[i]!.time);
    }
    if (n > 0) {
      tapsEl.textContent = `${taps.length} taps`;
      const est = estimateOffset(taps, beatDur);
      if (est !== null) suggEl.textContent = `offset = ${est.toFixed(3)}`;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
