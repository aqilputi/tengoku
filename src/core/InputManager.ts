import type { AudioClock } from "./AudioClock";
import type { InputSample } from "./types";

export interface InputManagerOpts {
  /** Detectado no boot (A4): e.timeStamp não confiável => sempre usar o relógio atual. */
  unreliableTimestamps?: boolean;
  /** Injetável para teste; default performance.now. */
  now?: () => number;
}

/**
 * Captura input e converte timestamp para songTime (SPEC §2.3 + A4).
 * NÃO julga nada — só enfileira. Fila circular pré-alocada de 64 (NFR).
 * - keydown com e.repeat é ignorado (armadilha #6)
 * - pointerdown, nunca click (armadilha #7)
 * - sanity por evento: timestamp negativo/futuro/absurdo => performance.now()
 * - dedupe de 30ms por tecla (bounce mecânico, taiko-web)
 */
export class InputManager {
  private static readonly QUEUE = 64;
  private static readonly DEDUPE_MS = 30;

  private clock: AudioClock;
  private readonly unreliable: boolean;
  private readonly now: () => number;

  private readonly ring: InputSample[] = Array.from({ length: InputManager.QUEUE }, () => ({
    time: 0,
    source: "key" as const,
    code: "",
  }));
  private head = 0;
  private count = 0;

  private readonly lastByCode = new Map<string, number>();

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private pointerHandler: ((e: PointerEvent) => void) | null = null;
  private target: HTMLElement | Window | null = null;

  constructor(clock: AudioClock, opts: InputManagerOpts = {}) {
    this.clock = clock;
    this.unreliable = opts.unreliableTimestamps ?? false;
    this.now = opts.now ?? (() => performance.now());
  }

  /** Cada partida cria um AudioClock novo; o input precisa converter com o clock ATUAL. */
  setClock(clock: AudioClock): void {
    this.clock = clock;
    this.clear();
  }

  attach(target: HTMLElement | Window = window): void {
    this.detach();
    this.target = target;
    this.keyHandler = (e: KeyboardEvent) => this.handleKey(e.code, e.repeat, e.timeStamp);
    this.pointerHandler = (e: PointerEvent) => this.handlePointer(e.timeStamp);
    (target as Window).addEventListener("keydown", this.keyHandler as EventListener);
    (target as Window).addEventListener("pointerdown", this.pointerHandler as EventListener);
  }

  detach(): void {
    if (this.target && this.keyHandler && this.pointerHandler) {
      (this.target as Window).removeEventListener("keydown", this.keyHandler as EventListener);
      (this.target as Window).removeEventListener("pointerdown", this.pointerHandler as EventListener);
    }
    this.target = null;
    this.keyHandler = null;
    this.pointerHandler = null;
  }

  /** Sanity A4 (guard do first-input-delay) + flag do boot. */
  private saneTimestamp(tsMs: number): number {
    const nowMs = this.now();
    if (this.unreliable || tsMs > nowMs || tsMs < 0 || Math.abs(tsMs - nowMs) > 5000) return nowMs;
    return tsMs;
  }

  private push(perfMs: number, source: "key" | "pointer", code: string): void {
    const idx = (this.head + this.count) % InputManager.QUEUE;
    const slot = this.ring[idx]!;
    slot.time = this.clock.perfTimeToSongTime(perfMs);
    slot.source = source;
    slot.code = code;
    if (this.count < InputManager.QUEUE) this.count++;
    else this.head = (this.head + 1) % InputManager.QUEUE;
  }

  handleKey(code: string, repeat: boolean, timeStampMs: number): void {
    if (repeat) return;
    const ts = this.saneTimestamp(timeStampMs);
    const last = this.lastByCode.get(code);
    if (last !== undefined && ts - last < InputManager.DEDUPE_MS) return;
    this.lastByCode.set(code, ts);
    this.push(ts, "key", code);
  }

  handlePointer(timeStampMs: number): void {
    const ts = this.saneTimestamp(timeStampMs);
    const last = this.lastByCode.get("pointer");
    if (last !== undefined && ts - last < InputManager.DEDUPE_MS) return;
    this.lastByCode.set("pointer", ts);
    this.push(ts, "pointer", "pointer");
  }

  /** Drena para o array pré-alocado do chamador (mutação in-place). Retorna quantos escreveu. */
  drain(out: InputSample[]): number {
    const n = Math.min(this.count, out.length);
    for (let i = 0; i < n; i++) {
      const src = this.ring[(this.head + i) % InputManager.QUEUE]!;
      const dst = out[i]!;
      dst.time = src.time;
      dst.source = src.source;
      dst.code = src.code;
    }
    this.head = (this.head + this.count) % InputManager.QUEUE;
    this.count = 0;
    return n;
  }

  /** Descarta inputs do limbo (usado ao resumir de pause). */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
