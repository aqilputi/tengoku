import { describe, it, expect } from "vitest";
import { applyAutosound, AUTOSOUND_THRESHOLD_S } from "./autosound";
import type { ChartEvent } from "./types";

const events: ChartEvent[] = [
  { kind: "cue", beat: 0, sfx: "call" },
  { kind: "expect", beat: 4 },
  { kind: "expect", beat: 5 },
];

describe("applyAutosound (A7, Bemuse): latência alta => SFX de resposta agendado, não reativo", () => {
  it("offset abaixo do limiar: eventos intactos, resposta continua reativa", () => {
    const r = applyAutosound(events, "clap_clean", 0.005);
    expect(r.autosound).toBe(false);
    expect(r.events).toEqual(events);
  });

  it("offset >= 10ms: injeta sfx no beat de cada expect, mantendo ordem", () => {
    const r = applyAutosound(events, "clap_clean", 0.012);
    expect(r.autosound).toBe(true);
    expect(r.events).toEqual([
      { kind: "cue", beat: 0, sfx: "call" },
      { kind: "sfx", beat: 4, name: "clap_clean" },
      { kind: "expect", beat: 4 },
      { kind: "sfx", beat: 5, name: "clap_clean" },
      { kind: "expect", beat: 5 },
    ]);
  });

  it("limiar exportado é 10ms", () => {
    expect(AUTOSOUND_THRESHOLD_S).toBe(0.01);
  });

  it("não muta o array original", () => {
    const before = JSON.stringify(events);
    applyAutosound(events, "x", 0.5);
    expect(JSON.stringify(events)).toBe(before);
  });
});
