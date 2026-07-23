import { z } from "zod";
import { ANALYSIS_LIMITS } from "@/lib/constants";

export const directVideoVisibleIssueSchema = z.enum([
  "too_fast",
  "too_small",
  "occluded_by_hand",
  "poor_framing",
  "orientation_confusing",
  "needs_alternative_explainer"
]);

export const directVideoObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).max(240),
  visualEvidenceFrameIds: z.array(z.string().min(1)).max(ANALYSIS_LIMITS.maxSelectedFrames),
  confidence: z.number().min(0).max(1)
});

export const directVideoActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  description: z.string().min(1).max(280),
  handsOrTools: z.array(z.string().min(1)).max(10),
  spatialRelationship: z.string().min(1).max(220),
  viewerNeedsToUnderstand: z.string().min(1).max(220),
  visibleIssues: z.array(directVideoVisibleIssueSchema).max(6),
  recommendedAlternativeVisual: z.string().max(220).nullable(),
  evidenceSummary: z.string().min(1).max(ANALYSIS_LIMITS.maxReasoningSummaryLength),
  confidence: z.number().min(0).max(1)
});

export const directVideoSafetyConcernSchema = z.object({
  concern: z.string().min(1).max(240),
  severity: z.enum(["low", "medium", "high"])
});

export const directVideoUnderstandingSchema = z.object({
  taskTitle: z.string().min(1),
  factualSummary: z.string().min(1).max(400),
  objects: z.array(directVideoObjectSchema).max(20),
  chronologicalActions: z.array(directVideoActionSchema).min(1).max(12),
  momentsTooFast: z.array(z.string().min(1)).max(6),
  momentsTooSmall: z.array(z.string().min(1)).max(6),
  hiddenDetails: z.array(z.string().min(1)).max(6),
  alternativeExplanationMoments: z.array(z.string().min(1)).max(6),
  safetyConcerns: z.array(directVideoSafetyConcernSchema).max(6),
  uncertaintySummary: z.string().min(1).max(280),
  overallConfidence: z.number().min(0).max(1)
});

export type DirectVideoUnderstanding = z.infer<typeof directVideoUnderstandingSchema>;
export type DirectVideoAction = z.infer<typeof directVideoActionSchema>;
export type DirectVideoObject = z.infer<typeof directVideoObjectSchema>;
