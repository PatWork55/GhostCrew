import { z } from "zod";

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
  generationPrompt: z.string().nullable()
});

export const tutorialAnalysisSchema = z.object({
  taskTitle: z.string().min(1),
  summary: z.string().min(1),
  steps: z.array(tutorialStepSchema).min(3).max(6)
});

export const analysisRequestSchema = z.object({
  taskTitle: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  language: z.string().trim().min(2).max(40),
  video: z.object({
    name: z.string().min(1),
    size: z.number().int().positive(),
    type: z.string().min(1),
    durationSeconds: z.number().positive()
  })
});

export type TutorialAnalysis = z.infer<typeof tutorialAnalysisSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type Treatment = z.infer<typeof treatmentSchema>;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
