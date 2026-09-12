/**
 * Demo dos aceites M1/M2/M3: metrônomo agendado + expect em cada beat.
 * Bata ESPAÇO (ou toque) no beat; HUD (F1) mostra erro em ms de cada batida.
 */
import { bootScreen } from "./ui/boot";
import { AudioClock } from "./core/AudioClock";
import { TempoMap } from "./core/TempoMap";
import { SfxPlayer } from "./core/SfxPlayer";
import { Scheduler } from "./core/Scheduler";
import { WorkerTicker } from "./core/Ticker";
import { InputManager } from "./core/InputManager";
import { Judge, cuesFromEvents } from "./core/Judge";
import { Renderer } from "./render/Renderer";
import { DiagnosticsHud } from "./debug/diagnostics";
import type { ChartEvent, InputSample, JudgementResult } from "./core/types";

function makeClick(ctx: AudioContext, freq: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = Math.sin((2 * Math.PI * freq * i) / ctx.sampleRate) * (1 - i / len) * 0.5;
  }
  return buf;
}

async function main() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;
  const renderer = new Renderer(canvas);
  renderer.start();

  const { ctx, unreliableTimestamps } = await bootScreen(ui);

  const BPM = 120;
  const tempoMap = new TempoMap(0, [{ startBeat: 0, bpm: BPM }]);
  const clock = new AudioClock(ctx, tempoMap);
  const sfx = new SfxPlayer(ctx);
  sfx.register("tick", makeClick(ctx, 880));
  sfx.register("tock", makeClick(ctx, 1760));
  sfx.register("hit", makeClick(ctx, 2640));
  sfx.warmup();

  // chart de teste: metrônomo 3min + expect em cada beat (aceite M3)
  const events: ChartEvent[] = [];
  const totalBeats = Math.ceil((180 * BPM) / 60);
  for (let b = 0; b < totalBeats; b++) {
    events.push({ kind: "sfx", beat: b, name: b % 4 === 0 ? "tock" : "tick" });
    events.push({ kind: "expect", beat: b });
  }

  const sched = new Scheduler(clock, sfx, new WorkerTicker());
  sched.load(events, tempoMap);

  const judge = new Judge(clock, { perfectMs: 45, goodMs: 90 });
  judge.load(cuesFromEvents(events, tempoMap));

  const input = new InputManager(clock, { unreliableTimestamps });
  input.attach(window);

  // feedback audível imediato no hit (fora do lookahead — A2)
  judge.onJudgement((r: JudgementResult) => {
    if (r.verdict !== "miss") sfx.playNow("hit", r.verdict === "perfect" ? 1 : 0.5);
  });

  clock.start(null, 0.15);
  sched.start();

  // aba oculta => pause real (armadilha #3); inputs do limbo descartados
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
  let flash = 0; // pulso visual do último julgamento
  judge.onJudgement((r) => {
    flash = r.verdict === "perfect" ? 1 : r.verdict === "good" ? 0.6 : -1;
  });

  renderer.onFrame((g, w, h) => {
    // julgamento no rAF: drena input -> submit -> update
    const n = input.drain(drainBuf);
    for (let i = 0; i < n; i++) judge.submit(drainBuf[i]!);
    judge.update();

    // pulso no beat (visualBeat — offset visual, não de áudio)
    const phase = clock.visualBeat % 1;
    const r = 40 + 24 * Math.max(0, 1 - phase * 4);
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = Math.floor(clock.visualBeat) % 4 === 0 ? "#ff5252" : "#4fc3f7";
    g.fill();

    // anel de feedback do julgamento
    if (flash !== 0) {
      g.beginPath();
      g.arc(w / 2, h / 2, 80, 0, Math.PI * 2);
      g.lineWidth = 6;
      g.strokeStyle = flash > 0 ? (flash === 1 ? "#7CFC00" : "#ffd54f") : "#ff1744";
      g.stroke();
      flash *= 0.9;
      if (Math.abs(flash) < 0.05) flash = 0;
    }
    hud.draw(g);
  });
}

void main();
