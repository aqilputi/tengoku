import type { Beats, ChartEvent, JudgementResult, SongSeconds, Verdict } from "../../core/types";
import { impulse } from "./clappy";

const CLAP_DUR = 0.5; // beats
const GLARE_DUR = 2; // beats — a fila encara o jogador depois de um erro

export type TrioPose = "idle" | "clap" | "sad";
/** Sprites opcionais por membro/pose; ausente => desenho vetorial. */
export type TrioSprites = Partial<Record<0 | 1 | 2, Partial<Record<TrioPose, HTMLImageElement>>>>;

/**
 * Minigame "trio": três personagens ORIGINAIS em fila (formas abstratas
 * próprias). Os índices 0 e 1 batem nos cues (sfx clap1/clap2); o índice 2
 * é o jogador. Pose = f(visualBeat); zero alocação no draw.
 */
export class TrioScene {
  private clapBeats = new Float64Array([-Infinity, -Infinity, -Infinity]);
  private glareBeat = -Infinity;
  lastVerdict: Verdict | null = null;
  private sprites: TrioSprites = {};

  setSprites(sprites: TrioSprites): void {
    this.sprites = sprites;
  }

  onChartEvent(ev: ChartEvent): void {
    if (ev.kind !== "cue") return;
    if (ev.sfx === "clap1") this.clapBeats[0] = ev.beat;
    else if (ev.sfx === "clap2") this.clapBeats[1] = ev.beat;
  }

  onJudgement(r: JudgementResult): void {
    if (r.verdict !== "miss") {
      this.clapBeats[2] = r.cue!.beat;
      this.lastVerdict = r.verdict;
    } else {
      this.glareBeat = r.cue ? r.cue.beat : this.glareBeat;
      this.lastVerdict = "miss";
    }
  }

  onAnim(_target: string, name: string, atBeat: Beats): void {
    if (name === "bater") this.clapBeats[2] = atBeat;
    else if (name === "errar") this.glareBeat = atBeat;
  }

  sadAt(beat: Beats): void {
    this.glareBeat = beat;
    this.lastVerdict = "miss";
  }

  clapAmount(member: 0 | 1 | 2, visualBeat: Beats): number {
    return impulse(visualBeat - this.clapBeats[member]!, CLAP_DUR);
  }

  isGlaring(visualBeat: Beats): boolean {
    const d = visualBeat - this.glareBeat;
    return d >= 0 && d < GLARE_DUR;
  }

  /** Pose para sprite: clap durante o impulso; sad (só jogador) durante o glare. */
  poseFor(member: 0 | 1 | 2, visualBeat: Beats): TrioPose {
    if (this.clapAmount(member, visualBeat) > 0) return "clap";
    if (member === 2 && this.isGlaring(visualBeat)) return "sad";
    return "idle";
  }

  // ---- desenho: personagens originais (cápsulas com listras), sem referência visual a terceiros ----

  private drawMember(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    clap: number,
    glaring: boolean,
    isPlayer: boolean,
    hue: number,
  ): void {
    // corpo: cápsula vertical
    g.fillStyle = `hsl(${hue} 60% ${isPlayer ? 62 : 48}%)`;
    g.beginPath();
    g.roundRect(x - 34, y - 60, 68, 120, 34);
    g.fill();
    // listra própria
    g.fillStyle = `hsl(${hue} 70% 30%)`;
    g.fillRect(x - 34, y + 18, 68, 12);
    // olhos: normais ou encarando (deslocados na direção do jogador)
    g.fillStyle = "#111";
    const dx = glaring && !isPlayer ? 7 : 0;
    g.beginPath();
    g.arc(x - 12 + dx, y - 24, 5, 0, Math.PI * 2);
    g.arc(x + 12 + dx, y - 24, 5, 0, Math.PI * 2);
    g.fill();
    // mãos: juntas no pico da palma
    const spread = 58 - 46 * clap;
    g.fillStyle = `hsl(${hue} 45% 75%)`;
    g.beginPath();
    g.arc(x - spread, y + 2, 11, 0, Math.PI * 2);
    g.arc(x + spread, y + 2, 11, 0, Math.PI * 2);
    g.fill();
    // faísca no pico
    if (clap > 0.8) {
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y + 2, 18 + 10 * (1 - clap), 0, Math.PI * 2);
      g.stroke();
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, visualBeat: Beats, _visualTime: SongSeconds): void {
    const pulse = impulse(visualBeat % 1, 0.35);
    g.fillStyle = `rgba(255,183,77,${0.05 + 0.05 * pulse})`;
    g.fillRect(0, h * 0.72, w, h * 0.28);

    const glare = this.isGlaring(visualBeat);
    const xs = [w * 0.3, w * 0.5, w * 0.7];
    const hues = [18, 205, 130];
    for (let i = 0; i < 3; i++) {
      const m = i as 0 | 1 | 2;
      const clap = this.clapAmount(m, visualBeat);
      const sprite = this.sprites[m]?.[this.poseFor(m, visualBeat)];
      if (sprite) {
        // bounce leve no clap; âncora no chão do personagem
        const sc = 1 + 0.08 * clap;
        const sw = 150 * sc;
        const sh = 200 * sc;
        g.drawImage(sprite, xs[i]! - sw / 2, h * 0.5 + 60 - sh, sw, sh);
      } else {
        this.drawMember(g, xs[i]!, h * 0.5, clap, glare, i === 2, hues[i]!);
      }
    }

    if (this.lastVerdict) {
      const label =
        this.lastVerdict === "perfect" ? "PERFEITO!" : this.lastVerdict === "good" ? "quase!" : "errou...";
      g.font = "bold 20px system-ui";
      g.textAlign = "center";
      g.fillStyle =
        this.lastVerdict === "perfect" ? "#7CFC00" : this.lastVerdict === "good" ? "#ffd54f" : "#ff1744";
      g.fillText(label, xs[2]!, h * 0.5 - 92);
      g.textAlign = "left";
    }
  }
}
