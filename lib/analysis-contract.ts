import { z } from "zod";
import { ANALYSIS_LIMITS, FRAME_EXTRACTION_LIMITS } from "@/lib/constants";
import {
  getSelectedFramesForAnalysis,
  sourceVideoMetadataSchema,
  sourceVideoSchema,
  selectedSourceVideoFrameSchema,
  type SourceVideo
} from "@/lib/source-video";
import { tutorialAnalysisSchema } from "@/lib/tutorial-schema";

export const analysisRequestSchema = z.object({
  taskTitle: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  language: z.string().trim().min(2).max(40),
  video: sourceVideoMetadataSchema,
  selectedFrames: z
    .array(selectedSourceVideoFrameSchema)
    .min(1)
    .max(FRAME_EXTRACTION_LIMITS.maxFrames)
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const analysisResponseSchema = z.object({
  analysis: tutorialAnalysisSchema,
  provider: z.enum(["fal", "demo"]),
  model: z.string().min(1),
  fallbackUsed: z.boolean(),
  warnings: z.array(z.string()),
  usage: z.object({
    selectedFrameCount: z.number().int().nonnegative(),
    aggregateImageBytes: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative()
  })
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type ValidatedAnalysisRequest = AnalysisRequest & {
  aggregateImageBytes: number;
};

type BuildAnalysisRequestInput = {
  taskTitle: string;
  description: string;
  language: string;
  sourceVideo: SourceVideo;
};

export function buildAnalysisRequest(input: BuildAnalysisRequestInput): AnalysisRequest {
  sourceVideoSchema.parse(input.sourceVideo);

  const trimmedDescription = input.description.trim();

  return analysisRequestSchema.parse({
    taskTitle: input.taskTitle.trim(),
    description: trimmedDescription ? trimmedDescription : undefined,
    language: input.language.trim(),
    video: input.sourceVideo.metadata,
    selectedFrames: getSelectedFramesForAnalysis(input.sourceVideo.frames)
  });
}

const BASE64_DATA_URL_PATTERN =
  /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

function decodeFrameDataUrl(frameId: string, imageDataUrl: string) {
  const match = BASE64_DATA_URL_PATTERN.exec(imageDataUrl.trim());

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

export function validateAnalysisRequestPayload(
  rawRequest: unknown
): ValidatedAnalysisRequest {
  const request = analysisRequestSchema.parse(rawRequest);
  let aggregateImageBytes = 0;

  for (const frame of request.selectedFrames) {
    const decoded = decodeFrameDataUrl(frame.id, frame.imageDataUrl);

    if (decoded.mimeType !== frame.mimeType) {
      throw new Error(`Frame ${frame.id} MIME metadata does not match its Data URL.`);
    }

    if (decoded.byteLength !== frame.byteSize) {
      throw new Error(`Frame ${frame.id} byte size metadata does not match its image payload.`);
    }

    if (frame.timestampSeconds > request.video.durationSeconds) {
      throw new Error(`Frame ${frame.id} timestamp is outside the source-video duration.`);
    }

    if (frame.width > 2048 || frame.height > 2048) {
      throw new Error(`Frame ${frame.id} dimensions exceed the supported review size.`);
    }

    aggregateImageBytes += frame.byteSize;
  }

  if (aggregateImageBytes > ANALYSIS_LIMITS.maxAggregateFrameBytes) {
    throw new Error(
      `Selected frames exceed the ${Math.round(
        ANALYSIS_LIMITS.maxAggregateFrameBytes / (1024 * 1024)
      )} MB aggregate payload limit.`
    );
  }

  if (
    request.selectedFrames.length < ANALYSIS_LIMITS.minSelectedFrames ||
    request.selectedFrames.length > ANALYSIS_LIMITS.maxSelectedFrames
  ) {
    throw new Error(
      `Select between ${ANALYSIS_LIMITS.minSelectedFrames} and ${ANALYSIS_LIMITS.maxSelectedFrames} frames for analysis.`
    );
  }

  return {
    ...request,
    aggregateImageBytes
  };
}
