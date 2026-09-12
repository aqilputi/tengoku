import { describe, it, expect } from "vitest";
import { createSettings, type StorageLike } from "./Settings";

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("Settings", () => {
  it("storage vazio => defaults (não calibrado)", () => {
    const s = createSettings(fakeStorage());
    expect(s.load()).toEqual({ version: 1, audioOffsetS: 0, visualOffsetS: 0, calibratedAt: null });
  });

  it("round-trip save/load", () => {
    const st = fakeStorage();
    const s = createSettings(st);
    const cfg = { version: 1 as const, audioOffsetS: 0.12, visualOffsetS: -0.02, calibratedAt: "2026-09-11" };
    s.save(cfg);
    expect(createSettings(st).load()).toEqual(cfg);
  });

  it("JSON corrompido => defaults, sem lançar", () => {
    const s = createSettings(fakeStorage({ "tengoku.settings": "{oops" }));
    expect(() => s.load()).not.toThrow();
    expect(s.load().calibratedAt).toBeNull();
  });

  it("versão de schema diferente => defaults", () => {
    const s = createSettings(fakeStorage({ "tengoku.settings": JSON.stringify({ version: 99, audioOffsetS: 9 }) }));
    expect(s.load().audioOffsetS).toBe(0);
  });

  it("valores fora de faixa são clampados na carga (A6: -200..+500ms)", () => {
    const s = createSettings(
      fakeStorage({
        "tengoku.settings": JSON.stringify({ version: 1, audioOffsetS: 3, visualOffsetS: -1, calibratedAt: "x" }),
      }),
    );
    expect(s.load().audioOffsetS).toBe(0.5);
    expect(s.load().visualOffsetS).toBe(-0.2);
  });
});
