import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import type { AnalysisResponse } from "@/lib/analysis-contract";
import type { DirectVideoAction, DirectVideoUnderstanding } from "@/lib/production/direct-video-understanding";
import {
  productionPlanSchema,
  type ProductionMediaAsset,
  type ProductionPlan,
  type ProductionStrategy
} from "@/lib/production/production-plan";
import type { TutorialStep } from "@/lib/tutorial-schema";

type BuildProductionPlanInput = {
  projectId: string;
  analysis: AnalysisResponse;
  request: ValidatedAnalysisRequest;
  directVideoUnderstanding: DirectVideoUnderstanding;
  sourceAssets?: Record<string, ProductionMediaAsset>;
  directVideoMeta?: {
    provider: "fal" | "fallback";
    model: string;
    warnings: string[];
    usage?: {
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  };
};

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

function calculateOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
) {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function findBestMatchingAction(step: TutorialStep, actions: DirectVideoAction[]) {
  return actions
    .map((action) => ({
      action,
      overlap: calculateOverlap(step.startTime, step.endTime, action.startTime, action.endTime)
    }))
    .sort((left, right) => right.overlap - left.overlap)[0]?.action ?? null;
}

function chooseStrategy(step: TutorialStep, matchedAction: DirectVideoAction | null): ProductionStrategy {
  const visibleIssues = new Set(matchedAction?.visibleIssues ?? []);

  if (step.treatment === "slow_motion" || visibleIssues.has("too_fast")) {
    return "slow_motion";
  }

  if (
    step.treatment === "crop_close_up" ||
    visibleIssues.has("too_small") ||
    visibleIssues.has("poor_framing")
  ) {
    return "tracked_zoom";
  }

  if (step.treatment === "freeze_frame") {
    return "freeze_frame";
  }

  if (step.treatment === "annotation") {
    return "annotation_overlay";
  }

  if (step.treatment === "generated_insert") {
    return "generated_context_insert";
  }

  return "keep_original";
}

function createVisualFacts(step: TutorialStep, matchedAction: DirectVideoAction | null) {
  const facts = [
    {
      id: `${step.id}-fact-1`,
      text: step.instruction,
      source: "source" as const,
      confidence: step.confidence
    }
  ];

  if (matchedAction) {
    facts.push({
      id: `${step.id}-fact-2`,
      text: matchedAction.description,
      source: "source" as const,
      confidence: matchedAction.confidence
    });
  }

  return facts;
}

function selectFallbackMotionStrategy(step: TutorialStep) {
  const instruction = `${step.title} ${step.instruction}`.toLowerCase();
  const fastActionPattern = /\b(insert|push|slide|lock|snap|lift|unfold|fold|twist)\b/;

  if (step.endTime - step.startTime <= 2.5 && fastActionPattern.test(instruction)) {
    return "slow_motion" as const;
  }

  return "tracked_zoom" as const;
}

function buildSegmentAssets(
  step: TutorialStep,
  selectedStrategy: ProductionStrategy,
  request: ValidatedAnalysisRequest,
  sourceAsset: ProductionMediaAsset | undefined
) {
  const playbackRate = selectedStrategy === "slow_motion" ? 0.5 : 1;
  const sourceDurationSeconds = Math.max(0.25, roundTime(step.endTime - step.startTime));
  const outputDurationSeconds = roundTime(sourceDurationSeconds / playbackRate);

  const acceptedAsset =
    sourceAsset ??
    ({
      id: `${step.id}-asset-source`,
      type: "video",
      source: "original",
      fileName: `${step.id}-source.mp4`,
      mediaUrl: null,
      durationSeconds: sourceDurationSeconds,
      width: request.video.width,
      height: request.video.height,
      mimeType: "video/mp4",
      originSegmentId: step.id,
      createdBy: "source-segmentation",
      warnings: []
    } satisfies ProductionMediaAsset);

  return {
    acceptedAsset,
    fallbackAsset: acceptedAsset,
    playbackRate,
    sourceDurationSeconds,
    outputDurationSeconds
  };
}

function ensureMotionTreatment(segments: ReturnType<typeof buildStepSegments>) {
  if (
    segments.some(
      (segment) =>
        segment.selectedStrategy === "tracked_zoom" || segment.selectedStrategy === "slow_motion"
    )
  ) {
    return segments;
  }

  const candidateIndex = segments.findIndex((segment, index) => {
    const isIntermediateStep = index > 0 && index < segments.length - 1;

    return (
      isIntermediateStep &&
      segment.acceptedAsset?.type === "video" &&
      segment.sourceEvidenceFrameIds.length > 0
    );
  });

  const fallbackIndex = candidateIndex >= 0 ? candidateIndex : 0;
  const selectedSegment = segments[fallbackIndex];

  if (!selectedSegment) {
    return segments;
  }

  const selectedStrategy = selectFallbackMotionStrategy({
    id: selectedSegment.stepId,
    title: selectedSegment.title,
    instruction: selectedSegment.factualAction,
    startTime: selectedSegment.sourceStartTime,
    endTime: selectedSegment.sourceEndTime,
    importance: "medium",
    visibility: "clear",
    viewerRisk: selectedSegment.viewerDifficulty,
    treatment: "keep_original",
    generationPrompt: null,
    evidenceFrameIds: selectedSegment.sourceEvidenceFrameIds,
    confidence: 1,
    reasoningSummary: selectedSegment.reasoningSummary
  });

  return segments.map((segment, index) => {
    if (index !== fallbackIndex) {
      return segment;
    }

    const playbackRate = selectedStrategy === "slow_motion" ? 0.5 : 1;

    return {
      ...segment,
      selectedStrategy,
      playbackRate,
      reasoningSummary: `${segment.reasoningSummary} GhostCrew promoted this segment to ${selectedStrategy} to improve instructional clarity in the moving video.`
    };
  });
}

function buildStepSegments(input: BuildProductionPlanInput) {
  return input.analysis.analysis.steps
    .slice()
    .sort((left, right) => left.startTime - right.startTime)
    .map((step, index) => {
      const matchedAction = findBestMatchingAction(
        step,
        input.directVideoUnderstanding.chronologicalActions
      );
      const selectedStrategy = chooseStrategy(step, matchedAction);
      const visualFactsForNarration = createVisualFacts(step, matchedAction);
      const matchedSourceAsset = input.sourceAssets?.[step.id];
      const assetBundle = buildSegmentAssets(
        step,
        selectedStrategy,
        input.request,
        matchedSourceAsset
      );

      return {
        id: `segment-${step.id}`,
        stepId: step.id,
        stepNumber: index + 1,
        title: step.title,
        sourceStartTime: roundTime(step.startTime),
        sourceEndTime: roundTime(step.endTime),
        factualAction: matchedAction?.description ?? step.instruction,
        pedagogicalGoal:
          matchedAction?.viewerNeedsToUnderstand ?? `Help the learner understand: ${step.instruction}`,
        viewerDifficulty:
          matchedAction?.visibleIssues.length
            ? matchedAction.visibleIssues.join(", ")
            : step.viewerRisk,
        sourceEvidenceFrameIds: step.evidenceFrameIds,
        selectedStrategy,
        candidateRuns: [],
        acceptedAsset: assetBundle.acceptedAsset,
        fallbackAsset: assetBundle.fallbackAsset,
        visualFactsForNarration,
        outputStartTime: 0,
        outputEndTime: 0,
        playbackRate: assetBundle.playbackRate,
        generatedLabelRequired:
          selectedStrategy === "generated_context_insert" ||
          selectedStrategy === "generated_object_explainer" ||
          selectedStrategy === "generated_diagram_explainer" ||
          selectedStrategy === "video_to_video_edit" ||
          selectedStrategy === "multi_pass_composite",
        uncertainties: [
          step.reasoningSummary,
          input.directVideoUnderstanding.uncertaintySummary
        ].filter(Boolean),
        reasoningSummary: matchedAction?.evidenceSummary ?? step.reasoningSummary
      };
    });
}

export function buildProductionPlan(input: BuildProductionPlanInput): ProductionPlan {
  const warnings = [...input.analysis.warnings];
  const segments = ensureMotionTreatment(buildStepSegments(input));

  let currentOutputTime = 0;
  const normalizedSegments = segments.map((segment) => {
    const durationSeconds = segment.acceptedAsset?.durationSeconds
      ? roundTime(segment.acceptedAsset.durationSeconds / segment.playbackRate)
      : roundTime(segment.sourceEndTime - segment.sourceStartTime);
    const outputStartTime = currentOutputTime;
    const outputEndTime = roundTime(outputStartTime + durationSeconds);
    currentOutputTime = outputEndTime;

    return {
      ...segment,
      outputStartTime,
      outputEndTime
    };
  });

  const finalTimeline = normalizedSegments.map((segment) => ({
    id: `timeline-${segment.id}`,
    segmentId: segment.id,
    assetId: segment.acceptedAsset?.id ?? `${segment.id}-missing`,
    classification: segment.acceptedAsset?.source ?? "original",
    mediaType: segment.acceptedAsset?.type ?? "video",
    mediaUrl: segment.acceptedAsset?.mediaUrl ?? null,
    durationSeconds: roundTime(segment.outputEndTime - segment.outputStartTime),
    outputStartTime: segment.outputStartTime,
    outputEndTime: segment.outputEndTime,
    stepId: segment.stepId,
    pedagogicalPurpose: segment.pedagogicalGoal,
    visualFactIds: segment.visualFactsForNarration.map((fact) => fact.id),
    allowedNarrationFactIds: segment.visualFactsForNarration.map((fact) => fact.id),
    acceptedCandidateId: null,
    modelProvenanceIds: [
      "provenance-direct-video-analysis",
      "provenance-frame-analysis",
      "provenance-production-plan"
    ],
    fallbackAssetId: segment.fallbackAsset?.id ?? null,
    aiGeneratedLabel: segment.generatedLabelRequired
      ? "AI-generated explanatory view"
      : null
  }));

  return productionPlanSchema.parse({
    projectId: input.projectId,
    sourceVideo: {
      fileName: input.request.video.fileName,
      mimeType: input.request.video.mimeType,
      durationSeconds: input.request.video.durationSeconds,
      width: input.request.video.width,
      height: input.request.video.height,
      aspectRatio: input.request.video.aspectRatioLabel,
      hasOriginalAudio: null
    },
    task: {
      title: input.request.taskTitle,
      description: input.request.description,
      tutorialLanguage: input.request.language,
      targetAudience: "beginner"
    },
    directVideoUnderstanding: input.directVideoUnderstanding,
    objects: input.directVideoUnderstanding.objects,
    segments: normalizedSegments,
    finalTimeline,
    narration: null,
    provenance: [
      {
        id: "provenance-direct-video-analysis",
        kind: "analysis",
        provider: input.directVideoMeta?.provider ?? "fallback",
        model: input.directVideoMeta?.model ?? "frame-fallback",
        safePromptSummary: "Full-video instructional understanding for a short safe task.",
        latencyMs: null,
        estimatedCostUsd: input.directVideoMeta?.usage?.costUsd ?? null,
        status: "completed",
        warnings: input.directVideoMeta?.warnings ?? []
      },
      {
        id: "provenance-frame-analysis",
        kind: "analysis",
        provider: input.analysis.provider,
        model: input.analysis.model,
        safePromptSummary: "Frame-based storyboard analysis for chronological tutorial steps.",
        latencyMs: input.analysis.usage.latencyMs,
        estimatedCostUsd: input.analysis.providerUsage?.costUsd ?? null,
        status: "completed",
        warnings: input.analysis.warnings
      },
      {
        id: "provenance-production-plan",
        kind: "planning",
        provider: "ghostcrew",
        model: "deterministic-planner-v1",
        safePromptSummary: null,
        latencyMs: null,
        estimatedCostUsd: null,
        status: "completed",
        warnings
      }
    ],
    warnings
  });
}
