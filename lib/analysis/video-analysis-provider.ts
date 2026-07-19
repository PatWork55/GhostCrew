import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import type { TutorialAnalysis } from "@/lib/tutorial-schema";

export type VideoAnalysisProviderName = "fal" | "demo";

export type VideoAnalysisProviderUsage = {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type VideoAnalysisProviderSuccess = {
  kind: "analysis";
  provider: VideoAnalysisProviderName;
  model: string;
  analysis: TutorialAnalysis;
  warnings: string[];
  usage?: VideoAnalysisProviderUsage;
};

export type VideoAnalysisProviderUnsafe = {
  kind: "unsafe";
  provider: VideoAnalysisProviderName;
  model: string;
  reason: string;
};

export type VideoAnalysisProviderResult =
  | VideoAnalysisProviderSuccess
  | VideoAnalysisProviderUnsafe;

export interface VideoAnalysisProvider {
  analyze(request: ValidatedAnalysisRequest): Promise<VideoAnalysisProviderResult>;
}

export class VideoAnalysisProviderError extends Error {
  constructor(message: string, readonly provider: VideoAnalysisProviderName) {
    super(message);
    this.name = "VideoAnalysisProviderError";
  }
}
