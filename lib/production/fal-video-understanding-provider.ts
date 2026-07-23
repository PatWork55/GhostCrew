import { z } from "zod";
import { fal } from "@fal-ai/client";
import type { File } from "node:buffer";
import { directVideoUnderstandingSchema } from "@/lib/production/direct-video-understanding";
import { buildDirectVideoUnderstandingPrompts } from "@/lib/production/prompts";
import {
  type DirectVideoUnderstandingProvider,
  type DirectVideoUnderstandingProviderResult,
  DirectVideoUnderstandingProviderError
} from "@/lib/production/video-understanding-provider";

type FalVideoUnderstandingProviderOptions = {
  endpointId: string;
  apiKey: string;
};

type FalVideoUnderstandingUsage = {
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type FalVideoUnderstandingOutput = {
  output?: string;
  usage?: FalVideoUnderstandingUsage;
};

const looseProviderResponseSchema = z.union([
  z.object({
    status: z.literal("unsafe"),
    reason: z.string().min(1)
  }),
  z.object({
    status: z.literal("ok"),
    understanding: z.record(z.string(), z.unknown())
  })
]);

function truncateText(value: unknown, maxLength: number, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength) || fallback;
}

function clampConfidence(value: unknown, fallback = 0.5) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeEvidenceIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 10);
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength = 160) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

export function normalizeDirectVideoUnderstanding(raw: Record<string, unknown>) {
  const rawObjects = Array.isArray(raw.objects) ? raw.objects : [];
  const rawActions = Array.isArray(raw.chronologicalActions) ? raw.chronologicalActions : [];
  const normalizedObjects = rawObjects.slice(0, 20).map((object, index) => {
    const record = typeof object === "object" && object ? (object as Record<string, unknown>) : {};

    return {
      id: truncateText(record.id, 60, `object-${index + 1}`),
      name: truncateText(record.name, 120, `Object ${index + 1}`),
      description: truncateText(record.description, 240, "Visible object identified in the source clip."),
      visualEvidenceFrameIds: normalizeEvidenceIds(record.visualEvidenceFrameIds),
      confidence: clampConfidence(record.confidence, 0.6)
    };
  });
  const normalizedActions = rawActions.slice(0, 12).map((action, index) => {
    const record = typeof action === "object" && action ? (action as Record<string, unknown>) : {};
    const startTime = typeof record.startTime === "number" ? Math.max(0, record.startTime) : index;
    const endTimeValue =
      typeof record.endTime === "number" ? Math.max(startTime + 0.1, record.endTime) : startTime + 1;

    return {
      id: truncateText(record.id, 60, `action-${index + 1}`),
      title: truncateText(record.title, 120, `Action ${index + 1}`),
      startTime,
      endTime: endTimeValue,
      description: truncateText(
        record.description,
        280,
        "Visible action identified in the source clip."
      ),
      handsOrTools: normalizeStringArray(record.handsOrTools, 10, 40),
      spatialRelationship: truncateText(
        record.spatialRelationship,
        220,
        "The visible components move relative to each other."
      ),
      viewerNeedsToUnderstand: truncateText(
        record.viewerNeedsToUnderstand,
        220,
        "Understand the key movement or orientation in this moment."
      ),
      visibleIssues: normalizeStringArray(record.visibleIssues, 6, 40).filter((item) =>
        ["too_fast", "too_small", "occluded_by_hand", "poor_framing", "orientation_confusing", "needs_alternative_explainer"].includes(item)
      ),
      recommendedAlternativeVisual:
        typeof record.recommendedAlternativeVisual === "string" &&
        record.recommendedAlternativeVisual.trim()
          ? record.recommendedAlternativeVisual.trim().slice(0, 220)
          : null,
      evidenceSummary: truncateText(
        record.evidenceSummary,
        280,
        "The action is supported by visible motion in the source video."
      ),
      confidence: clampConfidence(record.confidence, 0.6)
    };
  });

  return directVideoUnderstandingSchema.parse({
    taskTitle: truncateText(raw.taskTitle, 120, "Instructional task"),
    factualSummary: truncateText(
      raw.factualSummary,
      400,
      "The source video shows a short instructional physical task."
    ),
    objects: normalizedObjects,
    chronologicalActions: normalizedActions.length
      ? normalizedActions
      : [
          {
            id: "action-1",
            title: "Visible action",
            startTime: 0,
            endTime: 1,
            description: "A visible action takes place in the source clip.",
            handsOrTools: [],
            spatialRelationship: "Visible components move relative to each other.",
            viewerNeedsToUnderstand: "Understand the main motion in this clip.",
            visibleIssues: [],
            recommendedAlternativeVisual: null,
            evidenceSummary: "The source clip contains at least one visible action.",
            confidence: 0.4
          }
        ],
    momentsTooFast: normalizeStringArray(raw.momentsTooFast, 6),
    momentsTooSmall: normalizeStringArray(raw.momentsTooSmall, 6),
    hiddenDetails: normalizeStringArray(raw.hiddenDetails, 6),
    alternativeExplanationMoments: normalizeStringArray(raw.alternativeExplanationMoments, 6),
    safetyConcerns: Array.isArray(raw.safetyConcerns)
      ? raw.safetyConcerns.slice(0, 6).flatMap((concern) => {
          const record =
            typeof concern === "object" && concern ? (concern as Record<string, unknown>) : null;

          if (!record) {
            return [];
          }

          return [
            {
              concern: truncateText(
                record.concern,
                240,
                "Potential safety concern identified in the clip."
              ),
              severity:
                record.severity === "medium" || record.severity === "high" ? record.severity : "low"
            }
          ];
        })
      : [],
    uncertaintySummary: truncateText(
      raw.uncertaintySummary,
      280,
      "Some instructional details may remain uncertain from the single camera angle."
    ),
    overallConfidence: clampConfidence(raw.overallConfidence, 0.6)
  });
}

