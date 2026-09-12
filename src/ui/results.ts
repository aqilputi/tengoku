export interface GameResult {
  perfects: number;
  goods: number;
  misses: number; // omissões
  extras: number;
  medianErrorMs: number;
}

/** Faixas estilo Rhythm Heaven (M6): avaliação, não nota numérica. */
export type Rank = "try_again" | "ok" | "superb";

export function computeRank(r: GameResult, totalCues: number): Rank {
  if (totalCues <= 0) return "try_again";
  if (r.misses === 0 && r.extras === 0 && r.perfects / totalCues >= 0.6) return "superb";
  if ((r.perfects + r.goods) / totalCues >= 0.7) return "ok";
  return "try_again";
}

const RANK_LABEL: Record<Rank, [string, string]> = {
  superb: ["SUPERB!", "#7CFC00"],
  ok: ["OK", "#ffd54f"],
  try_again: ["tente de novo...", "#ff8a80"],
};

export function showResults(ui: HTMLElement, r: GameResult, rank: Rank, onReplay: () => void): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;" +
    "justify-content:center;background:rgba(10,10,14,.92);color:#eee;font:18px system-ui";
  const [label, color] = RANK_LABEL[rank];
  overlay.innerHTML =
    `<div style="font-size:52px;font-weight:bold;color:${color}">${label}</div>` +
    `<div>perfeito ${r.perfects} · bom ${r.goods} · perdido ${r.misses} · extra ${r.extras}</div>` +
    `<div style="opacity:.7;font-size:14px">erro mediano ${r.medianErrorMs.toFixed(1)}ms</div>` +
    `<button id="replay" style="margin-top:16px;font:18px system-ui;padding:10px 28px;cursor:pointer">jogar de novo</button>`;
  ui.appendChild(overlay);
  (overlay.querySelector("#replay") as HTMLButtonElement).onclick = () => {
    overlay.remove();
    onReplay();
  };
}
