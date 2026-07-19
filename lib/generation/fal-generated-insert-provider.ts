import { fal } from "@fal-ai/client";
import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import type {
  GeneratedInsertProvider,
  GeneratedInsertProviderPrompt,
  GeneratedInsertProviderSuccess
} from "@/lib/generation/generated-insert-provider";
import {
  GeneratedInsertProviderError
} from "@/lib/generation/generated-insert-provider";
import type { ValidatedGeneratedInsertRequest } from "@/lib/generation/generated-insert-schema";

type FalGeneratedInsertProviderOptions = {
  endpointId: string;
  modelId: string;
  apiKey: string;
};

type FalImageOutput = {
  url?: string;
  content_type?: string;
  file_name?: string;
  width?: number | null;
  height?: number | null;
};

type FalImageEditOutput = {
  images?: FalImageOutput[];
  description?: string;
};

function estimateImageCostUsd() {
  return 0.08;
}

export class FalGeneratedInsertProvider implements GeneratedInsertProvider {
  private readonly endpointId: string;
  private readonly modelId: string;

  constructor(options: FalGeneratedInsertProviderOptions) {
    this.endpointId = options.endpointId;
    this.modelId = options.modelId;
    fal.config({
      credentials: options.apiKey
    });
  }

  async generate(
    request: ValidatedGeneratedInsertRequest,
    prompt: GeneratedInsertProviderPrompt
  ): Promise<GeneratedInsertProviderSuccess> {
    try {
      const result = (await fal.subscribe(this.endpointId, {
        input: {
          prompt: prompt.userPrompt,
          system_prompt: prompt.systemPrompt,
          image_urls: [request.sourceFrame.imageDataUrl],
          num_images: 1,
          aspect_ratio: request.aspectRatio,
          output_format: GENERATED_INSERT_LIMITS.imageOutputFormat,
          resolution: GENERATED_INSERT_LIMITS.imageResolution,
          safety_tolerance: "2",
          limit_generations: true
        },
        logs: true
      })) as { data?: FalImageEditOutput };

      const image = result.data?.images?.[0];

      if (!image?.url) {
        throw new Error("The image-edit provider did not return a usable media URL.");
      }

      return {
        provider: "fal",
        imageModel: this.modelId,
        videoModel: null,
        resultType: "image",
        mediaUrl: image.url,
        thumbnailUrl: image.url,
        durationSeconds: GENERATED_INSERT_LIMITS.defaultImageDisplayDurationSeconds,
        width: image.width ?? null,
        height: image.height ?? null,
        generationPromptSummary: prompt.promptSummary,
        warnings: [],
        estimatedCostUsd: estimateImageCostUsd()
      };
    } catch (error) {
      throw new GeneratedInsertProviderError(
        error instanceof Error
          ? error.message
          : "The fal generated-insert provider failed.",
        "fal"
      );
    }
  }
}
