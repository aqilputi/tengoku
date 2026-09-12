import { LuaFactory, type LuaEngine } from "wasmoon";
import type { AssetManifest, Beats, ChartData, ChartEvent, SongMeta, Verdict } from "../core/types";
import type { RuntimeHandlers } from "./api";

export interface ChartLoadResult {
  ok: true;
  chart: ChartData;
}
export interface ChartLoadError {
  ok: false;
  error: string;
  luaTraceback?: string;
}

/**
 * Prelúdio de sandbox (adendo A5): remove acesso a sistema, carga dinâmica de
 * código e introspecção. Executado ANTES de qualquer chart. O luacheck marca
 * esses nomes como erro no lint (.luacheckrc) — defesa em profundidade.
 */
const SANDBOX_PRELUDE = `
io = nil
os = nil
load = nil
loadfile = nil
dofile = nil
require = nil
package = nil
debug = nil
collectgarbage = nil
print = nil
string.dump = nil
`;

const MAX_CALLBACK_ERRORS = 5;

/**
 * Host do wasmoon (PLANO M4 + adendo A5).
 * - LuaFactory 1x (custo dominante = instanciar o wasm); um LuaEngine POR CHART
 * - avaliação escreve direto num builder JS (sem marshalling de tabela gigante)
 * - callbacks: try/catch sempre; circuit breaker após 5 erros — chart quebrado
 *   NUNCA derruba áudio/julgamento (regra de ouro da SPEC §3)
 * - browser: passar wasmUri de `wasmoon/dist/glue.wasm?url` — o default busca
 *   CDN unpkg (proibido); em Node (vitest) o default resolve o arquivo local
 */
export class LuaHost {
  private readonly factory: LuaFactory;
  private engine: LuaEngine | null = null;

  // builder da fase de carga
  private events: ChartEvent[] = [];
  private song: SongMeta | null = null;
  private songCalls = 0;
  private minigameName = "";
  private windowOpts: Record<string, number> = {};
  private manifest: AssetManifest = { sfx: {}, sprites: {} };
  private loadError: string | null = null;

  private onHitFn: ((judgement: string, beat: Beats) => void) | null = null;
  private onMissFn: ((beat: Beats) => void) | null = null;
  private runtime: RuntimeHandlers | null = null;

  readonly stats = { callbackErrors: 0, callbacksDisabled: false };

  private constructor(factory: LuaFactory) {
    this.factory = factory;
  }

  static async create(wasmUri?: string): Promise<LuaHost> {
    // A5: em browser, o default do LuaFactory busca o wasm no CDN unpkg em
    // runtime — proibido (offline/CSP). O bundle DEVE passar o asset ?url.
    if (!wasmUri && typeof window !== "undefined") {
      throw new Error(
        'LuaHost.create: passe o glue.wasm local (import wasmUrl from "wasmoon/dist/glue.wasm?url")',
      );
    }
    const factory = new LuaFactory(wasmUri);
    return new LuaHost(factory);
  }

  setRuntimeHandlers(handlers: RuntimeHandlers): void {
    this.runtime = handlers;
  }

  /** Registra um erro de conteúdo sem lançar (vira ChartLoadError no fim). */
  private contentError(msg: string): void {
    if (this.loadError === null) this.loadError = msg;
  }

  private requireBeat(b: unknown, ctx: string): Beats {
    if (typeof b !== "number" || !Number.isFinite(b) || b < 0) {
      this.contentError(`${ctx}: beat inválido (${String(b)})`);
      return 0;
    }
    return b;
  }

