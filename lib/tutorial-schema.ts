import { z } from "zod";
import { ANALYSIS_LIMITS } from "@/lib/constants";

export const treatmentSchema = z.enum([
  "keep_original",
  "crop_close_up",
  "slow_motion",
  "freeze_frame",
  "annotation",
  "generated_insert"
]);

export const tutorialStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  importance: z.enum(["high", "medium", "low"]),
  visibility: z.enum(["clear", "partial", "unclear"]),
  viewerRisk: z.string().min(1),
  treatment: treatmentSchema,
  generationPrompt: z.string().nullable(),
  evidenceFrameIds: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().min(1).max(ANALYSIS_LIMITS.maxReasoningSummaryLength)
});

export const tutorialAnalysisSchema = z.object({
  taskTitle: z.string().min(1),
  summary: z.string().min(1),
  steps: z
    .array(tutorialStepSchema)
    .min(ANALYSIS_LIMITS.minSteps)
    .max(ANALYSIS_LIMITS.maxSteps)
});

export type TutorialAnalysis = z.infer<typeof tutorialAnalysisSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type Treatment = z.infer<typeof treatmentSchema>;
