import { describe, it, expect, beforeEach } from "vitest";
import { AudioClock } from "./AudioClock";
import { TempoMap } from "./TempoMap";
import { MockAudioContext, MockWallClock } from "../../test/mocks/MockAudioContext";

const tm = new TempoMap(0, [{ startBeat: 0, bpm: 120 }]); // beat = 0.5s

function setup(opts?: { outputLatency?: number | undefined; baseLatency?: number }) {
  const ctx = new MockAudioContext();
  if (opts && "outputLatency" in opts) ctx.outputLatency = opts.outputLatency;
  if (opts?.baseLatency !== undefined) ctx.baseLatency = opts.baseLatency;
  const wall = new MockWallClock();
  const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
  return { ctx, wall, clock };
}

/** Avança os dois relógios em passo perfeito. */
function tickBoth(ctx: MockAudioContext, wall: MockWallClock, s: number) {
  ctx.advance(s);
  wall.advance(s * 1000);
}

describe("AudioClock", () => {
  describe("âncoras e songTime", () => {
    it("start() fixa a âncora em currentTime + leadIn", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      ctx.currentTime = 1.0;
      clock.start(null, 0.15);
      // ainda no lead-in: songTime negativo
      expect(clock.songTime).toBeLessThan(0);
      tickBoth(ctx, wall, 0.15);
      expect(clock.songTime).toBeCloseTo(0, 6);
      tickBoth(ctx, wall, 2.0);
      expect(clock.songTime).toBeCloseTo(2.0, 6);
      expect(clock.songBeat).toBeCloseTo(4.0, 6);
    });

    it("songTime desconta outputLatency (o que se OUVE agora foi agendado latency atrás)", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0.1 });
      await ctx.resume();
      clock.start(null, 0);
      tickBoth(ctx, wall, 2.0);
      expect(clock.songTime).toBeCloseTo(2.0 - 0.1, 6);
    });

    it("cadeia de fallback: outputLatency -> baseLatency -> 0", async () => {
      const a = setup({ outputLatency: 0.1, baseLatency: 0.005 });
      expect(a.clock.outputLatencyS).toBeCloseTo(0.1, 10);
      const b = setup({ outputLatency: undefined, baseLatency: 0.005 });
      expect(b.clock.outputLatencyS).toBeCloseTo(0.005, 10);
      const c = setup({ outputLatency: undefined, baseLatency: 0 });
      expect(c.clock.outputLatencyS).toBe(0);
    });

    it("audioOffset e visualOffset são aplicados separadamente", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      clock.setUserOffsets(0.05, 0.02);
      tickBoth(ctx, wall, 1.0);
      expect(clock.songTime).toBeCloseTo(1.0 - 0.05, 6);
      expect(clock.visualTime).toBeCloseTo(1.0 - 0.02, 6);
      expect(clock.songBeat).toBeCloseTo((1.0 - 0.05) / 0.5, 6);
      expect(clock.visualBeat).toBeCloseTo((1.0 - 0.02) / 0.5, 6);
    });
  });

  describe("conversões", () => {
    it("songTimeToCtxTime é âncora + t (agendamento é alinhado ao arquivo, sem offsets)", async () => {
      const { ctx, clock } = setup({ outputLatency: 0.1 });
      await ctx.resume();
      ctx.currentTime = 3.0;
      clock.start(null, 0.15);
      clock.setUserOffsets(0.05, 0);
      expect(clock.songTimeToCtxTime(0)).toBeCloseTo(3.15, 10);
      expect(clock.songTimeToCtxTime(2)).toBeCloseTo(5.15, 10);
    });

    it("perfTimeToSongTime converte timestamp de input com os mesmos descontos do songTime", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0.1 });
      await ctx.resume();
      clock.start(null, 0);
      clock.setUserOffsets(0.05, 0);
      tickBoth(ctx, wall, 2.0);
      // input AGORA deve mapear exatamente para songTime atual
      expect(clock.perfTimeToSongTime(wall.ms)).toBeCloseTo(clock.songTime, 6);
      // input 30ms atrás
      expect(clock.perfTimeToSongTime(wall.ms - 30)).toBeCloseTo(clock.songTime - 0.03, 6);
    });
  });

  describe("pause/resume (ctx.suspend congela tudo)", () => {
    it("songTime congela no pause e retoma alinhado", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      tickBoth(ctx, wall, 2.0);
      const frozen = clock.songTime;
      await clock.pause();
      // parede continua andando; áudio não
      wall.advance(5000);
      expect(clock.songTime).toBeCloseTo(frozen, 6);
      await clock.resume();
      tickBoth(ctx, wall, 1.0);
      expect(clock.songTime).toBeCloseTo(frozen + 1.0, 3);
    });

    it("re-ancora o par perf<->ctx no resume: inputs pós-resume mapeiam certo", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      tickBoth(ctx, wall, 2.0);
      await clock.pause();
      wall.advance(10_000); // 10s de pause — perf andou, ctx não
      await clock.resume();
      tickBoth(ctx, wall, 0.5);
      expect(clock.perfTimeToSongTime(wall.ms)).toBeCloseTo(clock.songTime, 3);
    });
  });

  describe("NFR: relógio granular (Android) — clock híbrido", () => {
    it("songTime é monotônico e suave mesmo com currentTime andando em degraus de 20ms", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      const samples: number[] = [];
      let ctxAccum = 0;
      for (let i = 0; i < 240; i++) {
        wall.advance(1); // parede: 1ms por iteração
        ctxAccum += 1;
        if (ctxAccum >= 20) { ctx.advance(0.02); ctxAccum = 0; } // áudio: degraus de 20ms
        samples.push(clock.songTime);
      }
      const warm = samples.slice(80); // depois do ring encher
      for (let i = 1; i < warm.length; i++) {
        const step = (warm[i]! - warm[i - 1]!) * 1000;
        expect(step).toBeGreaterThanOrEqual(0);   // nunca volta
        expect(step).toBeLessThanOrEqual(5);      // sem degraus de 20ms
      }
    });
  });

  describe("NFR: drift observável", () => {
    it("driftMs mede desvio entre parede e áudio desde a última âncora", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      // áudio roda 1ms/s mais lento que a parede
      for (let i = 0; i < 10; i++) { ctx.advance(0.999); wall.advance(1000); }
      expect(clock.driftMs).toBeCloseTo(10, 1);
    });

    it("drift ~0 quando os relógios andam juntos", async () => {
      const { ctx, wall, clock } = setup({ outputLatency: 0 });
      await ctx.resume();
      clock.start(null, 0);
      tickBoth(ctx, wall, 180); // 3 minutos
      expect(Math.abs(clock.driftMs)).toBeLessThan(0.001);
    });
  });
});
