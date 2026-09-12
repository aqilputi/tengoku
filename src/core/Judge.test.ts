import { describe, it, expect } from "vitest";
import { Judge, cuesFromEvents } from "./Judge";
import { TempoMap } from "./TempoMap";
import { AudioClock } from "./AudioClock";
import { MockAudioContext, MockWallClock } from "../../test/mocks/MockAudioContext";
import type { Cue, InputSample, JudgementResult } from "./types";

const WINDOWS = { perfectMs: 45, goodMs: 90 };

function cue(id: number, time: number): Cue {
  return { id, beat: time * 2, time, state: "pending" };
}

/** Judge com relógio fake: controlamos songTime diretamente. */
function setup(cues: Cue[]) {
  const ctx = new MockAudioContext();
  ctx.outputLatency = 0;
  const wall = new MockWallClock();
  const tm = new TempoMap(0, [{ startBeat: 0, bpm: 120 }]);
  const clock = new AudioClock(ctx as unknown as AudioContext, tm, wall.now);
  const results: JudgementResult[] = [];
  const judge = new Judge(clock, WINDOWS);
  judge.onJudgement((r) => results.push(r));
  judge.load(cues);
  const start = async () => {
    await ctx.resume();
    clock.start(null, 0);
  };
  const at = (t: number) => {
    // move os dois relógios até o songTime t
    const cur = clock.songTime;
    ctx.advance(t - cur);
    wall.advance((t - cur) * 1000);
  };
  const input = (t: number): InputSample => ({ time: t, source: "key", code: "Space" });
  return { judge, results, start, at, input };
}

describe("cuesFromEvents", () => {
  it("materializa expects com time pré-computado e ids sequenciais", () => {
    const tm = new TempoMap(0.5, [{ startBeat: 0, bpm: 120 }]);
    const cues = cuesFromEvents(
      [
        { kind: "cue", beat: 0 },
        { kind: "expect", beat: 2 },
        { kind: "sfx", beat: 3, name: "x" },
        { kind: "expect", beat: 4 },
      ],
      tm,
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ id: 0, beat: 2, state: "pending" });
    expect(cues[0]!.time).toBeCloseTo(0.5 + 1.0, 10);
    expect(cues[1]!.time).toBeCloseTo(0.5 + 2.0, 10);
  });
});

describe("Judge — pareamento", () => {
  it("input exato => perfect com errorMs 0", async () => {
    const s = setup([cue(0, 1.0)]);
    await s.start();
    s.at(1.0);
    s.judge.submit(s.input(1.0));
    s.judge.update();
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ verdict: "perfect", errorMs: 0, early: false });
    expect(s.results[0]!.cue!.id).toBe(0);
  });

  it("bordas: ±45ms perfect (inclusive), ±46 good, ±90 good (inclusive), ±91 extra", async () => {
    const cases: Array<[number, string, boolean]> = [
      [-0.045, "perfect", true],
      [0.045, "perfect", false],
      [-0.046, "good", true],
      [0.046, "good", false],
      [0.09, "good", false],
    ];
    for (const [err, verdict, early] of cases) {
      const s = setup([cue(0, 1.0)]);
      await s.start();
      s.at(1.2);
      s.judge.submit(s.input(1.0 + err));
      s.judge.update();
      expect(s.results[0], `err=${err}`).toMatchObject({ verdict, early });
      expect(s.results[0]!.errorMs).toBeCloseTo(err * 1000, 6);
    }
    // ±91ms: fora da janela => input extra (cue null), e o cue depois expira
    const s = setup([cue(0, 1.0)]);
    await s.start();
    s.at(1.091);
    s.judge.submit(s.input(1.091));
    s.judge.update();
    expect(s.results[0]).toMatchObject({ verdict: "miss", cue: null });
  });

  it("regra RH (SPEC §2.5/A9): input sem cue algum é punido como miss explícito", async () => {
    const s = setup([]);
    await s.start();
    s.at(0.5);
    s.judge.submit(s.input(0.5));
    s.judge.update();
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ verdict: "miss", cue: null, inputTime: 0.5 });
  });

  it("dois inputs para um cue => 1 hit + 1 extra-miss", async () => {
    const s = setup([cue(0, 1.0)]);
    await s.start();
    s.at(1.05);
    s.judge.submit(s.input(1.0));
    s.judge.submit(s.input(1.03));
    s.judge.update();
    expect(s.results).toHaveLength(2);
    expect(s.results[0]!.verdict).toBe("perfect");
    expect(s.results[1]).toMatchObject({ verdict: "miss", cue: null });
  });

  it("anti-roubo: dois cues próximos + um input => pareia com o MAIS PRÓXIMO", async () => {
    const s = setup([cue(0, 1.0), cue(1, 1.12)]);
    await s.start();
    s.at(1.1);
    s.judge.submit(s.input(1.09)); // 90ms do cue0, 30ms do cue1
    s.judge.update();
    expect(s.results[0]!.cue!.id).toBe(1);
    expect(s.results[0]!.verdict).toBe("perfect");
  });

  it("input cedo não rouba o cue seguinte se o atual ainda está na janela", async () => {
    const s = setup([cue(0, 1.0), cue(1, 1.5)]);
    await s.start();
    s.at(1.04);
    s.judge.submit(s.input(1.04)); // 40ms do cue0, 460ms do cue1
    s.judge.update();
    expect(s.results[0]!.cue!.id).toBe(0);
  });

  it("cue já acertado não pareia de novo; o segundo input casa com o próximo pendente", async () => {
    const s = setup([cue(0, 1.0), cue(1, 1.1)]);
    await s.start();
    s.at(1.1);
    s.judge.submit(s.input(1.0));
    s.judge.submit(s.input(1.09));
    s.judge.update();
    expect(s.results[0]!.cue!.id).toBe(0);
    expect(s.results[1]!.cue!.id).toBe(1);
  });
});

