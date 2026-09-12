import type { Beats, ChartEvent, JudgementResult, SongSeconds, Verdict } from "../../core/types";

/**
 * Impulso de animação como função pura de beat (PLANO M5): 1 no gatilho,
 * decai linearmente a 0 em `durBeats`. Frames podem pular sem dessincronizar.
 */
export function impulse(beatsSince: number, durBeats: number): number {
  if (beatsSince < 0 || beatsSince >= durBeats) return 0;
  return 1 - beatsSince / durBeats;
}

const CLAP_DUR = 0.5; // beats
const SAD_DUR = 2; // beats

/**
 * Minigame "clappy": chamador (esq.) bate nos cues; jogador (dir.) responde.
 * Estado = âncoras de beat; pose = f(visualBeat). Zero alocação no draw.
 */
export class ClappyScene {
  private lastCueBeat = -Infinity;
  private lastPlayerClapBeat = -Infinity;
  private lastSadBeat = -Infinity;
  lastVerdict: Verdict | null = null;

  onChartEvent(ev: ChartEvent): void {
    if (ev.kind === "cue") this.lastCueBeat = ev.beat;
  }

  onJudgement(r: JudgementResult): void {
    if (r.verdict !== "miss") {
      this.lastPlayerClapBeat = r.cue!.beat;
      this.lastVerdict = r.verdict;
    } else {
      // omissão ancora no beat do cue; input extra ancora "agora" (beat do input não existe aqui,
      // o chamador passa via onAnim/beat do adapter quando quiser precisão)
      this.lastSadBeat = r.cue ? r.cue.beat : this.lastSadBeat;
      this.lastVerdict = "miss";
    }
  }

  /** Reações vindas do Lua em runtime (play anim("personagem", ...)). */
  onAnim(_target: string, name: string, atBeat: Beats): void {
    if (name === "bater") {
      this.lastPlayerClapBeat = atBeat;
    } else if (name === "errar") {
      this.lastSadBeat = atBeat;
    }
  }

  /** Usado pelo adapter para ancorar miss de input extra no beat corrente. */
  sadAt(beat: Beats): void {
    this.lastSadBeat = beat;
    this.lastVerdict = "miss";
  }

  callerClapAmount(visualBeat: Beats): number {
    return impulse(visualBeat - this.lastCueBeat, CLAP_DUR);
  }

  playerClapAmount(visualBeat: Beats): number {
    return impulse(visualBeat - this.lastPlayerClapBeat, CLAP_DUR);
  }

  isSad(visualBeat: Beats): boolean {
    const d = visualBeat - this.lastSadBeat;
    return d >= 0 && d < SAD_DUR;
  }

  // ---- desenho (sem assets: formas puras; sprites entram quando a arte existir) ----

  private drawCharacter(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    clap: number,
    sad: boolean,
    color: string,
  ): void {
    // corpo
    g.beginPath();
    g.arc(x, y, 46, 0, Math.PI * 2);
    g.fillStyle = sad ? "#546e7a" : color;
    g.fill();
    // olhos
    g.fillStyle = "#111";
    const eyeY = y - 10 + (sad ? 6 : 0);
    g.beginPath();
    g.arc(x - 14, eyeY, 5, 0, Math.PI * 2);
    g.arc(x + 14, eyeY, 5, 0, Math.PI * 2);
    g.fill();
    // boca
    g.beginPath();
    if (sad) g.arc(x, y + 26, 12, Math.PI * 1.15, Math.PI * 1.85);
    else g.arc(x, y + 14, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = 3;
    g.strokeStyle = "#111";
    g.stroke();
    // mãos: afastadas em repouso, juntas no pico do clap
    const spread = 70 - 55 * clap;
    g.fillStyle = "#ffe0b2";
    g.beginPath();
    g.arc(x - spread, y + 4, 12, 0, Math.PI * 2);
    g.arc(x + spread, y + 4, 12, 0, Math.PI * 2);
    g.fill();
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, visualBeat: Beats, _visualTime: SongSeconds): void {
    // chão pulsando no beat
    const pulse = impulse(visualBeat % 1, 0.35);
    g.fillStyle = `rgba(79,195,247,${0.06 + 0.05 * pulse})`;
    g.fillRect(0, h * 0.72, w, h * 0.28);

    this.drawCharacter(g, w * 0.32, h * 0.5, this.callerClapAmount(visualBeat), false, "#ff8a65");
    this.drawCharacter(
      g,
      w * 0.68,
      h * 0.5,
      this.playerClapAmount(visualBeat),
      this.isSad(visualBeat),
      "#4dd0e1",
    );

    // selo do último veredito sobre o jogador
    if (this.lastVerdict) {
      const label =
        this.lastVerdict === "perfect" ? "PERFEITO!" : this.lastVerdict === "good" ? "bom" : "errou...";
      g.font = "bold 20px system-ui";
      g.textAlign = "center";
      g.fillStyle =
        this.lastVerdict === "perfect" ? "#7CFC00" : this.lastVerdict === "good" ? "#ffd54f" : "#ff1744";
      g.fillText(label, w * 0.68, h * 0.5 - 80);
      g.textAlign = "left";
    }
  }
}
