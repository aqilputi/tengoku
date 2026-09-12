/**
 * Integração ponta-a-ponta (parte automatizável do aceite M5):
 * chart Lua real -> LuaHost -> TempoMap/Scheduler/Judge -> fim da música,
 * nos 3 cenários: gabaritando, sem tocar, esmagando input.
 */
import { describe, it, expect, beforeAll } from "vitest";
import musica1 from "../../charts/musica1.lua?raw";
import { LuaHost } from "../../src/lua/LuaHost";
import { TempoMap } from "../../src/core/TempoMap";
import { AudioClock } from "../../src/core/AudioClock";
import { SfxPlayer } from "../../src/core/SfxPlayer";
import { Scheduler } from "../../src/core/Scheduler";
import { Judge, cuesFromEvents } from "../../src/core/Judge";
import { MockAudioContext, MockWallClock } from "../mocks/MockAudioContext";
import { ManualTicker } from "../mocks/ManualTicker";
import type { ChartData } from "../../src/core/types";

let host: LuaHost;
let chart: ChartData;

beforeAll(async () => {
  host = await LuaHost.create();
  const r = await host.loadChart(musica1);
  if (!r.ok) throw new Error(r.error);
  chart = r.chart;
});

function build() {
  const ctx = new MockAudioContext();
  ctx.outputLatency = 0;
  const wall = new MockWallClock();
  const tm = new TempoMap(chart.song.offset, chart.song.segments);
  const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
  const sfx = new SfxPlayer(ctx as unknown as AudioContext);
  sfx.register("call", { duration: 0.05 } as unknown as AudioBuffer);
  const ticker = new ManualTicker();
  const sched = new Scheduler(clock, sfx, ticker, { intervalMs: 25, lookaheadS: 0.1 });
  sched.load(chart.events, tm);
  const judge = new Judge(clock, chart.windows);
  const cues = cuesFromEvents(chart.events, tm);
  judge.load(cues);

  // adapter Judge -> Lua (como no main.ts)
  const sfxCalls: string[] = [];
  const animCalls: string[] = [];
  host.setRuntimeHandlers({
    playSfx: (name, variant) => sfxCalls.push(variant ? `${name}_${variant}` : name),
    anim: (_target, name) => animCalls.push(name),
  });
  judge.onJudgement((r) => {
    if (r.verdict !== "miss") host.notifyHit(r.verdict, r.cue!.beat);
    else host.notifyMiss(r.cue ? r.cue.beat : tm.timeToBeat(r.inputTime ?? 0));
  });

  const endTime = cues[cues.length - 1]!.time + 1.0;
  return { ctx, wall, clock, sched, judge, ticker, cues, endTime, sfxCalls, animCalls, tm };
}

type World = ReturnType<typeof build>;

/** Roda o "jogo" até o fim; onStep decide os inputs. */
async function play(w: World, onStep: (songTime: number) => void) {
  await w.ctx.resume();
  w.clock.start(null, 0.15);
  w.sched.start();
  const STEP = 0.005;
  let sinceTick = 0;
  let sinceFrame = 0;
  while (w.clock.songTime < w.endTime) {
    w.ctx.advance(STEP);
    w.wall.advance(STEP * 1000);
    sinceTick += STEP;
    sinceFrame += STEP;
    if (sinceTick >= 0.025) { w.ticker.tick(); sinceTick = 0; }
    onStep(w.clock.songTime);
    if (sinceFrame >= 0.016) { w.judge.update(); sinceFrame = 0; } // rAF
  }
  w.judge.update();
}

describe("gameloop de ponta a ponta com charts/musica1.lua", () => {
  it("cenário A — jogador perfeito: todos os expects viram perfect, Lua reage a cada um", async () => {
    const w = build();
    let next = 0;
    await play(w, (t) => {
      while (next < w.cues.length && w.cues[next]!.time <= t) {
        w.judge.submit({ time: w.cues[next]!.time, source: "key", code: "Space" });
        next++;
      }
    });
    expect(w.judge.stats.hits).toBe(w.cues.length);
    expect(w.judge.stats.misses).toBe(0);
    expect(w.judge.stats.meanErrorMs).toBeCloseTo(0, 6);
    expect(w.sfxCalls.filter((s) => s === "clap_clean")).toHaveLength(w.cues.length);
    expect(w.animCalls.filter((a) => a === "bater")).toHaveLength(w.cues.length);
    // todos os cues audíveis do chart foram agendados, nenhum drop
    expect(w.sched.stats.dropped).toBe(0);
    expect(w.sched.stats.scheduled).toBe(chart.events.filter((e) => e.kind === "cue" && e.sfx).length);
  });

  it("cenário B — sem tocar em nada: todos viram miss por omissão, jogo não trava", async () => {
    const w = build();
    await play(w, () => {});
    expect(w.judge.stats.hits).toBe(0);
    expect(w.judge.stats.misses).toBe(w.cues.length);
    expect(w.animCalls.filter((a) => a === "errar")).toHaveLength(w.cues.length);
  });

  it("cenário C — esmagando input (1 a cada 50ms): sem crash, contabilidade fecha", async () => {
    const w = build();
    let results = 0;
    w.judge.onJudgement(() => results++);
    let sinceInput = 0;
    await play(w, (t) => {
      sinceInput += 0.005;
      if (sinceInput >= 0.05) {
        w.judge.submit({ time: t, source: "key", code: "Space" });
        sinceInput = 0;
      }
    });
    const st = w.judge.stats;
    // todo cue foi resolvido (hit ou miss por omissão) e todo input extra virou miss
    expect(st.hits + st.misses).toBe(results);
    expect(st.hits).toBeGreaterThan(0); // esmagar a 50ms acerta os cues (janela 90ms)
    // nenhum cue ficou pendente
    for (const c of w.cues) expect(c.state).not.toBe("pending");
  });

  it("callbacks Lua quebrados NÃO afetam julgamento (regra de ouro, chart hostil)", async () => {
    const hostileChart = `
      song { audio = "assets/audio/x.ogg", bpm = 124, offset = 0.312, title = "hostil" }
      for i = 0, 7 do expect(4 + i * 8) end
      on_miss(function(beat) error("boom") end)
    `;
    const h2 = await LuaHost.create();
    const r = await h2.loadChart(hostileChart);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ctx = new MockAudioContext();
    ctx.outputLatency = 0;
    const wall = new MockWallClock();
    const tm = new TempoMap(r.chart.song.offset, r.chart.song.segments);
    const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
    const judge = new Judge(clock, r.chart.windows);
    const cues = cuesFromEvents(r.chart.events, tm);
    judge.load(cues);
    judge.onJudgement((res) => {
      if (res.verdict === "miss") h2.notifyMiss(res.cue?.beat ?? 0);
    });
    await ctx.resume();
    clock.start(null, 0);
    const end = cues[cues.length - 1]!.time + 1;
    while (clock.songTime < end) {
      ctx.advance(0.016);
      wall.advance(16);
      judge.update();
    }
    // julgamento completo apesar do chart hostil; breaker armou em 5
    expect(judge.stats.misses).toBe(cues.length);
    expect(h2.stats.callbackErrors).toBe(5);
    expect(h2.stats.callbacksDisabled).toBe(true);
  });
});
