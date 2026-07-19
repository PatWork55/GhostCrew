import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import {
  buildGeneratedInsertPrompt
} from "@/lib/generation/generated-insert-prompts";
import type { GeneratedInsertProvider } from "@/lib/generation/generated-insert-provider";
import { GeneratedInsertProviderError } from "@/lib/generation/generated-insert-provider";
import {
  generatedInsertResultSchema,
  type GeneratedInsertResult,
  type ValidatedGeneratedInsertRequest
} from "@/lib/generation/generated-insert-schema";
import { assertSafeTask, UnsafeTaskError } from "@/lib/analysis/safety";

export class GeneratedInsertConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedInsertConfigurationError";
  }
}

export class GeneratedInsertExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedInsertExecutionError";
  }
}

type GenerateInsertDependencies = {
  imageProvider: GeneratedInsertProvider | null;
  now?: () => number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("The generated insert timed out before fal returned a result."));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function buildWarnings(request: ValidatedGeneratedInsertRequest, warnings: string[]) {
  if (request.outputType !== "video") {
    return warnings;
  }

  return [
    ...warnings,
    "Video animation is not enabled in this milestone, so GhostCrew is returning the generated image as the supplementary view."
  ];
}

export async function generateInsert(
  request: ValidatedGeneratedInsertRequest,
  dependencies: GenerateInsertDependencies
): Promise<GeneratedInsertResult> {
  const startedAt = (dependencies.now ?? Date.now)();
  const now = dependencies.now ?? Date.now;

  assertSafeTask({
    taskTitle: request.taskTitle,
    description: request.taskDescription
  });

  if (!dependencies.imageProvider) {
    throw new GeneratedInsertConfigurationError(
      "Generated inserts are unavailable because FAL_KEY is not configured."
    );
  }

  const prompt = buildGeneratedInsertPrompt(request);

  try {
    const providerResult = await withTimeout(
      dependencies.imageProvider.generate(request, prompt),
      GENERATED_INSERT_LIMITS.requestTimeoutMs
    );

    return generatedInsertResultSchema.parse({
      stepId: request.stepId,
      provider: providerResult.provider,
      imageModel: providerResult.imageModel,
      videoModel: providerResult.videoModel,
      resultType: providerResult.resultType,
      mediaUrl: providerResult.mediaUrl,
      thumbnailUrl: providerResult.thumbnailUrl,
      durationSeconds: providerResult.durationSeconds,
      width: providerResult.width,
      height: providerResult.height,
      generationPromptSummary: providerResult.generationPromptSummary,
      warnings: buildWarnings(request, providerResult.warnings),
      usage: {
        latencyMs: Math.max(0, Math.round(now() - startedAt)),
        estimatedCostUsd: providerResult.estimatedCostUsd
      }
    });
  } catch (error) {
    if (error instanceof UnsafeTaskError) {
      throw error;
    }

    throw new GeneratedInsertExecutionError(
      error instanceof GeneratedInsertProviderError || error instanceof Error
        ? error.message
        : "GhostCrew could not generate the supplementary insert."
    );
  }
}
