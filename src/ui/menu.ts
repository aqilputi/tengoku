export type MenuChoice = "play" | "calibrate";

export function showMenu(ui: HTMLElement, calibrated: boolean, title: string): Promise<MenuChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;" +
      "justify-content:center;background:#111;color:#eee;font:18px system-ui";
    const btn = (label: string) =>
      `<button style="font:18px system-ui;padding:10px 32px;cursor:pointer">${label}</button>`;
    overlay.innerHTML =
      `<div style="font-size:44px;font-weight:bold;margin-bottom:10px">Tengoku</div>` +
      `<div style="opacity:.7;margin-bottom:14px">${title}</div>` +
      `<div id="play">${btn(calibrated ? "jogar" : "calibrar e jogar")}</div>` +
      (calibrated ? `<div id="cal">${btn("recalibrar")}</div>` : "");
    ui.appendChild(overlay);
    const done = (c: MenuChoice) => {
      overlay.remove();
      resolve(c);
    };
    (overlay.querySelector("#play") as HTMLElement).onclick = () => done(calibrated ? "play" : "calibrate");
    const cal = overlay.querySelector("#cal") as HTMLElement | null;
    if (cal) cal.onclick = () => done("calibrate");
  });
}
