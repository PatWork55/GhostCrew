import { fal } from "@fal-ai/client";
import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import { buildVisionAnalysisPrompts, modelProviderResponseSchema } from "@/lib/analysis/prompts";
import { tutorialAnalysisSchema } from "@/lib/tutorial-schema";
import {
  type VideoAnalysisProvider,
  type VideoAnalysisProviderResult,
  VideoAnalysisProviderError
} from "@/lib/analysis/video-analysis-provider";

type FalVideoAnalysisProviderOptions = {
  endpointId: string;
  modelId: string;
  apiKey: string;
};

type FalVisionUsage = {
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type FalVisionOutput = {
  output?: string;
  usage?: FalVisionUsage;
};

function tryParseJson(rawText: string) {
  return JSON.parse(rawText) as unknown;
}

function parseProviderOutput(rawText: string) {
  const trimmed = rawText.trim();

  try {
    return {
      repaired: false,
      payload: modelProviderResponseSchema.parse(tryParseJson(trimmed))
    };
  } catch {
    const withoutFences = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const firstBrace = withoutFences.indexOf("{");
    const lastBrace = withoutFences.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("The provider did not return parseable JSON.");
    }

    const repairedCandidate = withoutFences.slice(firstBrace, lastBrace + 1);

    return {
      repaired: true,
      payload: modelProviderResponseSchema.parse(tryParseJson(repairedCandidate))
    };
  }
}

export class FalVideoAnalysisProvider implements VideoAnalysisProvider {
  private readonly endpointId: string;
  private readonly modelId: string;

  constructor(options: FalVideoAnalysisProviderOptions) {
    this.endpointId = options.endpointId;
    this.modelId = options.modelId;
    fal.config({
      credentials: options.apiKey
    });
  }

  async analyze(request: ValidatedAnalysisRequest): Promise<VideoAnalysisProviderResult> {
    const { systemPrompt, userPrompt } = buildVisionAnalysisPrompts(request);

    try {
      const result = (await fal.subscribe(this.endpointId, {
        input: {
          model: this.modelId,
          prompt: userPrompt,
          system_prompt: systemPrompt,
          image_urls: request.selectedFrames.map((frame) => frame.imageDataUrl),
          temperature: 0.2,
          max_tokens: 2200,
          reasoning: false
        }
      })) as { data?: FalVisionOutput };
      const rawOutput = result.data?.output;

      if (typeof rawOutput !== "string" || !rawOutput.trim()) {
        throw new Error("The provider returned an empty analysis payload.");
      }

      const normalized = parseProviderOutput(rawOutput);

      if (normalized.payload.status === "unsafe") {
        return {
          kind: "unsafe",
          provider: "fal",
          model: this.modelId,
          reason: normalized.payload.reason
        };
      }

      const analysis = tutorialAnalysisSchema.parse(normalized.payload.analysis);

      return {
        kind: "analysis",
        provider: "fal",
        model: this.modelId,
        analysis,
        warnings: normalized.repaired
          ? ["The model response required one structured-output repair pass before validation."]
          : [],
        usage: {
          costUsd: result.data?.usage?.cost,
          inputTokens: result.data?.usage?.input_tokens,
          outputTokens: result.data?.usage?.output_tokens,
          totalTokens: result.data?.usage?.total_tokens
        }
      };
    } catch (error) {
      throw new VideoAnalysisProviderError(
        error instanceof Error
          ? error.message
          : "The fal analysis provider failed.",
        "fal"
      );
    }
  }
}