  private installDsl(lua: LuaEngine): void {
    lua.global.set("song", (t: Record<string, unknown>) => {
      this.songCalls++;
      if (this.songCalls > 1) {
        this.contentError("song{} deve ser chamado exatamente uma vez");
        return;
      }
      const audio = typeof t.audio === "string" ? t.audio : "";
      const title = typeof t.title === "string" ? t.title : "";
      const offset = typeof t.offset === "number" && Number.isFinite(t.offset) ? t.offset : NaN;
      let segments: { startBeat: number; bpm: number }[] | null = null;
      if (Array.isArray(t.segments)) {
        segments = (t.segments as { startBeat?: unknown; bpm?: unknown }[]).map((s) => ({
          startBeat: Number(s.startBeat),
          bpm: Number(s.bpm),
        }));
      } else if (typeof t.bpm === "number") {
        segments = [{ startBeat: 0, bpm: t.bpm }]; // açúcar bpm => 1 segmento
      }
      if (!audio.startsWith("assets/")) this.contentError(`song.audio deve estar em assets/ (recebido: "${audio}")`);
      if (!Number.isFinite(offset)) this.contentError("song.offset inválido");
      if (!segments || segments.length === 0) this.contentError("song precisa de bpm ou segments");
      else {
        for (const s of segments) {
          if (!Number.isFinite(s.bpm) || s.bpm <= 0) this.contentError(`bpm inválido (${s.bpm})`);
          if (!Number.isFinite(s.startBeat) || s.startBeat < 0) this.contentError("segments.startBeat inválido");
        }
      }
      this.song = { audio, title, offset, segments: segments ?? [] };
    });

    lua.global.set("minigame", (name: string) => {
      this.minigameName = String(name);
      return (opts: Record<string, number>) => {
        if (opts && typeof opts === "object") this.windowOpts = { ...opts };
      };
    });

    lua.global.set("sfx", (beat: unknown, name: unknown, variant?: unknown) => {
      const ev: ChartEvent = { kind: "sfx", beat: this.requireBeat(beat, "sfx"), name: String(name) };
      if (typeof variant === "string") ev.variant = variant;
      this.events.push(ev);
    });

    lua.global.set("cue", (beat: unknown, sfxName?: unknown) => {
      const ev: ChartEvent = { kind: "cue", beat: this.requireBeat(beat, "cue") };
      if (typeof sfxName === "string") ev.sfx = sfxName;
      this.events.push(ev);
    });

    lua.global.set("expect", (beat: unknown) => {
      this.events.push({ kind: "expect", beat: this.requireBeat(beat, "expect") });
    });

    lua.global.set("anim", (beat: unknown, target: unknown, name: unknown) => {
      // forma declarativa (3 args, fase de carga) OU runtime (2 args, dentro de callback)
      if (typeof name === "undefined") {
        this.runtime?.anim(String(beat), String(target));
        return;
      }
      this.events.push({
        kind: "anim",
        beat: this.requireBeat(beat, "anim"),
        target: String(target),
        name: String(name),
      });
    });

    lua.global.set("assets", (t: { sfx?: unknown; sprites?: unknown }) => {
      const checkPath = (p: unknown, ctx: string): string => {
        const path = String(p);
        if (!path.startsWith("assets/")) this.contentError(`${ctx}: caminho deve estar em assets/ ("${path}")`);
        return path;
      };
      const sfx: AssetManifest["sfx"] = {};
      if (t && typeof t.sfx === "object" && t.sfx !== null) {
        for (const [name, v] of Object.entries(t.sfx as Record<string, unknown>)) {
          if (typeof v === "string") sfx[name] = checkPath(v, `assets.sfx.${name}`);
          else if (v && typeof v === "object") {
            const variants: Record<string, string> = {};
            for (const [variant, p] of Object.entries(v as Record<string, unknown>)) {
              variants[variant] = checkPath(p, `assets.sfx.${name}.${variant}`);
            }
            sfx[name] = variants;
          }
        }
      }
      const sprites: AssetManifest["sprites"] = {};
      if (t && typeof t.sprites === "object" && t.sprites !== null) {
        for (const [name, poses] of Object.entries(t.sprites as Record<string, unknown>)) {
          if (poses && typeof poses === "object") {
            const out: Record<string, string> = {};
            for (const [pose, p] of Object.entries(poses as Record<string, unknown>)) {
              out[pose] = checkPath(p, `assets.sprites.${name}.${pose}`);
            }
            sprites[name] = out;
          }
        }
      }
      this.manifest = { sfx, sprites };
    });

    lua.global.set("on_hit", (fn: (judgement: string, beat: Beats) => void) => {
      this.onHitFn = fn;
    });
    lua.global.set("on_miss", (fn: (beat: Beats) => void) => {
      this.onMissFn = fn;
    });

    // runtime API (só faz sentido dentro de on_hit/on_miss)
    lua.global.set("play_sfx", (name: unknown, variant?: unknown) => {
      this.runtime?.playSfx(String(name), typeof variant === "string" ? variant : undefined);
    });
  }

