/** Segundos no relógio da MÚSICA (0 = beat 0 do chart, já com offset do arquivo aplicado). */
export type SongSeconds = number;
/** Segundos no relógio do AudioContext (ctx.currentTime). */
export type CtxSeconds = number;
export type Beats = number;

export interface TempoSegment {
  startBeat: Beats;
  bpm: number;
}

export interface SongMeta {
  audio: string;
  title: string;
  /** Segundos do início do ARQUIVO até o beat 0. */
  offset: number;
  /** Sempre >= 1; BPM fixo = 1 segmento { startBeat: 0, bpm }. */
  segments: TempoSegment[];
}

export type ChartEvent =
  | { kind: "sfx"; beat: Beats; name: string; variant?: string }
  | { kind: "cue"; beat: Beats; sfx?: string }
  | { kind: "expect"; beat: Beats }
  | { kind: "anim"; beat: Beats; target: string; name: string };

/** Instância runtime de um `expect`, materializada pelo core na carga. */
export interface Cue {
  id: number;
  beat: Beats;
  time: SongSeconds;
  state: "pending" | "hit" | "missed";
}

export type Verdict = "perfect" | "good" | "miss";

export interface JudgementResult {
  verdict: Verdict;
  /** null ⇒ input extra (bateu sem cue). */
  cue: Cue | null;
  /** null ⇒ miss por omissão (cue expirou). */
  inputTime: SongSeconds | null;
  /** inputTime - cue.time em ms; null se não pareou. */
  errorMs: number | null;
  early: boolean;
}

export interface JudgeWindows {
  perfectMs: number;
  goodMs: number;
}

export interface InputSample {
  time: SongSeconds;
  source: "key" | "pointer";
  code: string;
}

/** Manifesto de assets declarado no chart (DSL v2-A). Caminhos sempre em assets/. */
export interface AssetManifest {
  /** flat: nome -> caminho; com variantes: nome -> { variante -> caminho } (registra nome_variante). */
  sfx: Record<string, string | Record<string, string>>;
  /** nome do sprite -> { pose -> caminho }. */
  sprites: Record<string, Record<string, string>>;
}

export interface ChartData {
  song: SongMeta;
  windows: JudgeWindows;
  minigame: string;
  events: ChartEvent[];
  assets: AssetManifest;
}
