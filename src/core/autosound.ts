import type { ChartEvent } from "./types";

/** A7 (Bemuse): acima deste offset calibrado, o SFX de resposta é AGENDADO no beat. */
export const AUTOSOUND_THRESHOLD_S = 0.01;

/**
 * Com latência alta (Bluetooth), tocar o clap no hit soa atrasado — o jogador
 * ouve o próprio acerto fora do tempo e recalibra errado. Autosound: injeta o
 * SFX de resposta como evento agendado no beat de cada expect; o caminho
 * reativo (playNow no on_hit) é suprimido pelo chamador quando autosound=true.
 */
export function applyAutosound(
  events: ChartEvent[],
  responseSfx: string,
  audioOffsetS: number,
): { events: ChartEvent[]; autosound: boolean } {
  if (audioOffsetS < AUTOSOUND_THRESHOLD_S) return { events, autosound: false };
  const out: ChartEvent[] = [];
  for (const e of events) {
    if (e.kind === "expect") out.push({ kind: "sfx", beat: e.beat, name: responseSfx });
    out.push(e);
  }
  return { events: out, autosound: true };
}