describe("Judge — miss por omissão", () => {
  it("cue expira como miss quando songTime passa de cue.time + goodMs (no tempo certo, não no fim)", async () => {
    const s = setup([cue(0, 1.0), cue(1, 2.0)]);
    await s.start();
    s.at(1.089);
    s.judge.update();
    expect(s.results).toHaveLength(0); // ainda dentro da janela
    s.at(1.091);
    s.judge.update();
    expect(s.results).toHaveLength(1); // expirou AGORA
    expect(s.results[0]).toMatchObject({ verdict: "miss", inputTime: null, errorMs: null });
    expect(s.results[0]!.cue!.id).toBe(0);
    expect(s.results[0]!.cue!.state).toBe("missed");
  });

  it("cue expirado não pareia com input atrasado (vira extra-miss)", async () => {
    const s = setup([cue(0, 1.0)]);
    await s.start();
    s.at(1.2);
    s.judge.update(); // expira o cue
    s.judge.submit(s.input(1.05)); // input "atrasado" chegando depois
    s.judge.update();
    expect(s.results).toHaveLength(2);
    expect(s.results[1]).toMatchObject({ verdict: "miss", cue: null });
  });
});

describe("Judge — stats e reset", () => {
  it("stats acumulam hits/misses e erro médio/mediano em ms", async () => {
    const s = setup([cue(0, 1.0), cue(1, 2.0), cue(2, 3.0)]);
    await s.start();
    s.at(1.01); s.judge.submit(s.input(1.01)); s.judge.update();  // +10ms
    s.at(2.0);  s.judge.submit(s.input(1.97)); s.judge.update();  // -30ms
    s.at(3.2);  s.judge.update();                                  // omissão
    expect(s.judge.stats.hits).toBe(2);
    expect(s.judge.stats.misses).toBe(1);
    expect(s.judge.stats.meanErrorMs).toBeCloseTo((10 - 30) / 2, 6);
    expect(s.judge.stats.medianErrorMs).toBeCloseTo(-10, 6);
  });

  it("breakdown para o rank (M6): perfects/goods/omissions/extras separados", async () => {
    const s = setup([cue(0, 1.0), cue(1, 2.0), cue(2, 3.0), cue(3, 4.0)]);
    await s.start();
    s.at(1.0);  s.judge.submit(s.input(1.0));   s.judge.update(); // perfect
    s.at(2.06); s.judge.submit(s.input(2.06));  s.judge.update(); // good (+60ms)
    s.at(2.5);  s.judge.submit(s.input(2.5));   s.judge.update(); // extra
    s.at(3.2);  s.judge.update();                                  // omissão
    s.at(4.0);  s.judge.submit(s.input(4.0));   s.judge.update(); // perfect
    expect(s.judge.stats.perfects).toBe(2);
    expect(s.judge.stats.goods).toBe(1);
    expect(s.judge.stats.omissions).toBe(1);
    expect(s.judge.stats.extras).toBe(1);
    expect(s.judge.stats.hits).toBe(3);
    expect(s.judge.stats.misses).toBe(2);
  });

  it("reset limpa estado e re-arma os cues", async () => {
    const s = setup([cue(0, 1.0)]);
    await s.start();
    s.at(1.0); s.judge.submit(s.input(1.0)); s.judge.update();
    s.judge.reset();
    expect(s.judge.stats.hits).toBe(0);
    expect(s.judge.stats.misses).toBe(0);
  });
});
