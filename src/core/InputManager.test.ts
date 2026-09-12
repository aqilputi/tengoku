import { describe, it, expect } from "vitest";
import { InputManager } from "./InputManager";
import { AudioClock } from "./AudioClock";
import { TempoMap } from "./TempoMap";
import { MockAudioContext, MockWallClock } from "../../test/mocks/MockAudioContext";
import type { InputSample } from "./types";

function setup(unreliable = false) {
  const ctx = new MockAudioContext();
  ctx.outputLatency = 0;
  const wall = new MockWallClock();
  const tm = new TempoMap(0, [{ startBeat: 0, bpm: 120 }]);
  const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
  const im = new InputManager(clock, { unreliableTimestamps: unreliable, now: wall.now });
  const start = async () => { await ctx.resume(); clock.start(null, 0); };
  const tick = (s: number) => { ctx.advance(s); wall.advance(s * 1000); };
  const out: InputSample[] = new Array(64).fill(null).map(() => ({ time: 0, source: "key" as const, code: "" }));
  return { ctx, wall, clock, im, start, tick, out };
}

describe("InputManager", () => {
  it("converte e.timeStamp para songTime e enfileira", async () => {
    const s = setup();
    await s.start();
    s.tick(2.0);
    s.im.handleKey("Space", false, s.wall.ms - 20); // apertou 20ms atrás
    const n = s.im.drain(s.out);
    expect(n).toBe(1);
    expect(s.out[0]!.time).toBeCloseTo(1.98, 6);
    expect(s.out[0]!.code).toBe("Space");
    expect(s.out[0]!.source).toBe("key");
  });

  it("ignora e.repeat (armadilha #6)", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    s.im.handleKey("Space", true, s.wall.ms);
    expect(s.im.drain(s.out)).toBe(0);
  });

  it("A4: timestamp absurdo (epoch/negativo/futuro) cai para o relógio atual", async () => {
    const s = setup();
    await s.start();
    s.tick(2.0);
    s.im.handleKey("Space", false, Date.now());          // epoch => absurdo
    s.im.handleKey("KeyA", false, -5);                    // negativo
    s.im.handleKey("KeyB", false, s.wall.ms + 999999);    // futuro
    const n = s.im.drain(s.out);
    expect(n).toBe(3);
    for (let i = 0; i < n; i++) expect(s.out[i]!.time).toBeCloseTo(2.0, 6);
  });

  it("flag unreliableTimestamps do boot ignora e.timeStamp sempre", async () => {
    const s = setup(true);
    await s.start();
    s.tick(2.0);
    s.im.handleKey("Space", false, s.wall.ms - 500); // timestamp "válido", mas flag manda ignorar
    s.im.drain(s.out);
    expect(s.out[0]!.time).toBeCloseTo(2.0, 6);
  });

  it("NFR: dedupe de 30ms por tecla (taiko-web A3) — bounce mecânico não vira input duplo", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    s.im.handleKey("Space", false, s.wall.ms);
    s.im.handleKey("Space", false, s.wall.ms + 10); // bounce 10ms depois
    s.wall.advance(10);
    expect(s.im.drain(s.out)).toBe(1);
    // tecla DIFERENTE dentro dos 30ms passa
    s.im.handleKey("KeyJ", false, s.wall.ms);
    expect(s.im.drain(s.out)).toBe(1);
    // mesma tecla depois de 30ms passa
    s.wall.advance(40);
    s.im.handleKey("Space", false, s.wall.ms);
    expect(s.im.drain(s.out)).toBe(1);
  });

  it("pointer não julga repeat nem dedupe entre pointer e tecla", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    s.im.handlePointer(s.wall.ms);
    s.im.handleKey("Space", false, s.wall.ms);
    expect(s.im.drain(s.out)).toBe(2);
  });

  it("NFR alocação: fila circular de 64 — estouro descarta o mais antigo sem crescer", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    for (let i = 0; i < 80; i++) {
      s.wall.advance(31);
      s.im.handleKey("Space", false, s.wall.ms);
    }
    expect(s.im.drain(s.out)).toBe(64);
  });

  it("clear() descarta inputs do limbo (usado no resume do pause)", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    s.im.handleKey("Space", false, s.wall.ms);
    s.im.clear();
    expect(s.im.drain(s.out)).toBe(0);
  });

  it("drain reusa o array do chamador (zero alocação no caminho quente)", async () => {
    const s = setup();
    await s.start();
    s.tick(1);
    s.im.handleKey("Space", false, s.wall.ms);
    const before = s.out[0];
    s.im.drain(s.out);
    expect(s.out[0]).toBe(before); // mesmo objeto, mutado in-place
  });
});
