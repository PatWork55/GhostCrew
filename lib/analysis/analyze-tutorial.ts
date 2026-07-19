import type { AnalysisResponse, ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import { analysisResponseSchema } from "@/lib/analysis-contract";
import { postProcessTutorialAnalysis } from "@/lib/analysis/post-process";
import { UnsafeTaskError, assertSafeTask, detectUnsafeAnalysisContent } from "@/lib/analysis/safety";
import type {
  VideoAnalysisProvider,
  VideoAnalysisProviderSuccess
} from "@/lib/analysis/video-analysis-provider";
import { VideoAnalysisProviderError } from "@/lib/analysis/video-analysis-provider";

export class AnalysisConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisConfigurationError";
  }
}

export class AnalysisInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisInputError";
  }
}

export class AnalysisExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisExecutionError";
  }
}

type AnalyzeTutorialDependencies = {
  realProvider: VideoAnalysisProvider | null;
  demoProvider: VideoAnalysisProvider;
  demoFallbackEnabled: boolean;
  now?: () => number;
};

function buildUsagePayload(request: ValidatedAnalysisRequest, startedAt: number, now: () => number) {
  return {
    selectedFrameCount: request.selectedFrames.length,
    aggregateImageBytes: request.aggregateImageBytes,
    latencyMs: Math.max(0, Math.round(now() - startedAt))
  };
}

function finalizeSuccessfulAnalysis(
  providerResult: VideoAnalysisProviderSuccess,
  request: ValidatedAnalysisRequest,
  startedAt: number,
  now: () => number,
  fallbackUsed: boolean,
  extraWarnings: string[]
): AnalysisResponse {
  const postProcessed = postProcessTutorialAnalysis(providerResult.analysis, request);
  const unsafeAnalysisReason = detectUnsafeAnalysisContent(postProcessed.analysis);

  if (unsafeAnalysisReason) {
    throw new UnsafeTaskError(unsafeAnalysisReason);
  }

  return analysisResponseSchema.parse({
    analysis: postProcessed.analysis,
    provider: providerResult.provider,
    model: providerResult.model,
    fallbackUsed,
    warnings: [...extraWarnings, ...providerResult.warnings, ...postProcessed.warnings],
    usage: buildUsagePayload(request, startedAt, now)
  });
}

export async function analyzeTutorial(
  request: ValidatedAnalysisRequest,
  dependencies: AnalyzeTutorialDependencies
) {
  const startedAt = (dependencies.now ?? Date.now)();
  const now = dependencies.now ?? Date.now;

  assertSafeTask(request);

  if (!dependencies.realProvider) {
    if (!dependencies.demoFallbackEnabled) {
      throw new AnalysisConfigurationError(
        "Real analysis is unavailable because FAL_KEY is not configured, and demo fallback is disabled."
      );
    }

    const demoResult = await dependencies.demoProvider.analyze(request);

    if (demoResult.kind === "unsafe") {
      throw new UnsafeTaskError(demoResult.reason);
    }

    return finalizeSuccessfulAnalysis(demoResult, request, startedAt, now, true, [
      "Using demo fallback because no FAL_KEY is configured for real AI analysis."
    ]);
  }

  try {
    const realResult = await dependencies.realProvider.analyze(request);

    if (realResult.kind === "unsafe") {
      throw new UnsafeTaskError(realResult.reason);
    }

    return finalizeSuccessfulAnalysis(realResult, request, startedAt, now, false, []);
  } catch (error) {
    if (error instanceof UnsafeTaskError) {
      throw error;
    }

    if (!dependencies.demoFallbackEnabled) {
      throw new AnalysisExecutionError(
        error instanceof Error
          ? error.message
          : "The real analysis provider failed."
      );
    }

    const demoResult = await dependencies.demoProvider.analyze(request);

    if (demoResult.kind === "unsafe") {
      throw new UnsafeTaskError(demoResult.reason);
    }

    const warning =
      error instanceof VideoAnalysisProviderError
        ? `Real AI analysis failed (${error.message}). Using demo fallback instead.`
        : "Real AI analysis failed. Using demo fallback instead.";

    return finalizeSuccessfulAnalysis(demoResult, request, startedAt, now, true, [warning]);
  }
}
