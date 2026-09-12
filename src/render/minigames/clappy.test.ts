import { describe, it, expect } from "vitest";
import { impulse, ClappyScene } from "./clappy";
import type { JudgementResult, Cue } from "../../core/types";

function hit(beat: number, verdict: "perfect" | "good"): JudgementResult {
  const cue: Cue = { id: 0, beat, time: 0, state: "hit" };
  return { verdict, cue, inputTime: 0, errorMs: 0, early: false };
}
function omission(beat: number): JudgementResult {
  const cue: Cue = { id: 0, beat, time: 0, state: "missed" };
  return { verdict: "miss", cue, inputTime: null, errorMs: null, early: false };
}

describe("impulse (animação como função pura de beat — A do PLANO M5)", () => {
  it("1 no instante do gatilho, decai a 0 na duração", () => {
    expect(impulse(0, 0.5)).toBe(1);
    expect(impulse(0.25, 0.5)).toBeCloseTo(0.5, 10);
    expect(impulse(0.5, 0.5)).toBe(0);
    expect(impulse(2, 0.5)).toBe(0);
  });
  it("antes do gatilho é 0 (frames podem chegar atrasados, nunca adiantados)", () => {
    expect(impulse(-0.1, 0.5)).toBe(0);
  });
});

describe("ClappyScene — estado dirigido por eventos, pose derivada de beat", () => {
  it("cue do chart anima o chamador ancorado no beat do evento", () => {
    const s = new ClappyScene();
    s.onChartEvent({ kind: "cue", beat: 4, sfx: "call" });
    expect(s.callerClapAmount(4.0)).toBe(1);
    expect(s.callerClapAmount(4.25)).toBeCloseTo(0.5, 10);
    expect(s.callerClapAmount(5.0)).toBe(0);
    expect(s.callerClapAmount(3.9)).toBe(0); // frame adiantado não vaza
  });

  it("hit anima o jogador; perfect e good têm intensidades distintas", () => {
    const s = new ClappyScene();
    s.onJudgement(hit(8, "perfect"));
    expect(s.playerClapAmount(8.0)).toBe(1);
    expect(s.lastVerdict).toBe("perfect");
    s.onJudgement(hit(9, "good"));
    expect(s.lastVerdict).toBe("good");
  });

  it("miss deixa o jogador triste por 2 beats", () => {
    const s = new ClappyScene();
    s.onJudgement(omission(10));
    expect(s.isSad(10.5)).toBe(true);
    expect(s.isSad(11.9)).toBe(true);
    expect(s.isSad(12.1)).toBe(false);
  });

  it("anim runtime do Lua ('bater'/'errar') mapeia para as mesmas reações", () => {
    const s = new ClappyScene();
    s.onAnim("personagem", "bater", 6);
    expect(s.playerClapAmount(6.1)).toBeGreaterThan(0);
    s.onAnim("personagem", "errar", 7);
    expect(s.isSad(7.5)).toBe(true);
  });
});
