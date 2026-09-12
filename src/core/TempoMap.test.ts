import { describe, it, expect } from "vitest";
import { TempoMap } from "./TempoMap";

describe("TempoMap", () => {
  describe("BPM fixo", () => {
    const tm = new TempoMap(0.5, [{ startBeat: 0, bpm: 120 }]); // beat = 0.5s

    it("beatToTime inclui o offset do arquivo", () => {
      expect(tm.beatToTime(0)).toBeCloseTo(0.5, 10);
      expect(tm.beatToTime(4)).toBeCloseTo(0.5 + 4 * 0.5, 10);
    });

    it("timeToBeat é a inversa", () => {
      expect(tm.timeToBeat(0.5)).toBeCloseTo(0, 10);
      expect(tm.timeToBeat(2.5)).toBeCloseTo(4, 10);
    });

    it("ida-e-volta beatToTime(timeToBeat(t)) ≈ t", () => {
      for (const t of [0, 0.123, 1, 7.77, 180]) {
        expect(tm.beatToTime(tm.timeToBeat(t))).toBeCloseTo(t, 9);
      }
    });

    it("beatDuration é 60/bpm", () => {
      expect(tm.beatDuration(0)).toBeCloseTo(0.5, 10);
      expect(tm.beatDuration(999)).toBeCloseTo(0.5, 10);
    });

    it("beats negativos (lead-in antes do beat 0) funcionam", () => {
      expect(tm.beatToTime(-2)).toBeCloseTo(0.5 - 1.0, 10);
      expect(tm.timeToBeat(-0.5)).toBeCloseTo(-2, 10);
    });
  });

  describe("multi-segmento", () => {
    // 120 BPM até o beat 8, depois 240 BPM
    const tm = new TempoMap(0, [
      { startBeat: 0, bpm: 120 },
      { startBeat: 8, bpm: 240 },
    ]);

    it("acumula tempo através dos segmentos", () => {
      expect(tm.beatToTime(8)).toBeCloseTo(4.0, 10); // 8 * 0.5
      expect(tm.beatToTime(10)).toBeCloseTo(4.0 + 2 * 0.25, 10);
    });

    it("timeToBeat atravessa a fronteira", () => {
      expect(tm.timeToBeat(4.0)).toBeCloseTo(8, 10);
      expect(tm.timeToBeat(4.5)).toBeCloseTo(10, 10);
    });

    it("ida-e-volta perto da fronteira", () => {
      for (const b of [7.99, 8, 8.01, 15]) {
        expect(tm.timeToBeat(tm.beatToTime(b))).toBeCloseTo(b, 9);
      }
    });

    it("beatDuration muda por segmento", () => {
      expect(tm.beatDuration(7)).toBeCloseTo(0.5, 10);
      expect(tm.beatDuration(8)).toBeCloseTo(0.25, 10);
    });
  });

  describe("validação", () => {
    it("rejeita lista vazia de segmentos", () => {
      expect(() => new TempoMap(0, [])).toThrow();
    });
    it("rejeita bpm <= 0", () => {
      expect(() => new TempoMap(0, [{ startBeat: 0, bpm: 0 }])).toThrow();
      expect(() => new TempoMap(0, [{ startBeat: 0, bpm: -10 }])).toThrow();
    });
    it("rejeita segmentos fora de ordem", () => {
      expect(
        () => new TempoMap(0, [{ startBeat: 8, bpm: 120 }, { startBeat: 0, bpm: 240 }]),
      ).toThrow();
    });
    it("exige primeiro segmento em startBeat 0", () => {
      expect(() => new TempoMap(0, [{ startBeat: 4, bpm: 120 }])).toThrow();
    });
  });
});
