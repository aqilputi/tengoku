import { describe, it, expect, beforeAll } from "vitest";
import { LuaHost } from "./LuaHost";
import type { ChartEvent } from "../core/types";
// vitest roda no pipeline do Vite: ?raw importa o chart como string
import musica1 from "../../charts/musica1.lua?raw";

// Um host por suite: o custo dominante é instanciar o wasm (LuaFactory 1x — A5).
let host: LuaHost;
beforeAll(async () => {
  host = await LuaHost.create();
});

const MINIMAL_SONG = `song { audio = "assets/audio/x.ogg", bpm = 120, offset = 0, title = "t" }`;

describe("LuaHost — carga do chart", () => {
  it("chart mínimo carrega com defaults (janelas 45/90, segments do bpm)", async () => {
    const r = await host.loadChart(MINIMAL_SONG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chart.song).toEqual({
      audio: "assets/audio/x.ogg",
      title: "t",
      offset: 0,
      segments: [{ startBeat: 0, bpm: 120 }],
    });
    expect(r.chart.windows).toEqual({ perfectMs: 45, goodMs: 90 });
    expect(r.chart.events).toEqual([]);
  });

  it("ACEITE M4: chart do M3 reescrito em Lua produz lista de eventos IDÊNTICA", async () => {
    // mesmo chart do demo main.ts: metrônomo + expect por beat
    const lua = `
      song { audio = "assets/audio/metronomo.ogg", bpm = 120, offset = 0, title = "Metrônomo" }
      minigame "clappy" { janela_perfeito = 0.045, janela_bom = 0.09 }
      for b = 0, 359 do
        sfx(b, b % 4 == 0 and "tock" or "tick")
        expect(b)
      end
    `;
    const expected: ChartEvent[] = [];
    for (let b = 0; b < 360; b++) {
      expected.push({ kind: "sfx", beat: b, name: b % 4 === 0 ? "tock" : "tick" });
      expected.push({ kind: "expect", beat: b });
    }
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chart.events).toEqual(expected);
    expect(r.chart.minigame).toBe("clappy");
    expect(r.chart.windows).toEqual({ perfectMs: 45, goodMs: 90 });
  });

  it("DSL completa: cue com sfx, anim, segments explícitos, eventos ordenados por beat", async () => {
    const lua = `
      song {
        audio = "assets/audio/x.ogg", offset = 0.312, title = "x",
        segments = { { startBeat = 0, bpm = 120 }, { startBeat = 8, bpm = 240 } },
      }
      anim(4, "personagem", "preparar")
      cue(2, "clap")
      cue(1)
      expect(3)
    `;
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chart.song.segments).toEqual([
      { startBeat: 0, bpm: 120 },
      { startBeat: 8, bpm: 240 },
    ]);
    expect(r.chart.events).toEqual([
      { kind: "cue", beat: 1 },
      { kind: "cue", beat: 2, sfx: "clap" },
      { kind: "expect", beat: 3 },
      { kind: "anim", beat: 4, target: "personagem", name: "preparar" },
    ]);
  });

  it("charts/musica1.lua (o chart real do repo) carrega e é válido", async () => {
    const r = await host.loadChart(musica1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chart.events.length).toBeGreaterThan(0);
    for (let i = 1; i < r.chart.events.length; i++) {
      expect(r.chart.events[i]!.beat).toBeGreaterThanOrEqual(r.chart.events[i - 1]!.beat);
    }
  });
});

describe("LuaHost — validação (erro de conteúdo nunca vira estado parcial)", () => {
  const cases: Array<[string, string]> = [
    ["sem song{}", `cue(1)`],
    ["song duas vezes", `${MINIMAL_SONG}\n${MINIMAL_SONG}`],
    ["beat negativo", `${MINIMAL_SONG}\ncue(-1)`],
    ["beat não-finito", `${MINIMAL_SONG}\ncue(0/0)`],
    ["bpm inválido", `song { audio = "assets/a.ogg", bpm = 0, offset = 0, title = "t" }`],
    ["audio fora de assets/", `song { audio = "/etc/passwd", bpm = 120, offset = 0, title = "t" }`],
    ["erro de sintaxe", `song { audio = `],
    ["erro de runtime na carga", `${MINIMAL_SONG}\nerror("chart quebrado")`],
  ];
  for (const [name, src] of cases) {
    it(name, async () => {
      const r = await host.loadChart(src);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.length).toBeGreaterThan(0);
    });
  }
});

describe("LuaHost — sandbox (A5)", () => {
  it("globals perigosos são nil dentro do chart", async () => {
    const lua = `
      local proibidos = { "io", "os", "require", "package", "load", "loadfile",
                          "dofile", "debug", "collectgarbage", "print" }
      for _, n in ipairs(proibidos) do
        if _G[n] ~= nil then error("vazou: " .. n) end
      end
      if string.dump ~= nil then error("vazou: string.dump") end
      ${MINIMAL_SONG}
    `;
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
  });

  it("stdlib segura continua disponível (math, string, table, pairs, pcall)", async () => {
    const lua = `
      assert(math.floor(1.5) == 1)
      assert(string.rep("a", 3) == "aaa")
      local t = {}; table.insert(t, 1); assert(#t == 1)
      assert(pcall(function() return 1 end))
      ${MINIMAL_SONG}
    `;
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
  });
});

describe("LuaHost — callbacks de runtime", () => {
  it("on_hit/on_miss recebem (judgement, beat) e podem chamar play_sfx/anim", async () => {
    const lua = `
      ${MINIMAL_SONG}
      on_hit(function(judgement, beat)
        play_sfx("clap", judgement == "perfect" and "clean" or "weak")
        anim("personagem", "bater")
      end)
      on_miss(function(beat)
        anim("personagem", "errar")
      end)
    `;
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
    const sfxCalls: unknown[][] = [];
    const animCalls: unknown[][] = [];
    host.setRuntimeHandlers({
      playSfx: (name, variant) => sfxCalls.push([name, variant]),
      anim: (target, name) => animCalls.push([target, name]),
    });
    host.notifyHit("perfect", 4);
    host.notifyHit("good", 5);
    host.notifyMiss(6);
    expect(sfxCalls).toEqual([["clap", "clean"], ["clap", "weak"]]);
    expect(animCalls).toEqual([["personagem", "bater"], ["personagem", "bater"], ["personagem", "errar"]]);
  });

  it("regra de ouro: erro em callback NUNCA propaga; após 5 erros o callback é desativado", async () => {
    const lua = `
      ${MINIMAL_SONG}
      on_hit(function(judgement, beat) error("callback quebrado") end)
    `;
    const r = await host.loadChart(lua);
    expect(r.ok).toBe(true);
    for (let i = 0; i < 8; i++) {
      expect(() => host.notifyHit("perfect", i)).not.toThrow();
    }
    expect(host.stats.callbackErrors).toBe(5);
    expect(host.stats.callbacksDisabled).toBe(true);
  });

  it("chart sem callbacks: notify é no-op seguro", async () => {
    const r = await host.loadChart(MINIMAL_SONG);
    expect(r.ok).toBe(true);
    expect(() => host.notifyHit("perfect", 1)).not.toThrow();
    expect(() => host.notifyMiss(1)).not.toThrow();
  });
});
