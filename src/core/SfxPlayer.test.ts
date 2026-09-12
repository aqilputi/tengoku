import { describe, it, expect, beforeEach } from "vitest";
import { SfxPlayer } from "./SfxPlayer";
import { MockAudioContext } from "../../test/mocks/MockAudioContext";

describe("SfxPlayer", () => {
  let ctx: MockAudioContext;
  let sfx: SfxPlayer;
  const buf = { fake: "buffer", duration: 0.1 };

  beforeEach(async () => {
    ctx = new MockAudioContext();
    await ctx.resume();
    sfx = new SfxPlayer(ctx as unknown as AudioContext);
    sfx.register("clap", buf as unknown as AudioBuffer);
  });

  it("playAt agenda com start(when) exato", () => {
    sfx.playAt("clap", 1.234);
    expect(ctx.startedSources).toHaveLength(1);
    expect(ctx.startedSources[0]!.when).toBeCloseTo(1.234, 10);
    expect(ctx.startedSources[0]!.buffer).toBe(buf);
  });

  it("playNow dispara em currentTime", () => {
    ctx.currentTime = 5;
    sfx.playNow("clap");
    expect(ctx.startedSources[0]!.when).toBeLessThanOrEqual(5);
  });

  it("nome desconhecido não lança (chart não derruba áudio), mas conta erro", () => {
    expect(() => sfx.playAt("nope", 1)).not.toThrow();
    expect(ctx.startedSources).toHaveLength(0);
    expect(sfx.stats.unknownName).toBe(1);
  });

  it("NFR alocação: pool de GainNodes é criado no boot e reciclado (nunca cresce no loop)", () => {
    const created = ctx.createdGains.length; // pool inteiro no construtor
    expect(created).toBeGreaterThan(0);
    for (let i = 0; i < created * 3; i++) sfx.playAt("clap", i * 0.01);
    expect(ctx.createdGains.length).toBe(created); // zero gains novos no caminho quente
  });

  it("warmup toca com gain 0 (pré-aquece o pipeline, A8)", () => {
    sfx.warmup();
    expect(ctx.startedSources.length).toBeGreaterThan(0);
  });
});
