import { describe, it, expect } from "vitest";
import { estimateOffset } from "./offsetFinder";
import { resolveChartParam } from "../core/manifest";

describe("estimateOffset (ferramenta de offset — média circular)", () => {
  const d = 0.5; // beat de 120 BPM

  it("taps em offset + k*beat recuperam o offset", () => {
    const taps = [0, 1, 2, 3, 7].map((k) => 0.312 + k * d);
    expect(estimateOffset(taps, d)!).toBeCloseTo(0.312, 3);
  });

  it("robusto a ruído de ±20ms", () => {
    const noise = [0.02, -0.015, 0.01, -0.02, 0.005, 0.018];
    const taps = noise.map((n, k) => 0.312 + k * d + n);
    expect(estimateOffset(taps, d)!).toBeCloseTo(0.312, 2);
  });

  it("wrap: offset perto de 0 com ruído negativo não vira ~beatDur (média circular)", () => {
    const taps = [0.01, -0.015 + d, 0.02 + 2 * d, -0.01 + 3 * d, 0.005 + 4 * d];
    const est = estimateOffset(taps, d)!;
    // aceita 0.002 ou equivalente circular (d - epsilon)
    const dist = Math.min(est, d - est);
    expect(dist).toBeLessThan(0.02);
  });

  it("sem taps => null", () => {
    expect(estimateOffset([], d)).toBeNull();
  });
});

describe("resolveChartParam (?chart= dev-mode)", () => {
  it("extrai a URL do chart", () => {
    expect(resolveChartParam("?chart=/local/meu.lua")).toBe("/local/meu.lua");
    expect(resolveChartParam("?foo=1&chart=/charts/x.lua")).toBe("/charts/x.lua");
  });
  it("sem param => null; origem externa é recusada (só caminho relativo)", () => {
    expect(resolveChartParam("")).toBeNull();
    expect(resolveChartParam("?chart=https://mal.com/x.lua")).toBeNull();
    expect(resolveChartParam("?chart=//mal.com/x.lua")).toBeNull();
  });
});