function parseProviderOutput(rawText: string) {
  const trimmed = rawText.trim();

  try {
    return {
      repaired: false,
      payload: looseProviderResponseSchema.parse(JSON.parse(trimmed) as unknown)
    };
  } catch {
    const withoutFences = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const firstBrace = withoutFences.indexOf("{");
    const lastBrace = withoutFences.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("The direct video provider did not return parseable JSON.");
    }

    return {
      repaired: true,
      payload: looseProviderResponseSchema.parse(
        JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1)) as unknown
      )
    };
  }
}

export class FalVideoUnderstandingProvider implements DirectVideoUnderstandingProvider {
  private readonly endpointId: string;

  constructor(options: FalVideoUnderstandingProviderOptions) {
    this.endpointId = options.endpointId;
    fal.config({
      credentials: options.apiKey
    });
  }

  async understand(input: {
    videoFile: File;
    taskTitle: string;
    description?: string;
    language: string;
  }): Promise<DirectVideoUnderstandingProviderResult> {
    const { systemPrompt, userPrompt } = buildDirectVideoUnderstandingPrompts(input);

    try {
      const result = (await fal.subscribe(this.endpointId, {
        input: {
          video_url: input.videoFile,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          detailed_analysis: true
        }
      })) as { data?: FalVideoUnderstandingOutput };

      const rawOutput = result.data?.output;

      if (typeof rawOutput !== "string" || !rawOutput.trim()) {
        throw new Error("The direct video provider returned an empty payload.");
      }

      const normalized = parseProviderOutput(rawOutput);

      if (normalized.payload.status === "unsafe") {
        return {
          kind: "unsafe",
          provider: "fal",
          model: this.endpointId,
          reason: normalized.payload.reason
        };
      }

      return {
        kind: "understanding",
        provider: "fal",
        model: this.endpointId,
        understanding: normalizeDirectVideoUnderstanding(normalized.payload.understanding),
        warnings: normalized.repaired
          ? ["The direct video analysis response required one structured-output repair pass before validation."]
          : [],
        usage: {
          costUsd: result.data?.usage?.cost,
          inputTokens: result.data?.usage?.input_tokens,
          outputTokens: result.data?.usage?.output_tokens,
          totalTokens: result.data?.usage?.total_tokens
        }
      };
    } catch (error) {
      throw new DirectVideoUnderstandingProviderError(
        error instanceof Error
          ? error.message
          : "The fal direct video understanding provider failed.",
        "fal"
      );
    }
  }
}
