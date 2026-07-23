import { z } from "zod";
import { directVideoUnderstandingSchema } from "@/lib/production/direct-video-understanding";
import { NARRATION_LIMITS } from "@/lib/constants";

const mediaUrlSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/") || URL.canParse(value), {
    message: "Media URLs must be absolute URLs or internal application paths."
  });

export const productionStrategySchema = z.enum([
  "keep_original",
  "static_crop",
  "tracked_zoom",
  "slow_motion",
  "freeze_frame",
  "annotation_overlay",
  "video_to_video_edit",
  "generated_object_explainer",
  "generated_diagram_explainer",
  "generated_context_insert",
  "multi_pass_composite"
]);

export const productionMediaAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["video", "image"]),
  source: z.enum(["original", "deterministic", "generated"]),
  fileName: z.string().min(1),
  mediaUrl: mediaUrlSchema.nullable(),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mimeType: z.string().min(1),
  originSegmentId: z.string().min(1).nullable(),
  createdBy: z.string().min(1),
  warnings: z.array(z.string())
});

export const productionCandidateRunSchema = z.object({
  id: z.string().min(1),
  parentCandidateId: z.string().min(1).nullable(),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(["queued", "completed", "failed", "rejected", "accepted"]),
  safePromptSummary: z.string().min(1).max(280),
  mediaAssetId: z.string().min(1).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  warnings: z.array(z.string())
});

export const productionVisualFactSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(220),
  source: z.enum(["source", "generated", "inferred"]),
  confidence: z.number().min(0).max(1)
});

export const productionSegmentSchema = z.object({
  id: z.string().min(1),
  stepId: z.string().min(1),
  stepNumber: z.number().int().positive(),
  title: z.string().min(1),
  sourceStartTime: z.number().min(0),
  sourceEndTime: z.number().min(0),
  factualAction: z.string().min(1).max(280),
  pedagogicalGoal: z.string().min(1).max(240),
  viewerDifficulty: z.string().min(1).max(240),
  sourceEvidenceFrameIds: z.array(z.string().min(1)).min(1),
  selectedStrategy: productionStrategySchema,
  candidateRuns: z.array(productionCandidateRunSchema),
  acceptedAsset: productionMediaAssetSchema.nullable(),
  fallbackAsset: productionMediaAssetSchema.nullable(),
  visualFactsForNarration: z.array(productionVisualFactSchema),
  outputStartTime: z.number().min(0),
  outputEndTime: z.number().min(0),
  playbackRate: z.number().positive().default(1),
  generatedLabelRequired: z.boolean(),
  uncertainties: z.array(z.string()),
  reasoningSummary: z.string().min(1).max(240)
});

export const finalTimelineItemSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  assetId: z.string().min(1),
  classification: z.enum(["original", "deterministic", "generated"]),
  mediaType: z.enum(["video", "image"]),
  mediaUrl: mediaUrlSchema.nullable(),
  durationSeconds: z.number().positive(),
  outputStartTime: z.number().min(0),
  outputEndTime: z.number().min(0),
  stepId: z.string().min(1),
  pedagogicalPurpose: z.string().min(1).max(240),
  visualFactIds: z.array(z.string().min(1)),
  allowedNarrationFactIds: z.array(z.string().min(1)),
  acceptedCandidateId: z.string().min(1).nullable(),
  modelProvenanceIds: z.array(z.string().min(1)),
  fallbackAssetId: z.string().min(1).nullable(),
  aiGeneratedLabel: z.string().nullable()
});

export const sourceAudioModeSchema = z.enum(["mute_source", "under_narration", "keep_source"]);

export const productionNarrationSegmentSchema = z.object({
  timelineItemId: z.string().min(1),
  text: z.string().min(1).max(NARRATION_LIMITS.maximumSegmentTextLength),
  allowedVisualFactIds: z.array(z.string().min(1)),
  targetStartTime: z.number().min(0),
  targetEndTime: z.number().min(0),
  tone: z.string().min(1).max(NARRATION_LIMITS.maximumToneLength),
  pronunciations: z
    .array(z.string().min(1))
    .max(NARRATION_LIMITS.maximumPronunciationsPerSegment)
});

export const productionNarrationSchema = z.object({
  language: z.string().min(2).max(40),
  voice: z.string().min(1),
  sourceAudioMode: sourceAudioModeSchema.default(NARRATION_LIMITS.defaultAudioMode),
  segments: z.array(productionNarrationSegmentSchema)
});

export const productionProvenanceEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["analysis", "planning", "segmentation", "generation", "render", "tts"]),
  provider: z.string().min(1),
  model: z.string().min(1),
  safePromptSummary: z.string().max(280).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  status: z.enum(["completed", "failed", "skipped"]),
  warnings: z.array(z.string())
});

export const productionPlanSchema = z.object({
  projectId: z.string().min(1),
  sourceVideo: z.object({
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    durationSeconds: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.string().min(3),
    hasOriginalAudio: z.boolean().nullable()
  }),
  task: z.object({
    title: z.string().min(1),
    description: z.string().max(500).optional(),
    tutorialLanguage: z.string().min(2).max(40),
    targetAudience: z.enum(["beginner", "intermediate", "advanced"])
  }),
  directVideoUnderstanding: directVideoUnderstandingSchema,
  objects: directVideoUnderstandingSchema.shape.objects,
  segments: z.array(productionSegmentSchema).min(1),
  finalTimeline: z.array(finalTimelineItemSchema).min(1),
  narration: productionNarrationSchema.nullable(),
  provenance: z.array(productionProvenanceEntrySchema),
  warnings: z.array(z.string())
});

export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type ProductionSegment = z.infer<typeof productionSegmentSchema>;
export type ProductionStrategy = z.infer<typeof productionStrategySchema>;
export type ProductionMediaAsset = z.infer<typeof productionMediaAssetSchema>;
export type ProductionNarration = z.infer<typeof productionNarrationSchema>;
export type ProductionNarrationSegment = z.infer<typeof productionNarrationSegmentSchema>;
export type SourceAudioMode = z.infer<typeof sourceAudioModeSchema>;
