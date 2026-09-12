import { describe, it, expect } from "vitest";
import { computeCalibration } from "./calibration";

describe("computeCalibration (SPEC §2.4 + A6)", () => {
  it("16 batidas: descarta as 4 primeiras, mediana das 12 restantes", () => {
    const errors = [0.9, 0.9, 0.9, 0.9, ...Array(12).fill(0.08)];
    const r = computeCalibration(errors);
    expect(r).toEqual({ ok: true, offsetS: 0.08 });
  });

  it("mediana é robusta a outlier que passou do descarte inicial", () => {
    const tail = [0.05, 0.05, 0.06, 0.06, 0.05, 0.06, 0.05, 0.06, 0.05, 0.06, 0.05, 0.24];
    const r = computeCalibration([0, 0, 0, 0, ...tail]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.offsetS).toBeCloseTo(0.055, 10);
  });

  it("amostras com |erro| > 250ms são descartadas (batida perdida)", () => {
    const tail = [0.05, 0.05, 0.3, -0.4, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
    const r = computeCalibration([0, 0, 0, 0, ...tail]);
    expect(r).toEqual({ ok: true, offsetS: 0.05 });
  });

  it("menos de 8 válidas => retry com mensagem", () => {
    const r = computeCalibration([0, 0, 0, 0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.05, 0.05, 0.05, 0.05, 0.05, 0.3, 0.3]);
    expect(r.ok).toBe(false);
  });

  it("A6: offset NEGATIVO é permitido (não clampa em zero como o Bemuse)", () => {
    const r = computeCalibration([0, 0, 0, 0, ...Array(12).fill(-0.03)]);
    expect(r).toEqual({ ok: true, offsetS: -0.03 });
  });

  it("clamp na faixa -200..+500ms", () => {
    const low = computeCalibration([0, 0, 0, 0, ...Array(12).fill(-0.24)]);
    expect(low).toEqual({ ok: true, offsetS: -0.2 });
  });
});
