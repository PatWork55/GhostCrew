import { z } from "zod";
import {
  FRAME_EXTRACTION_LIMITS,
  SUPPORTED_VIDEO_TYPES,
  VIDEO_DURATION_RANGE,
  VIDEO_UPLOAD_LIMITS
} from "@/lib/constants";

const supportedVideoTypeSchema = z.enum(SUPPORTED_VIDEO_TYPES);

export const sourceVideoMetadataSchema = z.object({
  fileName: z.string().min(1),
  mimeType: supportedVideoTypeSchema,
  fileSizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  aspectRatioLabel: z.string().min(3)
});

export const sourceVideoFrameSchema = z.object({
  id: z.string().min(1),
  timestampSeconds: z.number().min(0),
  imageDataUrl: z.string().startsWith("data:image/"),
  mimeType: z.enum(["image/webp", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  isSelected: z.boolean()
});

export const selectedSourceVideoFrameSchema = sourceVideoFrameSchema.omit({
  isSelected: true
});

export const sourceVideoSchema = z.object({
  metadata: sourceVideoMetadataSchema,
  frames: z.array(sourceVideoFrameSchema).max(FRAME_EXTRACTION_LIMITS.maxFrames)
});

export type SourceVideoMetadata = z.infer<typeof sourceVideoMetadataSchema>;
export type SourceVideoFrame = z.infer<typeof sourceVideoFrameSchema>;
export type SelectedSourceVideoFrame = z.infer<typeof selectedSourceVideoFrameSchema>;
export type SourceVideo = z.infer<typeof sourceVideoSchema>;

type SourceVideoMetadataInput = {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
};

type UploadLike = {
  name: string;
  type: string;
  size: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToPrecision(value: number, precision = 3) {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left || 1;
}

export function formatAspectRatioLabel(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);

  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function normalizeSourceVideoMetadata(
  input: SourceVideoMetadataInput
): SourceVideoMetadata {
  return sourceVideoMetadataSchema.parse({
    fileName: input.fileName.trim(),
    mimeType: input.mimeType,
    fileSizeBytes: Math.round(input.fileSizeBytes),
    durationSeconds: roundToPrecision(input.durationSeconds),
    width: Math.round(input.width),
    height: Math.round(input.height),
    aspectRatio: roundToPrecision(input.width / input.height, 4),
    aspectRatioLabel: formatAspectRatioLabel(input.width, input.height)
  });
}

export function getTargetFrameCount(durationSeconds: number) {
  return clamp(
    Math.round(durationSeconds / 5),
    FRAME_EXTRACTION_LIMITS.minFrames,
    FRAME_EXTRACTION_LIMITS.maxFrames
  );
}

export function generateFrameCaptureTimestamps(durationSeconds: number, frameCount?: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Video duration must be a positive number.");
  }

  const safeFrameCount = clamp(
    frameCount ?? getTargetFrameCount(durationSeconds),
    FRAME_EXTRACTION_LIMITS.minFrames,
    FRAME_EXTRACTION_LIMITS.maxFrames
  );
  const edgeOffset = Math.min(0.35, durationSeconds * 0.05);
  const startTime = roundToPrecision(edgeOffset);
  const endTime = roundToPrecision(Math.max(startTime, durationSeconds - edgeOffset));

  if (safeFrameCount === 1) {
    return [startTime];
  }

  const span = endTime - startTime;

  return Array.from({ length: safeFrameCount }, (_, index) => {
    const progress = index / (safeFrameCount - 1);

    return roundToPrecision(startTime + span * progress);
  });
}

export function getSelectedFramesForAnalysis(
  frames: SourceVideoFrame[]
): SelectedSourceVideoFrame[] {
  return frames.filter((frame) => frame.isSelected).map((frame) => ({
    id: frame.id,
    timestampSeconds: frame.timestampSeconds,
    imageDataUrl: frame.imageDataUrl,
    mimeType: frame.mimeType,
    width: frame.width,
    height: frame.height,
    byteSize: frame.byteSize
  }));
}

export function validateSourceVideoUpload(upload: UploadLike) {
  if (!SUPPORTED_VIDEO_TYPES.includes(upload.type as (typeof SUPPORTED_VIDEO_TYPES)[number])) {
    return "Only MP4 and WebM files are supported in this MVP.";
  }

  if (upload.size > VIDEO_UPLOAD_LIMITS.maxBytes) {
    return `Video is too large. Keep uploads under ${Math.round(
      VIDEO_UPLOAD_LIMITS.maxBytes / (1024 * 1024)
    )} MB.`;
  }

  return null;
}

export function validateSourceVideoMetadata(metadata: SourceVideoMetadata) {
  if (metadata.durationSeconds < VIDEO_DURATION_RANGE.minSeconds) {
    return `Video is too short. Use at least ${VIDEO_DURATION_RANGE.minSeconds} seconds.`;
  }

  if (metadata.durationSeconds > VIDEO_DURATION_RANGE.maxSeconds) {
    return `Video is too long. Keep it under ${VIDEO_DURATION_RANGE.maxSeconds} seconds.`;
  }

  return null;
}
