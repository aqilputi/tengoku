import type { AudioClock } from "../core/AudioClock";
import type { SfxPlayer } from "../core/SfxPlayer";
import type { InputManager } from "../core/InputManager";
import type { TempoMap } from "../core/TempoMap";
import type { InputSample } from "../core/types";
import { clampOffset } from "../core/Settings";

export type CalibrationResult = { ok: true; offsetS: number } | { ok: false; reason: string };

const DISCARD_FIRST = 4;
const OUTLIER_S = 0.25;
const MIN_VALID = 8;

/**
 * SPEC §2.4 + A6: descarta as 4 primeiras batidas (aquecimento) e outliers
 * (batida perdida), mediana do resto; negativo permitido; clamp −200..+500ms.
 */
export function computeCalibration(errorsS: number[]): CalibrationResult {
  const tail = errorsS.slice(DISCARD_FIRST);
  const valid = tail.filter((e) => Math.abs(e) <= OUTLIER_S);
  if (valid.length < MIN_VALID) {
    return { ok: false, reason: `poucas batidas válidas (${valid.length}/${MIN_VALID}) — tente de novo` };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  return { ok: true, offsetS: clampOffset(median) };
}

export const CALIBRATION_BEATS = 16;
const CALIBRATION_BPM = 100;

/**
 * Tela de calibração de ÁUDIO (às cegas — A6): metrônomo de 16 batidas,
 * jogador bate junto; erros medidos no relógio de música.
 * O clock DEVE estar rodando (start já aconteceu).
 */
export async function runCalibration(
  ui: HTMLElement,
  clock: AudioClock,
  tempoMap: TempoMap,
  sfx: SfxPlayer,
  input: InputManager,
): Promise<CalibrationResult> {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;display:flex;flex-direction:column;gap:16px;align-items:center;" +
    "justify-content:center;background:#111;color:#eee;font:20px system-ui;text-align:center";
  overlay.innerHTML =
    "<div>calibração: <b>bata no ritmo do clique</b></div>" +
    "<div style='font-size:14px;opacity:.7'>de preferência sem olhar pra tela — só ouvido</div>" +
    "<div id='cal-count' style='font-size:48px'>–</div>";
  ui.appendChild(overlay);
  const counter = overlay.querySelector("#cal-count") as HTMLElement;

  const beatDur = 60 / CALIBRATION_BPM;
  const startBeatTime = clock.songTime + 1.0; // 1s de respiro
  const beatTimes: number[] = [];
  for (let b = 0; b < CALIBRATION_BEATS; b++) beatTimes.push(startBeatTime + b * beatDur);
  for (const t of beatTimes) sfx.playAt("call", clock.songTimeToCtxTime(t));

  const errors: number[] = [];
  input.clear();
  const drainBuf: InputSample[] = Array.from({ length: 64 }, () => ({
    time: 0,
    source: "key" as const,
    code: "",
  }));

  const endTime = beatTimes[CALIBRATION_BEATS - 1]! + beatDur * 2;
  await new Promise<void>((resolve) => {
    const poll = () => {
      const n = input.drain(drainBuf);
      for (let i = 0; i < n; i++) {
        const t = drainBuf[i]!.time;
        // pareia com a batida mais próxima
        let best = Infinity;
        for (const bt of beatTimes) {
          const d = t - bt;
          if (Math.abs(d) < Math.abs(best)) best = d;
        }
        if (Number.isFinite(best)) errors.push(best);
        counter.textContent = String(errors.length);
      }
      if (clock.songTime >= endTime) resolve();
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });

  overlay.remove();
  void tempoMap;
  return computeCalibration(errors);
}
