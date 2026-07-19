import { z } from "zod";
import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import { selectedSourceVideoFrameSchema } from "@/lib/source-video";

const BASE64_IMAGE_DATA_URL_PATTERN =
  /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

export const generatedInsertStatusSchema = z.enum([
  "not_requested",
  "awaiting_confirmation",
  "uploading_reference",
  "queued",
  "generating_image",
  "generating_video",
  "completed",
  "rejected_by_user",
  "failed",
  "fallback_active"
]);

export const generatedInsertOutputTypeSchema = z.enum(["image", "video"]);

export const generatedInsertAspectRatioSchema = z.enum(
  GENERATED_INSERT_LIMITS.imageAspectRatios
);

export const generatedInsertMediaTypeSchema = z.enum(["image", "video"]);

export const generatedInsertRequestSchema = z
  .object({
    stepId: z.string().trim().min(1),
    taskTitle: z.string().trim().min(2).max(80),
    taskDescription: z.string().trim().max(500).optional(),
    sourceVideoDurationSeconds: z.number().positive(),
    stepTitle: z.string().trim().min(1).max(120),
    instruction: z.string().trim().min(1).max(240),
    viewerRisk: z.string().trim().min(1).max(240),
    evidenceFrameIds: z.array(z.string().trim().min(1)).min(1).max(10),
    intent: z.string().trim().min(3).max(GENERATED_INSERT_LIMITS.maxIntentLength),
    modelSuggestedPrompt: z.string().trim().max(280).nullable().optional(),
    sourceFrame: selectedSourceVideoFrameSchema,
    outputType: generatedInsertOutputTypeSchema.default("image"),
    aspectRatio: generatedInsertAspectRatioSchema,
    tutorialGenerationCount: z.number().int().min(0).max(10),
    acceptedInsertCount: z.number().int().min(0).max(10)
  })
  .superRefine((request, context) => {
    if (!request.evidenceFrameIds.includes(request.sourceFrame.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Frame ${request.sourceFrame.id} is not part of the selected step evidence.`,
        path: ["sourceFrame", "id"]
      });
    }

    if (request.sourceFrame.timestampSeconds > request.sourceVideoDurationSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Frame ${request.sourceFrame.id} timestamp is outside the source-video duration.`,
        path: ["sourceFrame", "timestampSeconds"]
      });
    }
  });

export type GeneratedInsertRequest = z.infer<typeof generatedInsertRequestSchema>;

export const generatedInsertResultSchema = z.object({
  stepId: z.string().min(1),
  provider: z.literal("fal"),
  imageModel: z.string().min(1),
  videoModel: z.string().min(1).nullable(),
  resultType: generatedInsertOutputTypeSchema,
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  generationPromptSummary: z.string().min(1).max(GENERATED_INSERT_LIMITS.maxPromptSummaryLength),
  warnings: z.array(z.string()),
  usage: z.object({
    latencyMs: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().nullable()
  })
});

export type GeneratedInsertResult = z.infer<typeof generatedInsertResultSchema>;

export const generatedInsertRenderStateSchema = z
  .object({
    status: generatedInsertStatusSchema,
    intent: z.string().max(GENERATED_INSERT_LIMITS.maxIntentLength),
    sourceFrameId: z.string().min(1).nullable(),
    mediaType: generatedInsertMediaTypeSchema.nullable(),
    mediaUrl: z.string().url().nullable(),
    thumbnailUrl: z.string().url().nullable(),
    durationSeconds: z.number().positive().nullable(),
    provider: z.literal("fal").nullable(),
    model: z.string().min(1).nullable(),
    warnings: z.array(z.string()),
    generationPromptSummary: z
      .string()
      .max(GENERATED_INSERT_LIMITS.maxPromptSummaryLength)
      .nullable(),
    attemptCount: z.number().int().nonnegative()
  })
  .superRefine((state, context) => {
    if (state.status === "completed") {
      if (!state.mediaType || !state.mediaUrl || !state.durationSeconds || !state.provider || !state.model) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Completed generated inserts require accepted media details.",
          path: ["mediaUrl"]
        });
      }
    }
  });

export type GeneratedInsertRenderState = z.infer<typeof generatedInsertRenderStateSchema>;

export type ValidatedGeneratedInsertRequest = GeneratedInsertRequest & {
  decodedReferenceBytes: number;
};

export function decodeGeneratedInsertImageDataUrl(imageDataUrl: string, frameId: string) {
  const match = BASE64_IMAGE_DATA_URL_PATTERN.exec(imageDataUrl.trim());

  if (!match) {
    throw new Error(`Frame ${frameId} contains a malformed image Data URL.`);
  }

  const [, mimeType, base64Payload] = match;
  const binary = Buffer.from(base64Payload, "base64");

  if (!binary.length) {
    throw new Error(`Frame ${frameId} could not be decoded from base64.`);
  }

  return {
    mimeType,
    byteLength: binary.length
  };
}

export function buildDefaultGeneratedInsertState(
  intent: string,
  sourceFrameId: string | null
): GeneratedInsertRenderState {
  return generatedInsertRenderStateSchema.parse({
    status: "fallback_active",
    intent: intent.trim().slice(0, GENERATED_INSERT_LIMITS.maxIntentLength),
    sourceFrameId,
    mediaType: null,
    mediaUrl: null,
    thumbnailUrl: null,
    durationSeconds: null,
    provider: null,
    model: null,
    warnings: [],
    generationPromptSummary: null,
    attemptCount: 0
  });
}

export function validateGeneratedInsertRequestPayload(
  rawRequest: unknown
): ValidatedGeneratedInsertRequest {
  const request = generatedInsertRequestSchema.parse(rawRequest);
  const decoded = decodeGeneratedInsertImageDataUrl(
    request.sourceFrame.imageDataUrl,
    request.sourceFrame.id
  );

  if (decoded.mimeType !== request.sourceFrame.mimeType) {
    throw new Error(
      `Frame ${request.sourceFrame.id} MIME metadata does not match its Data URL.`
    );
  }

  if (decoded.byteLength !== request.sourceFrame.byteSize) {
    throw new Error(
      `Frame ${request.sourceFrame.id} byte size metadata does not match its image payload.`
    );
  }

  if (decoded.byteLength > GENERATED_INSERT_LIMITS.maxReferenceFrameBytes) {
    throw new Error(
      `Frame ${request.sourceFrame.id} exceeds the ${Math.round(
        GENERATED_INSERT_LIMITS.maxReferenceFrameBytes / (1024 * 1024)
      )} MB reference-image limit.`
    );
  }

  return {
    ...request,
    decodedReferenceBytes: decoded.byteLength
  };
}
