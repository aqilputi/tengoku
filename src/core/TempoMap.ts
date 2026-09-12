import type { Beats, SongSeconds, TempoSegment } from "./types";

/**
 * Mapa de tempo beat <-> segundos. Puro, sem estado de áudio (SPEC §2.2).
 * Sempre lista de segmentos, mesmo com BPM fixo — reescrever depois é caro.
 */
export class TempoMap {
  private readonly offset: number;
  private readonly segments: readonly TempoSegment[];
  /** Tempo acumulado (sem offset) no início de cada segmento. Pré-computado na carga. */
  private readonly segmentStartTimes: readonly number[];

  constructor(offset: number, segments: TempoSegment[]) {
    if (!Number.isFinite(offset)) throw new Error("TempoMap: offset inválido");
    if (segments.length === 0) throw new Error("TempoMap: precisa de >= 1 segmento");
    const first = segments[0]!;
    if (first.startBeat !== 0) throw new Error("TempoMap: primeiro segmento deve começar no beat 0");
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      if (!Number.isFinite(s.bpm) || s.bpm <= 0) throw new Error(`TempoMap: bpm inválido no segmento ${i}`);
      if (i > 0 && s.startBeat <= segments[i - 1]!.startBeat) {
        throw new Error("TempoMap: segmentos devem ser estritamente crescentes em startBeat");
      }
    }
    this.offset = offset;
    this.segments = segments.map((s) => ({ ...s }));
    const starts = new Array<number>(segments.length);
    starts[0] = 0;
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1]!;
      starts[i] = starts[i - 1]! + (segments[i]!.startBeat - prev.startBeat) * (60 / prev.bpm);
    }
    this.segmentStartTimes = starts;
  }

  /** Índice do segmento que contém o beat b (último com startBeat <= b; beats negativos caem no 0). */
  private segmentIndexForBeat(b: Beats): number {
    let i = this.segments.length - 1;
    while (i > 0 && this.segments[i]!.startBeat > b) i--;
    return i;
  }

  private segmentIndexForTime(tNoOffset: number): number {
    let i = this.segments.length - 1;
    while (i > 0 && this.segmentStartTimes[i]! > tNoOffset) i--;
    return i;
  }

  beatToTime(b: Beats): SongSeconds {
    const i = this.segmentIndexForBeat(b);
    const seg = this.segments[i]!;
    return this.offset + this.segmentStartTimes[i]! + (b - seg.startBeat) * (60 / seg.bpm);
  }

  timeToBeat(t: SongSeconds): Beats {
    const tn = t - this.offset;
    const i = this.segmentIndexForTime(tn);
    const seg = this.segments[i]!;
    return seg.startBeat + (tn - this.segmentStartTimes[i]!) * (seg.bpm / 60);
  }

  /** Duração de 1 beat no segmento que contém `b` (para animações). */
  beatDuration(b: Beats): number {
    return 60 / this.segments[this.segmentIndexForBeat(b)]!.bpm;
  }
}
