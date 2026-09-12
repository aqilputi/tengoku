/**
 * M5: o chart Lua dirige o jogo de ponta a ponta.
 * Sem assets de arte/música ainda: sons sintetizados + personagens em canvas.
 * ESPAÇO ou toque para responder às chamadas. F1: HUD de diagnóstico.
 */
import wasmUrl from "wasmoon/dist/glue.wasm?url"; // A5: NUNCA o default (CDN unpkg)
import musica1 from "../charts/musica1.lua?raw";
import { bootScreen } from "./ui/boot";
import { AudioClock } from "./core/AudioClock";
import { TempoMap } from "./core/TempoMap";
import { SfxPlayer } from "./core/SfxPlayer";
import { Scheduler } from "./core/Scheduler";
import { WorkerTicker } from "./core/Ticker";
import { InputManager } from "./core/InputManager";
import { Judge, cuesFromEvents } from "./core/Judge";
import { LuaHost } from "./lua/LuaHost";
import { Renderer } from "./render/Renderer";
import { ClappyScene } from "./render/minigames/clappy";
import { DiagnosticsHud } from "./debug/diagnostics";
import type { InputSample } from "./core/types";

function makeTone(ctx: AudioContext, freq: number, dur = 0.05, shape: "sine" | "noise" = "sine"): AudioBuffer {
  const len = Math.round(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = 1 - i / len;
    ch[i] =
      shape === "sine"
        ? Math.sin((2 * Math.PI * freq * i) / ctx.sampleRate) * env * 0.5
        : (Math.random() * 2 - 1) * env * env * 0.35;
  }
  return buf;
}

function fatalError(ui: HTMLElement, msg: string): void {
  const div = document.createElement("div");
  div.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background:#111;color:#ff8a80;font:16px monospace;padding:32px;white-space:pre-wrap";
  div.textContent = `erro no chart:\n\n${msg}`;
  ui.appendChild(div);
}

async function main() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;
  const renderer = new Renderer(canvas);
  renderer.start();

  const { ctx, unreliableTimestamps } = await bootScreen(ui);

  // ---- carga do chart (Lua) ----
  const host = await LuaHost.create(wasmUrl);
  const loaded = await host.loadChart(musica1);
  if (!loaded.ok) {
    fatalError(ui, loaded.error);
    return; // erro de conteúdo é fatal-amigável: nada de estado parcial
  }
  const chart = loaded.chart;

  // ---- montagem do core a partir do chart ----
  const tempoMap = new TempoMap(chart.song.offset, chart.song.segments);
  const clock = new AudioClock(ctx, tempoMap);
  const sfx = new SfxPlayer(ctx);
  sfx.register("call", makeTone(ctx, 880, 0.08));
  sfx.register("clap_clean", makeTone(ctx, 0, 0.06, "noise"));
  sfx.register("clap_weak", makeTone(ctx, 0, 0.04, "noise"));
  sfx.register("miss", makeTone(ctx, 160, 0.15));
  sfx.warmup(); // A8

  const sched = new Scheduler(clock, sfx, new WorkerTicker());
  sched.load(chart.events, tempoMap);

  const judge = new Judge(clock, chart.windows);
  judge.load(cuesFromEvents(chart.events, tempoMap));

  const input = new InputManager(clock, { unreliableTimestamps });
  input.attach(window);

  const scene = new ClappyScene();
  sched.onVisualEvent((ev) => scene.onChartEvent(ev));

  // runtime Lua -> áudio/cena (reação imediata, fora do lookahead — A2)
  host.setRuntimeHandlers({
    playSfx: (name, variant) => sfx.playNow(variant ? `${name}_${variant}` : name),
    anim: (target, name) => scene.onAnim(target, name, clock.visualBeat),
  });

  // Judge -> Lua + cena (ponto ÚNICO de entrada da Lua em runtime)
  judge.onJudgement((r) => {
    scene.onJudgement(r);
    if (r.verdict !== "miss") {
      host.notifyHit(r.verdict, r.cue!.beat);
    } else {
      if (!r.cue) scene.sadAt(clock.visualBeat); // input extra: ancora "agora"
      sfx.playNow("miss", 0.6);
      host.notifyMiss(r.cue ? r.cue.beat : tempoMap.timeToBeat(r.inputTime ?? clock.songTime));
    }
  });

  clock.start(null, 0.5); // sem música ainda; lead-in maior p/ o jogador se situar
  sched.start();

  // aba oculta => pause real (armadilha #3)
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      sched.pause();
      await clock.pause();
    } else {
      await clock.resume();
      input.clear();
      sched.resume();
    }
  });

  const hud = new DiagnosticsHud(clock, renderer, sched, judge);
  const drainBuf: InputSample[] = Array.from({ length: 64 }, () => ({
    time: 0,
    source: "key" as const,
    code: "",
  }));

  renderer.onFrame((g, w, h) => {
    const n = input.drain(drainBuf);
    for (let i = 0; i < n; i++) judge.submit(drainBuf[i]!);
    judge.update();
    scene.draw(g, w, h, clock.visualBeat, clock.visualTime);
    hud.draw(g);
  });
}

void main();
