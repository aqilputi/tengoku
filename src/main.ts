/**
 * Demo do aceite M1/M2: metrônomo agendado (sem música ainda) + HUD.
 * Clique de metrônomo sintetizado — sem asset, valida o relógio puro.
 */
import { bootScreen } from "./ui/boot";
import { AudioClock } from "./core/AudioClock";
import { TempoMap } from "./core/TempoMap";
import { SfxPlayer } from "./core/SfxPlayer";
import { Scheduler } from "./core/Scheduler";
import { WorkerTicker } from "./core/Ticker";
import { Renderer } from "./render/Renderer";
import { DiagnosticsHud } from "./debug/diagnostics";
import type { ChartEvent } from "./core/types";

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

  const { ctx } = await bootScreen(ui);

  // metrônomo: 3 minutos a 120 BPM, acento a cada 4 beats (aceite M1)
  const BPM = 120;
  const tempoMap = new TempoMap(0, [{ startBeat: 0, bpm: BPM }]);
  const clock = new AudioClock(ctx, tempoMap);
  const sfx = new SfxPlayer(ctx);
  sfx.register("tick", makeClick(ctx, 880));
  sfx.register("tock", makeClick(ctx, 1760));
  sfx.warmup();

  const events: ChartEvent[] = [];
  const totalBeats = Math.ceil((180 * BPM) / 60);
  for (let b = 0; b < totalBeats; b++) {
    events.push({ kind: "sfx", beat: b, name: b % 4 === 0 ? "tock" : "tick" });
  }

  const sched = new Scheduler(clock, sfx, new WorkerTicker());
  sched.load(events, tempoMap);
  clock.start(null, 0.15);
  sched.start();

  // aba oculta => pause real (armadilha #3)
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { sched.pause(); await clock.pause(); }
    else { await clock.resume(); sched.resume(); }
  });

  const hud = new DiagnosticsHud(clock, renderer, sched);
  renderer.onFrame((g, w, h) => {
    // pulso visual no beat (usa visualBeat — offset visual, não de áudio)
    const phase = clock.visualBeat % 1;
    const r = 40 + 24 * Math.max(0, 1 - phase * 4);
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = Math.floor(clock.visualBeat) % 4 === 0 ? "#ff5252" : "#4fc3f7";
    g.fill();
    hud.draw(g);
  });
}

void main();
