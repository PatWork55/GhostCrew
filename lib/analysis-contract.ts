import { z } from "zod";
import { FRAME_EXTRACTION_LIMITS } from "@/lib/constants";
import {
  getSelectedFramesForAnalysis,
  sourceVideoMetadataSchema,
  sourceVideoSchema,
  selectedSourceVideoFrameSchema,
  type SourceVideo
} from "@/lib/source-video";

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
