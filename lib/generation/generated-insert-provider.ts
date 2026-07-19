import type {
  GeneratedInsertResult,
  ValidatedGeneratedInsertRequest
} from "@/lib/generation/generated-insert-schema";

export type GeneratedInsertProviderPrompt = {
  systemPrompt: string;
  userPrompt: string;
  promptSummary: string;
};

export type GeneratedInsertProviderSuccess = Omit<
  GeneratedInsertResult,
  "stepId" | "usage"
> & {
  warnings: string[];
  estimatedCostUsd: number | null;
};

export interface GeneratedInsertProvider {
  generate(
    request: ValidatedGeneratedInsertRequest,
    prompt: GeneratedInsertProviderPrompt
  ): Promise<GeneratedInsertProviderSuccess>;
}

export class GeneratedInsertProviderError extends Error {
  constructor(message: string, readonly provider: "fal") {
    super(message);
    this.name = "GeneratedInsertProviderError";
  }
}
