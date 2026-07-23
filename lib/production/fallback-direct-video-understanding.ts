import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import type { AnalysisResponse } from "@/lib/analysis-contract";
import { directVideoUnderstandingSchema } from "@/lib/production/direct-video-understanding";

export function buildFallbackDirectVideoUnderstanding(
  request: ValidatedAnalysisRequest,
  analysis: AnalysisResponse
) {
  return directVideoUnderstandingSchema.parse({
    taskTitle: analysis.analysis.taskTitle,
    factualSummary: analysis.analysis.summary,
    objects: [],
    chronologicalActions: analysis.analysis.steps.map((step, index) => ({
      id: `fallback-action-${index + 1}`,
      title: step.title,
      startTime: step.startTime,
      endTime: step.endTime,
      description: step.instruction,
      handsOrTools: [],
      spatialRelationship: step.viewerRisk,
      viewerNeedsToUnderstand: step.instruction,
      visibleIssues:
        step.treatment === "slow_motion"
          ? ["too_fast"]
          : step.treatment === "crop_close_up"
            ? ["too_small"]
            : step.treatment === "freeze_frame"
              ? ["orientation_confusing"]
              : step.treatment === "generated_insert"
                ? ["needs_alternative_explainer"]
                : [],
      recommendedAlternativeVisual: step.generationPrompt,
      evidenceSummary: step.reasoningSummary,
      confidence: step.confidence
    })),
    momentsTooFast: analysis.analysis.steps
      .filter((step) => step.treatment === "slow_motion")
      .map((step) => step.id),
    momentsTooSmall: analysis.analysis.steps
      .filter((step) => step.treatment === "crop_close_up")
      .map((step) => step.id),
    hiddenDetails: analysis.analysis.steps
      .filter((step) => step.treatment === "freeze_frame")
      .map((step) => step.id),
    alternativeExplanationMoments: analysis.analysis.steps
      .filter((step) => step.treatment === "generated_insert")
      .map((step) => step.id),
    safetyConcerns: [],
    uncertaintySummary:
      request.selectedFrames.length >= 3
        ? "Built from frame evidence because direct video understanding was unavailable."
        : "Built from limited frame evidence.",
    overallConfidence: Math.min(
      1,
      Math.max(
        0.3,
        analysis.analysis.steps.reduce((total, step) => total + step.confidence, 0) /
          Math.max(1, analysis.analysis.steps.length)
      )
    )
  });
}