  async loadChart(source: string): Promise<ChartLoadResult | ChartLoadError> {
    // estado limpo por carga; um engine POR CHART (sem vazamento entre cargas)
    this.events = [];
    this.song = null;
    this.songCalls = 0;
    this.minigameName = "";
    this.windowOpts = {};
    this.manifest = { sfx: {}, sprites: {} };
    this.loadError = null;
    this.onHitFn = null;
    this.onMissFn = null;
    this.stats.callbackErrors = 0;
    this.stats.callbacksDisabled = false;

    this.engine?.global.close();
    this.engine = null;

    let lua: LuaEngine;
    try {
      lua = await this.factory.createEngine({ functionTimeout: 50, traceAllocations: true });
      lua.global.setMemoryMax(64 * 1024 * 1024);
    } catch (e) {
      return { ok: false, error: `falha ao criar engine Lua: ${String(e)}` };
    }

    try {
      this.installDsl(lua);
      await lua.doString(SANDBOX_PRELUDE);
      await lua.doString(source);
    } catch (e) {
      lua.global.close();
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg, luaTraceback: msg };
    }

    // validação pós-carga
    if (this.songCalls === 0) this.contentError("chart sem song{}");
    if (this.loadError !== null) {
      lua.global.close();
      return { ok: false, error: this.loadError };
    }

    // ordena por beat (estável) — o Scheduler exige ordem
    this.events.sort((a, b) => a.beat - b.beat);

    const windows = {
      perfectMs: typeof this.windowOpts.janela_perfeito === "number" ? this.windowOpts.janela_perfeito * 1000 : 45,
      goodMs: typeof this.windowOpts.janela_bom === "number" ? this.windowOpts.janela_bom * 1000 : 90,
    };

    this.engine = lua; // vivo: guarda as referências de on_hit/on_miss
    return {
      ok: true,
      chart: {
        song: this.song!,
        windows,
        minigame: this.minigameName,
        events: this.events,
        assets: this.manifest,
      },
    };
  }

  /** Chamado pelo Judge. Erro é capturado, contado e — após 5 — desativa os callbacks. */
  notifyHit(verdict: Verdict, beat: Beats): void {
    if (this.stats.callbacksDisabled || !this.onHitFn) return;
    try {
      this.onHitFn(verdict, beat);
    } catch (e) {
      this.registerCallbackError(e);
    }
  }

  notifyMiss(beat: Beats): void {
    if (this.stats.callbacksDisabled || !this.onMissFn) return;
    try {
      this.onMissFn(beat);
    } catch (e) {
      this.registerCallbackError(e);
    }
  }

  private registerCallbackError(e: unknown): void {
    this.stats.callbackErrors++;
    // eslint-disable-next-line no-console
    console.warn("[LuaHost] erro em callback do chart:", e);
    if (this.stats.callbackErrors >= MAX_CALLBACK_ERRORS) {
      this.stats.callbacksDisabled = true;
      console.warn("[LuaHost] callbacks do chart desativados após erros repetidos");
    }
  }

  dispose(): void {
    this.engine?.global.close();
    this.engine = null;
  }
}
