import type { Beats, TempoSegment } from "../core/types";

/** O que o chart Lua enxerga na FASE DE CARGA (SPEC §3). */
export interface ChartDsl {
  song(t: {
    audio: string;
    title: string;
    offset: number;
    bpm?: number; // açúcar para segments = [{ startBeat: 0, bpm }]
    segments?: TempoSegment[];
  }): void;
  /** Curried: minigame "clappy" { janela_perfeito = 0.045 } */
  minigame(name: string): (opts: Record<string, number>) => void;
  sfx(beat: Beats, name: string, variant?: string): void;
  cue(beat: Beats, sfx?: string): void;
  expect(beat: Beats): void;
  anim(beat: Beats, target: string, name: string): void;
  on_hit(fn: (judgement: string, beat: Beats) => void): void;
  on_miss(fn: (beat: Beats) => void): void;
}

/** O que os callbacks Lua podem chamar em RUNTIME (via handlers do host). */
export interface RuntimeHandlers {
  playSfx(name: string, variant?: string): void;
  anim(target: string, name: string): void;
}
