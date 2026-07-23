import type { AnalysisRequest, ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import type {
  GeneratedInsertRequest,
  GeneratedInsertResult,
  ValidatedGeneratedInsertRequest
} from "@/lib/generation/generated-insert-schema";
import type { DirectVideoUnderstanding } from "@/lib/production/direct-video-understanding";
import type { AnalysisResponse } from "@/lib/analysis-contract";
import type { TutorialAnalysis } from "@/lib/tutorial-schema";

export function createFrame(frameId: string, timestampSeconds: number, byteLength = 12) {
  const payload = Buffer.from(`${frameId}-`.repeat(Math.max(1, Math.ceil(byteLength / (frameId.length + 1)))))
    .subarray(0, byteLength);

  return {
    id: frameId,
    timestampSeconds,
    imageDataUrl: `data:image/webp;base64,${payload.toString("base64")}`,
    mimeType: "image/webp" as const,
    width: 640,
    height: 360,
    byteSize: payload.length
  };
}

export function createAnalysisRequest(
  overrides: Partial<AnalysisRequest> = {}
): AnalysisRequest {
  const selectedFrames = [
    createFrame("frame-1", 0.35),
    createFrame("frame-2", 4.5),
    createFrame("frame-3", 9.2),
    createFrame("frame-4", 13.8),
    createFrame("frame-5", 18.4)
  ];

  return {
    taskTitle: "Assemble a phone stand",
    description: "Show the hinge and the final angle.",
    language: "English",
    video: {
      fileName: "phone-stand.mp4",
      mimeType: "video/mp4",
      fileSizeBytes: 5_200_000,
      durationSeconds: 24.2,
      width: 1920,
      height: 1080,
      aspectRatio: 1.7778,
      aspectRatioLabel: "16:9"
    },
    selectedFrames,
    ...overrides
  };
}

export function createValidatedAnalysisRequest(
  overrides: Partial<ValidatedAnalysisRequest> = {}
): ValidatedAnalysisRequest {
  const base = createAnalysisRequest();

  return {
    ...base,
    aggregateImageBytes: base.selectedFrames.reduce((total, frame) => total + frame.byteSize, 0),
    ...overrides
  };
}

export function createTutorialAnalysis(
  overrides: Partial<TutorialAnalysis> = {}
): TutorialAnalysis {
  return {
    taskTitle: "Assemble a phone stand",
    summary: "A four-step instructional storyboard for the phone stand assembly.",
    steps: [
      {
        id: "step-1",
        title: "Show the folded stand",
        instruction: "Show the folded stand before opening it.",
        startTime: 0,
        endTime: 4.5,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The starting orientation may be unclear.",
        treatment: "annotation",
        generationPrompt: null,
        evidenceFrameIds: ["frame-1", "frame-2"],
        confidence: 0.71,
        reasoningSummary: "The beginning orientation benefits from a label."
      },
      {
        id: "step-2",
        title: "Open the support arm",
        instruction: "Lift the support arm into place.",
        startTime: 4.5,
        endTime: 10,
        importance: "high",
        visibility: "partial",
        viewerRisk: "The hinge is present but small in frame.",
        treatment: "crop_close_up",
        generationPrompt: null,
        evidenceFrameIds: ["frame-2", "frame-3"],
        confidence: 0.79,
        reasoningSummary: "A crop makes the hinge movement easier to follow."
      },
      {
        id: "step-3",
        title: "Lock the angle",
        instruction: "Push until the hinge locks.",
        startTime: 10,
        endTime: 16,
        importance: "high",
        visibility: "clear",
        viewerRisk: "The final lock may be too fast to notice.",
        treatment: "slow_motion",
        generationPrompt: null,
        evidenceFrameIds: ["frame-3", "frame-4"],
        confidence: 0.83,
        reasoningSummary: "The visible lock benefits from slower playback."
      },
      {
        id: "step-4",
        title: "Confirm the final angle",
        instruction: "Pause on the final position.",
        startTime: 16,
        endTime: 24.2,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The final angle may still need a pause.",
        treatment: "freeze_frame",
        generationPrompt: null,
        evidenceFrameIds: ["frame-4", "frame-5"],
        confidence: 0.7,
        reasoningSummary: "A freeze frame helps verify the final orientation."
      }
    ],
    ...overrides
  };
}

export function createSourceVideoFrame(frameId: string, timestampSeconds: number) {
  const frame = createFrame(frameId, timestampSeconds);

  return {
    ...frame,
    isSelected: true
  };
}

export function createGeneratedInsertRequest(
  overrides: Partial<GeneratedInsertRequest> = {}
): GeneratedInsertRequest {
  return {
    stepId: "step-2",
    taskTitle: "Assemble a phone stand",
    taskDescription: "Show the hinge and the final angle.",
    sourceVideoDurationSeconds: 24.2,
    stepTitle: "Open the support arm",
    instruction: "Lift the support arm into place.",
    viewerRisk: "The hinge orientation is difficult to see.",
    evidenceFrameIds: ["frame-2", "frame-3"],
    intent: "Create a clearer close-up of the hinge orientation.",
    modelSuggestedPrompt: "Create a clear explanatory hinge close-up.",
    sourceFrame: createFrame("frame-2", 4.5),
    outputType: "image",
    aspectRatio: "16:9",
    ...overrides
  };
}

export function createValidatedGeneratedInsertRequest(
  overrides: Partial<ValidatedGeneratedInsertRequest> = {}
): ValidatedGeneratedInsertRequest {
  const base = createGeneratedInsertRequest();

  return {
    ...base,
    decodedReferenceBytes: base.sourceFrame.byteSize,
    ...overrides
  };
}

export function createGeneratedInsertResult(
  overrides: Partial<GeneratedInsertResult> = {}
): GeneratedInsertResult {
  return {
    stepId: "step-2",
    provider: "fal",
    imageModel: "fal-ai/nano-banana-2/edit",
    videoModel: null,
    resultType: "image",
    mediaUrl: "https://example.com/generated-insert.png",
    thumbnailUrl: "https://example.com/generated-insert.png",
    durationSeconds: 3,
    width: 1280,
    height: 720,
    generationPromptSummary: "Create a clearer hinge close-up that preserves the same stand.",
    warnings: [],
    usage: {
      latencyMs: 4800,
      estimatedCostUsd: 0.08
    },
    ...overrides
  };
}

export function createDirectVideoUnderstanding(
  overrides: Partial<DirectVideoUnderstanding> = {}
): DirectVideoUnderstanding {
  return {
    taskTitle: "Assemble a phone stand",
    factualSummary:
      "A folded phone stand is opened, the support arm is raised, and the angle is locked.",
    objects: [
      {
        id: "object-1",
        name: "support arm",
        description: "The hinged arm that lifts to create the viewing angle.",
        visualEvidenceFrameIds: ["frame-2", "frame-3"],
        confidence: 0.92
      },
      {
        id: "object-2",
        name: "base",
        description: "The lower platform that unfolds and supports the stand.",
        visualEvidenceFrameIds: ["frame-1", "frame-2"],
        confidence: 0.89
      }
    ],
    chronologicalActions: [
      {
        id: "action-1",
        title: "Show the folded stand",
        startTime: 0,
        endTime: 4.5,
        description: "The folded stand is shown before any movement begins.",
        handsOrTools: ["hand"],
        spatialRelationship: "The folded arm rests against the base.",
        viewerNeedsToUnderstand: "Understand the starting orientation.",
        visibleIssues: ["orientation_confusing"],
        recommendedAlternativeVisual: null,
        evidenceSummary: "The beginning orientation is visible but could use a label.",
        confidence: 0.78
      },
      {
        id: "action-2",
        title: "Raise the support arm",
        startTime: 4.5,
        endTime: 10,
        description: "The support arm is lifted away from the base hinge.",
        handsOrTools: ["hand"],
        spatialRelationship: "The arm rotates upward from the hinge.",
        viewerNeedsToUnderstand: "See the hinge motion clearly.",
        visibleIssues: ["too_small", "poor_framing"],
        recommendedAlternativeVisual: "A tighter moving close-up would clarify the hinge.",
        evidenceSummary: "The hinge is present but small in the frame.",
        confidence: 0.82
      },
      {
        id: "action-3",
        title: "Lock the angle",
        startTime: 10,
        endTime: 16,
        description: "The hinge is pushed until the stand reaches its final angle.",
        handsOrTools: ["hand"],
        spatialRelationship: "The support arm presses against the base until it clicks into place.",
        viewerNeedsToUnderstand: "Notice the locking moment and final angle.",
        visibleIssues: ["too_fast"],
        recommendedAlternativeVisual: null,
        evidenceSummary: "The locking motion happens quickly.",
        confidence: 0.87
      }
    ],
    momentsTooFast: ["action-3"],
    momentsTooSmall: ["action-2"],
    hiddenDetails: [],
    alternativeExplanationMoments: ["action-2"],
    safetyConcerns: [],
    uncertaintySummary: "The clip is clear overall, but the hinge detail is small.",
    overallConfidence: 0.85,
    ...overrides
  };
}

export function createAnalysisResponse(
  overrides: Partial<AnalysisResponse> = {}
): AnalysisResponse {
  return {
    analysis: createTutorialAnalysis(),
    provider: "fal",
    model: "google/gemini-2.5-flash",
    fallbackUsed: false,
    warnings: [],
    providerUsage: {
      costUsd: 0.002,
      totalTokens: 2500
    },
    usage: {
      selectedFrameCount: 5,
      aggregateImageBytes: 60,
      latencyMs: 4200
    },
    ...overrides
  };
}
