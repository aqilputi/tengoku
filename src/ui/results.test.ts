import { describe, it, expect } from "vitest";
import { computeRank } from "./results";

const base = { perfects: 0, goods: 0, misses: 0, extras: 0, medianErrorMs: 0 };

describe("computeRank (M6: faixas, não nota numérica)", () => {
  it("superb: zero miss/extra e >= 60% perfect", () => {
    expect(computeRank({ ...base, perfects: 15, goods: 9 }, 24)).toBe("superb");
    expect(computeRank({ ...base, perfects: 24 }, 24)).toBe("superb");
  });
  it("sem superb com qualquer miss ou extra", () => {
    expect(computeRank({ ...base, perfects: 23, misses: 1 }, 24)).not.toBe("superb");
    expect(computeRank({ ...base, perfects: 24, extras: 1 }, 24)).not.toBe("superb");
  });
  it("ok: >= 70% dos cues acertados", () => {
    expect(computeRank({ ...base, perfects: 10, goods: 7, misses: 7 }, 24)).toBe("ok");
    expect(computeRank({ ...base, perfects: 5, goods: 12, misses: 7, extras: 3 }, 24)).toBe("ok");
  });
  it("try_again: abaixo de 70%", () => {
    expect(computeRank({ ...base, perfects: 8, goods: 8, misses: 8 }, 24)).toBe("try_again");
    expect(computeRank(base, 24)).toBe("try_again");
  });
  it("perfeito com muitos perfects mas 1 miss cai para ok (fiel ao RH: miss quebra o superb)", () => {
    expect(computeRank({ ...base, perfects: 23, misses: 1 }, 24)).toBe("ok");
  });
});
