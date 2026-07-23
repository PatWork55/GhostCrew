import type { ProductionNarration, ProductionNarrationSegment } from "@/lib/production/production-plan";

export type WordTimestamp = {
  word: string;
  startSeconds: number;
  endSeconds: number;
};

export type TtsSegmentResult = {
  timelineItemId: string;
  text: string;
  voice: string;
  audioUrl: string;
  durationSeconds: number;
  wordTimestamps: WordTimestamp[];
  warnings: string[];
  usage?: {
    costUsd?: number;
    latencyMs?: number;
    characters?: number;
  };
};

export interface TtsProvider {
  synthesizeSegment(input: {
    narration: ProductionNarration;
    segment: ProductionNarrationSegment;
    previousText?: string;
    nextText?: string;
  }): Promise<TtsSegmentResult>;
}

export class TtsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsProviderError";
  }
}
