import type { File } from "node:buffer";
import type { DirectVideoUnderstanding } from "@/lib/production/direct-video-understanding";

export type DirectVideoUnderstandingSuccess = {
  kind: "understanding";
  provider: "fal" | "fallback";
  model: string;
  understanding: DirectVideoUnderstanding;
  warnings: string[];
  usage?: {
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type DirectVideoUnderstandingUnsafe = {
  kind: "unsafe";
  provider: "fal" | "fallback";
  model: string;
  reason: string;
};

export type DirectVideoUnderstandingProviderResult =
  | DirectVideoUnderstandingSuccess
  | DirectVideoUnderstandingUnsafe;

export interface DirectVideoUnderstandingProvider {
  understand(input: {
    videoFile: File;
    taskTitle: string;
    description?: string;
    language: string;
  }): Promise<DirectVideoUnderstandingProviderResult>;
}

export class DirectVideoUnderstandingProviderError extends Error {
  constructor(
    message: string,
    readonly provider: "fal" | "fallback"
  ) {
    super(message);
    this.name = "DirectVideoUnderstandingProviderError";
  }
}
