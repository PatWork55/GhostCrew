import { ANALYSIS_LIMITS } from "@/lib/constants";
import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import { tutorialAnalysisSchema, type TutorialAnalysis, type TutorialStep } from "@/lib/tutorial-schema";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function getEvidenceTimestamps(step: TutorialStep, frameTimestampById: Map<string, number>) {
  return step.evidenceFrameIds
    .map((frameId) => frameTimestampById.get(frameId))
    .filter((timestamp): timestamp is number => typeof timestamp === "number");
}

function normalizeGeneratedInsert(step: TutorialStep) {
  if (step.treatment !== "generated_insert") {
    return {
      step: {
        ...step,
        generationPrompt: null
      },
      warning: null
    };
  }

  if (step.confidence < 0.65) {
    return {
      step: {
        ...step,
        treatment: step.visibility === "unclear" ? "freeze_frame" : "annotation",
        generationPrompt: null
      },
      warning: `Step ${step.id} downgraded from generated_insert because confidence was too low.`
    };
  }

  if (step.visibility !== "unclear" && step.evidenceFrameIds.length > 0) {
    return {
      step: {
        ...step,
        treatment: "crop_close_up",
        generationPrompt: null
      },
      warning: `Step ${step.id} downgraded from generated_insert because relevant source evidence already exists.`
    };
  }

  if (!step.generationPrompt?.trim()) {
    return {
      step: {
        ...step,
        treatment: "annotation",
        generationPrompt: null
      },
      warning: `Step ${step.id} downgraded from generated_insert because no generation prompt was provided.`
    };
  }

  return {
    step: {
      ...step,
      generationPrompt: step.generationPrompt.trim()
    },
    warning: null
  };
}

export function postProcessTutorialAnalysis(
  analysis: TutorialAnalysis,
  request: ValidatedAnalysisRequest
) {
  const validatedAnalysis = tutorialAnalysisSchema.parse(analysis);

  if (
    validatedAnalysis.steps.length < ANALYSIS_LIMITS.minSteps ||
    validatedAnalysis.steps.length > ANALYSIS_LIMITS.maxSteps
  ) {
    throw new Error("The analysis must contain between 3 and 6 steps.");
  }

  const frameIds = new Set(request.selectedFrames.map((frame) => frame.id));
  const frameTimestampById = new Map(
    request.selectedFrames.map((frame) => [frame.id, frame.timestampSeconds])
  );
  const warnings: string[] = [];
  const sortedSteps = [...validatedAnalysis.steps].sort((left, right) => {
    if (left.startTime === right.startTime) {
      return left.endTime - right.endTime;
    }

    return left.startTime - right.startTime;
  });

  const normalizedSteps = sortedSteps.map((step) => {
    const uniqueEvidenceFrameIds = uniqueValues(step.evidenceFrameIds);

    if (!uniqueEvidenceFrameIds.length) {
      throw new Error(`Step ${step.id} does not reference any evidence frames.`);
    }

    if (uniqueEvidenceFrameIds.some((frameId) => !frameIds.has(frameId))) {
      throw new Error(`Step ${step.id} references an unknown evidence frame.`);
    }

    const evidenceTimestamps = getEvidenceTimestamps(
      {
        ...step,
        evidenceFrameIds: uniqueEvidenceFrameIds
      },
      frameTimestampById
    );
    const evidenceStart = Math.min(...evidenceTimestamps);
    const evidenceEnd = Math.max(...evidenceTimestamps);
    const startTime = clamp(
      Math.min(step.startTime, evidenceStart),
      0,
      request.video.durationSeconds
    );
    let endTime = clamp(
      Math.max(step.endTime, evidenceEnd + ANALYSIS_LIMITS.minimumStepDurationSeconds),
      0,
      request.video.durationSeconds
    );

    if (endTime - startTime < ANALYSIS_LIMITS.minimumStepDurationSeconds) {
      endTime = clamp(
        startTime + ANALYSIS_LIMITS.minimumStepDurationSeconds,
        0,
        request.video.durationSeconds
      );
    }

    if (endTime <= startTime) {
      throw new Error(`Step ${step.id} resolved to an empty time range.`);
    }

    const generatedInsertResult = normalizeGeneratedInsert({
      ...step,
      title: step.title.trim(),
      instruction: step.instruction.trim(),
      viewerRisk: step.viewerRisk.trim(),
      reasoningSummary: step.reasoningSummary.trim(),
      startTime,
      endTime,
      evidenceFrameIds: uniqueEvidenceFrameIds,
      confidence: clamp(step.confidence, 0, 1)
    });

    if (generatedInsertResult.warning) {
      warnings.push(generatedInsertResult.warning);
    }

    return generatedInsertResult.step;
  });

  const nonOverlappingSteps = normalizedSteps.map((step, index) => {
    if (index === 0) {
      return step;
    }

    const previousStep = normalizedSteps[index - 1];

    if (step.startTime < previousStep.endTime - ANALYSIS_LIMITS.maximumOverlapSeconds) {
      const adjustedStartTime = previousStep.endTime;
      const adjustedEndTime = Math.max(
        adjustedStartTime + ANALYSIS_LIMITS.minimumStepDurationSeconds,
        step.endTime
      );

      warnings.push(`Step ${step.id} was shifted to preserve chronological order.`);

      if (adjustedEndTime > request.video.durationSeconds) {
        throw new Error(`Step ${step.id} overlaps too heavily to preserve a valid time range.`);
      }

      return {
        ...step,
        startTime: adjustedStartTime,
        endTime: adjustedEndTime
      };
    }

    return step;
  });

  return {
    analysis: tutorialAnalysisSchema.parse({
      ...validatedAnalysis,
      taskTitle: validatedAnalysis.taskTitle.trim(),
      summary: validatedAnalysis.summary.trim(),
      steps: nonOverlappingSteps
    }),
    warnings
  };
}
