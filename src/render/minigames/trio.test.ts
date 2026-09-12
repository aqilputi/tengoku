import { describe, it, expect, beforeAll } from "vitest";
import { TrioScene } from "./trio";
import { LuaHost } from "../../lua/LuaHost";
import trioChart from "../../../charts/trio.lua?raw";
import type { ChartData, Cue, JudgementResult } from "../../core/types";

describe("TrioScene — mecânica do trio: dois batem, o jogador fecha", () => {
  it("cue clap1 anima o 1º da fila; clap2 o 2º; nunca o jogador", () => {
    const s = new TrioScene();
    s.onChartEvent({ kind: "cue", beat: 4, sfx: "clap1" });
    s.onChartEvent({ kind: "cue", beat: 5, sfx: "clap2" });
    expect(s.clapAmount(0, 4.1)).toBeGreaterThan(0);
    expect(s.clapAmount(1, 4.1)).toBe(0);
    expect(s.clapAmount(1, 5.1)).toBeGreaterThan(0);
    expect(s.clapAmount(2, 5.1)).toBe(0); // jogador só bate com input
  });

  it("hit anima o jogador (3º da fila)", () => {
    const s = new TrioScene();
    const cue: Cue = { id: 0, beat: 6, time: 0, state: "hit" };
    const r: JudgementResult = { verdict: "perfect", cue, inputTime: 0, errorMs: 0, early: false };
    s.onJudgement(r);
    expect(s.clapAmount(2, 6.1)).toBeGreaterThan(0);
    expect(s.lastVerdict).toBe("perfect");
  });

  it("miss deixa a fila encarando o jogador por 2 beats (glare do original)", () => {
    const s = new TrioScene();
    const cue: Cue = { id: 0, beat: 8, time: 0, state: "missed" };
    s.onJudgement({ verdict: "miss", cue, inputTime: null, errorMs: null, early: false });
    expect(s.isGlaring(9)).toBe(true);
    expect(s.isGlaring(10.5)).toBe(false);
  });
});

describe("TrioScene — seleção de pose para sprites", () => {
  it("pose = clap durante o impulso, idle depois; jogador triste durante o glare", () => {
    const s = new TrioScene();
    s.onChartEvent({ kind: "cue", beat: 4, sfx: "clap1" });
    expect(s.poseFor(0, 4.1)).toBe("clap");
    expect(s.poseFor(0, 5.0)).toBe("idle");
    expect(s.poseFor(2, 4.1)).toBe("idle");
    const cue: Cue = { id: 0, beat: 8, time: 0, state: "missed" };
    s.onJudgement({ verdict: "miss", cue, inputTime: null, errorMs: null, early: false });
    expect(s.poseFor(2, 8.5)).toBe("sad"); // só o jogador fica triste
    expect(s.poseFor(0, 8.5)).toBe("idle");
    expect(s.poseFor(2, 10.5)).toBe("idle");
  });
});

describe("charts/trio.lua — estrutura fiel à mecânica", () => {
  let chart: ChartData;
  beforeAll(async () => {
    const host = await LuaHost.create();
    const r = await host.loadChart(trioChart);
    if (!r.ok) throw new Error(r.error);
    chart = r.chart;
  });

  it("carrega, minigame 'trio', janelas 45/90", () => {
    expect(chart.minigame).toBe("trio");
    expect(chart.windows).toEqual({ perfectMs: 45, goodMs: 90 });
  });

  it("toda sequência é clap1 -> clap2 -> expect com espaçamento IGUAL (1 ou 0.5 beat)", () => {
    const evs = chart.events.filter((e) => e.kind === "cue" || e.kind === "expect");
    expect(evs.length % 3).toBe(0);
    for (let i = 0; i < evs.length; i += 3) {
      const [a, b, c] = [evs[i]!, evs[i + 1]!, evs[i + 2]!];
      expect(a.kind).toBe("cue");
      expect((a as { sfx?: string }).sfx).toBe("clap1");
      expect(b.kind).toBe("cue");
      expect((b as { sfx?: string }).sfx).toBe("clap2");
      expect(c.kind).toBe("expect");
      const gap1 = b.beat - a.beat;
      const gap2 = c.beat - b.beat;
      expect(gap2).toBeCloseTo(gap1, 9); // o jogador mantém o intervalo
      expect([0.5, 1]).toContain(gap1);
    }
  });

  it("tem padrões normais (1 beat) E rápidos (0.5 beat)", () => {
    const evs = chart.events.filter((e) => e.kind === "cue" || e.kind === "expect");
    const gaps = new Set<number>();
    for (let i = 0; i < evs.length; i += 3) gaps.add(evs[i + 1]!.beat - evs[i]!.beat);
    expect(gaps).toEqual(new Set([1, 0.5]));
  });

  it("sequências não se sobrepõem (frase termina antes da próxima começar)", () => {
    const evs = chart.events.filter((e) => e.kind === "cue" || e.kind === "expect");
    for (let i = 3; i < evs.length; i += 3) {
      expect(evs[i]!.beat).toBeGreaterThan(evs[i - 1]!.beat);
    }
  });
});
