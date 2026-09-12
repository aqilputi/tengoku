/**
 * Fluxo M6 (SPEC): boot -> menu -> calibração (obrigatória no 1º uso) -> jogo -> resultado.
 * ESPAÇO ou toque para responder. F1: HUD de diagnóstico.
 */
import wasmUrl from "wasmoon/dist/glue.wasm?url"; // A5: NUNCA o default (CDN unpkg)
import trioChart from "../charts/trio.lua?raw";
import { bootScreen } from "./ui/boot";
import { showMenu } from "./ui/menu";
import { runCalibration } from "./ui/calibration";
import { showResults, computeRank, type GameResult } from "./ui/results";
import { Settings } from "./core/Settings";
import { AudioClock } from "./core/AudioClock";
import { TempoMap } from "./core/TempoMap";
import { SfxPlayer } from "./core/SfxPlayer";
import { Scheduler } from "./core/Scheduler";
import { WorkerTicker } from "./core/Ticker";
import { InputManager } from "./core/InputManager";
import { Judge, cuesFromEvents } from "./core/Judge";
import { applyAutosound } from "./core/autosound";
import { LuaHost } from "./lua/LuaHost";
import { tryLoadAudio } from "./core/AssetLoader";
import { Renderer } from "./render/Renderer";
import { ClappyScene } from "./render/minigames/clappy";
import { TrioScene } from "./render/minigames/trio";
import { DiagnosticsHud } from "./debug/diagnostics";
import type { ChartData, InputSample } from "./core/types";

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

interface Session {
  ctx: AudioContext;
  ui: HTMLElement;
  renderer: Renderer;
  host: LuaHost;
  chart: ChartData;
  sfx: SfxPlayer;
  input: InputManager;
  music: AudioBuffer | null;
}

