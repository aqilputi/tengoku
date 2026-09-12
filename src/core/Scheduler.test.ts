import { describe, it, expect } from "vitest";
import { Scheduler } from "./Scheduler";
import { SfxPlayer } from "./SfxPlayer";
import { AudioClock } from "./AudioClock";
import { TempoMap } from "./TempoMap";
import { MockAudioContext, MockWallClock } from "../../test/mocks/MockAudioContext";
import { ManualTicker } from "../../test/mocks/ManualTicker";
import type { ChartEvent } from "./types";

// 480 BPM => beat = 0.125s => 8 SFX/s (aceite M2)
const tm = new TempoMap(0, [{ startBeat: 0, bpm: 480 }]);

function setup() {
  const ctx = new MockAudioContext();
  ctx.outputLatency = 0;
  const wall = new MockWallClock();
  const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
  const sfx = new SfxPlayer(ctx as unknown as AudioContext);
  sfx.register("clap", { duration: 0.05 } as unknown as AudioBuffer);
  const ticker = new ManualTicker();
  const sched = new Scheduler(clock, sfx, ticker, { intervalMs: 25, lookaheadS: 0.1 });
  return { ctx, wall, clock, sfx, ticker, sched };
}

function sfxEvents(n: number): ChartEvent[] {
  const evs: ChartEvent[] = [];
  for (let i = 0; i < n; i++) evs.push({ kind: "sfx", beat: i, name: "clap" });
  return evs;
}

const LEAD = 0.15; // lead-in de produção: beat 0 nunca nasce no passado

async function begin(s: ReturnType<typeof setup>) {
  await s.ctx.resume();
  s.clock.start(null, LEAD);
  s.sched.start();
}

/** Simula o mundo real: relógios andam juntos, ticker dispara a cada intervalMs. */
function run(s: ReturnType<typeof setup>, seconds: number, tickMs = 25) {
  const steps = Math.round((seconds * 1000) / tickMs);
  for (let i = 0; i < steps; i++) {
    s.ctx.advance(tickMs / 1000);
    s.wall.advance(tickMs);
    s.ticker.tick();
  }
}

describe("Scheduler", () => {
  it("agenda cada evento EXATAMENTE uma vez, com when correto e no futuro", async () => {
    const s = setup();
    s.sched.load(sfxEvents(16), tm); // 2s de chart a 8/s
    await begin(s);
    run(s, 2.5);
    expect(s.ctx.startedSources).toHaveLength(16);
    const whens = s.ctx.startedSources.map((x) => x.when).sort((a, b) => a - b);
    for (let i = 0; i < 16; i++) {
      expect(whens[i]).toBeCloseTo(LEAD + i * 0.125, 9); // when exato no relógio ctx
    }
    for (const src of s.ctx.startedSources) {
      // NFR: nunca agendar no passado
      expect(src.when).toBeGreaterThanOrEqual(src.scheduledAtCtxTime);
    }
  });

  it("NFR lag: tick atrasado de 300ms (> lookahead) não pula nem duplica eventos", async () => {
    const s = setup();
    s.sched.load(sfxEvents(16), tm);
    await begin(s);
    run(s, 0.5); // normal até 0.5s
    // stall de 300ms sem ticks (GC/jank), relógios continuam andando
    s.ctx.advance(0.3);
    s.wall.advance(300);
    run(s, 1.7); // retoma
    expect(s.ctx.startedSources.length + s.sched.stats.dropped).toBe(16);
    const whens = s.ctx.startedSources.map((x) => x.when);
    expect(new Set(whens).size).toBe(whens.length); // sem duplicata
  });

  it("NFR lag: evento cujo when já passou é DROPADO com contagem, nunca tocado atrasado (A2)", async () => {
    const s = setup();
    s.sched.load(sfxEvents(8), tm);
    await begin(s);
    // stall gigante: 0.6s se passam sem nenhum tick
    s.ctx.advance(0.6);
    s.wall.advance(600);
    s.ticker.tick();
    // eventos de 0..0.5s já passaram => dropados; nenhum agendado no passado
    for (const src of s.ctx.startedSources) {
      expect(src.when).toBeGreaterThanOrEqual(src.scheduledAtCtxTime);
    }
    expect(s.sched.stats.dropped).toBeGreaterThan(0);
    expect(s.ctx.startedSources.length + s.sched.stats.dropped).toBe(
      s.ctx.startedSources.length + s.sched.stats.dropped,
    );
    run(s, 1.5);
    expect(s.ctx.startedSources.length + s.sched.stats.dropped).toBe(8);
  });

  it("pause: cursor congela; resume: retoma sem re-agendar o que já foi", async () => {
    const s = setup();
    s.sched.load(sfxEvents(16), tm);
    await begin(s);
    run(s, 0.5);
    const scheduledBefore = s.ctx.startedSources.length;
    s.sched.pause();
    await s.clock.pause();
    // parede anda durante o pause; áudio não
    s.wall.advance(3000);
    s.ticker.tick(); // tick espúrio durante pause não faz nada
    expect(s.ctx.startedSources.length).toBe(scheduledBefore);
    await s.clock.resume();
    s.sched.resume();
    run(s, 2.0);
    expect(s.ctx.startedSources).toHaveLength(16);
    const whens = s.ctx.startedSources.map((x) => x.when);
    expect(new Set(whens).size).toBe(16);
  });

  it("eventos visuais (cue/anim) vão pra fila visual, não pro áudio (a menos que cue tenha sfx)", async () => {
    const s = setup();
    const evs: ChartEvent[] = [
      { kind: "cue", beat: 0, sfx: "clap" },
      { kind: "cue", beat: 1 },
      { kind: "anim", beat: 2, target: "p", name: "idle" },
      { kind: "expect", beat: 3 },
    ];
    const visual: ChartEvent[] = [];
    s.sched.onVisualEvent((e) => visual.push(e));
    s.sched.load(evs, tm);
    await begin(s);
    run(s, 1.0);
    expect(s.ctx.startedSources).toHaveLength(1); // só o cue com sfx
    // cue e anim são visuais; expect não vira evento visual (é cue de julgamento)
    expect(visual.filter((e) => e.kind === "cue")).toHaveLength(2);
    expect(visual.filter((e) => e.kind === "anim")).toHaveLength(1);
  });

  it("NFR aceite M2: 8 SFX/s por 30s — todos agendados, nenhum drop, nenhum no passado", async () => {
    const s = setup();
    s.sched.load(sfxEvents(240), tm);
    await begin(s);
    run(s, 31);
    expect(s.ctx.startedSources).toHaveLength(240);
    expect(s.sched.stats.dropped).toBe(0);
    for (const src of s.ctx.startedSources) {
      expect(src.when).toBeGreaterThanOrEqual(src.scheduledAtCtxTime);
    }
  });

  it("exige eventos ordenados por beat no load", async () => {
    const s = setup();
    expect(() =>
      s.sched.load([{ kind: "sfx", beat: 2, name: "clap" }, { kind: "sfx", beat: 1, name: "clap" }], tm),
    ).toThrow();
  });
});