/** Uma partida completa; resolve com o resultado no fim da música. */
function playSong(s: Session, audioOffsetS: number, visualOffsetS: number): Promise<GameResult> {
  return new Promise((resolve) => {
    const tempoMap = new TempoMap(s.chart.song.offset, s.chart.song.segments);
    const clock = new AudioClock(s.ctx, tempoMap);
    clock.setUserOffsets(audioOffsetS, visualOffsetS);

    // A7: latência alta => resposta agendada, não reativa
    const { events, autosound } = applyAutosound(s.chart.events, "clap_clean", audioOffsetS);

    const sched = new Scheduler(clock, s.sfx, new WorkerTicker());
    sched.load(events, tempoMap);
    const judge = new Judge(clock, s.chart.windows);
    const cues = cuesFromEvents(events, tempoMap);
    judge.load(cues);

    const scene = s.chart.minigame === "trio" ? new TrioScene() : new ClappyScene();
    sched.onVisualEvent((ev) => scene.onChartEvent(ev));

    s.host.setRuntimeHandlers({
      playSfx: (name, variant) => {
        if (autosound && name === "clap") return; // já agendado no beat
        s.sfx.playNow(variant ? `${name}_${variant}` : name);
      },
      anim: (target, name) => scene.onAnim(target, name, clock.visualBeat),
    });

    judge.onJudgement((r) => {
      scene.onJudgement(r);
      if (r.verdict !== "miss") {
        s.host.notifyHit(r.verdict, r.cue!.beat);
      } else {
        if (!r.cue) scene.sadAt(clock.visualBeat);
        s.sfx.playNow("miss", 0.6);
        s.host.notifyMiss(r.cue ? r.cue.beat : tempoMap.timeToBeat(r.inputTime ?? clock.songTime));
      }
    });

    const lastEvent = events[events.length - 1];
    const endTime = (lastEvent ? tempoMap.beatToTime(lastEvent.beat) : 0) + 2.0;

    s.input.setClock(clock); // conversões desta partida usam ESTE clock
    clock.start(s.music, 0.5); // com música local se houver; senão só SFX agendados
    sched.start();

    const onVisibility = async () => {
      if (document.hidden) {
        sched.pause();
        await clock.pause();
      } else {
        await clock.resume();
        s.input.clear();
        sched.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const hud = new DiagnosticsHud(clock, s.renderer, sched, judge);
    const drainBuf: InputSample[] = Array.from({ length: 64 }, () => ({
      time: 0,
      source: "key" as const,
      code: "",
    }));

    let finished = false;
    s.renderer.onFrame((g, w, h) => {
      const n = s.input.drain(drainBuf);
      for (let i = 0; i < n; i++) judge.submit(drainBuf[i]!);
      judge.update();
      scene.draw(g, w, h, clock.visualBeat, clock.visualTime);
      hud.draw(g);

      if (!finished && clock.songTime >= endTime) {
        finished = true;
        sched.stop();
        document.removeEventListener("visibilitychange", onVisibility);
        const st = judge.stats;
        resolve({
          perfects: st.perfects,
          goods: st.goods,
          misses: st.omissions,
          extras: st.extras,
          medianErrorMs: st.medianErrorMs,
        });
      }
    });
  });
}

async function calibrationFlow(s: Session): Promise<number> {
  // relógio próprio da calibração (a música não está tocando)
  const tm = new TempoMap(0, [{ startBeat: 0, bpm: 100 }]);
  const clock = new AudioClock(s.ctx, tm);
  for (;;) {
    clock.start(null, 0.1);
    s.input.setClock(clock);
    const r = await runCalibration(s.ui, clock, tm, s.sfx, s.input);
    if (r.ok) return r.offsetS;
    const again = document.createElement("div");
    again.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:#111;color:#ffd54f;font:18px system-ui;cursor:pointer;text-align:center";
    again.textContent = `${r.reason} — toque para repetir`;
    s.ui.appendChild(again);
    await new Promise<void>((res) => (again.onclick = () => res()));
    again.remove();
  }
}

async function main() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;
  const renderer = new Renderer(canvas);
  renderer.start();

  const { ctx, unreliableTimestamps } = await bootScreen(ui);

  const host = await LuaHost.create(wasmUrl);
  const loaded = await host.loadChart(trioChart);
  if (!loaded.ok) {
    fatalError(ui, loaded.error);
    return;
  }

  const sfx = new SfxPlayer(ctx);
  // fallbacks sintetizados; override local em public/local/ (gitignore) tem prioridade
  const local = async (file: string) => tryLoadAudio(ctx, [`/local/${file}`]);
  sfx.register("call", makeTone(ctx, 880, 0.08));
  sfx.register("clap1", (await local("clap1.wav")) ?? makeTone(ctx, 0, 0.05, "noise"));
  sfx.register("clap2", (await local("clap2.wav")) ?? makeTone(ctx, 0, 0.04, "noise"));
  const playerClap = await local("clap_player.wav");
  sfx.register("clap_clean", playerClap ?? makeTone(ctx, 0, 0.06, "noise"));
  sfx.register("clap_weak", playerClap ?? makeTone(ctx, 0, 0.03, "noise"));
  sfx.register("miss", (await local("miss.wav")) ?? makeTone(ctx, 160, 0.15));
  const music = await tryLoadAudio(ctx, ["/local/music.webm", "/local/music.m4a", "/local/music.ogg"]);
  sfx.warmup(); // A8

  const bootClock = new AudioClock(ctx, new TempoMap(0, [{ startBeat: 0, bpm: 120 }]));
  const input = new InputManager(bootClock, { unreliableTimestamps });
  input.attach(window); // o clock real de cada tela entra via setClock()

  const session: Session = { ctx, ui, renderer, host, chart: loaded.chart, sfx, input, music };

  const settings = Settings.load();
  for (;;) {
    const choice = await showMenu(ui, settings.calibratedAt !== null, loaded.chart.song.title);
    if (choice === "calibrate" || settings.calibratedAt === null) {
      settings.audioOffsetS = await calibrationFlow(session);
      settings.calibratedAt = new Date().toISOString();
      Settings.save(settings);
    }
    const result = await playSong(session, settings.audioOffsetS, settings.visualOffsetS);
    const rank = computeRank(result, loaded.chart.events.filter((e) => e.kind === "expect").length);
    await new Promise<void>((res) => showResults(ui, result, rank, res));
  }
}

void main();
