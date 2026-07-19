import { sourceVideoMetadataSchema, type SourceVideoFrame } from "@/lib/source-video";
import { tutorialAnalysisSchema, type TutorialAnalysis } from "@/lib/tutorial-schema";
import {
  buildDefaultGeneratedInsertState,
  generatedInsertRenderStateSchema
} from "@/lib/generation/generated-insert-schema";
import {
  renderPlanOverridesSchema,
  renderPlanSchema,
  type RenderPlan,
  type RenderPlanOverrides
} from "@/lib/rendering/render-plan";
import {
  clampTimestamp,
  buildDefaultGeneratedInsertIntent,
  buildDefaultAnnotations,
  getDefaultCropForPreset,
  getOutputDurationSeconds,
  normalizeAnnotations,
  normalizeCrop,
  normalizeFreezeFrameDuration,
  normalizePlaybackRate,
  resolveRenderableTreatment,
  selectFreezeFrameSourceFrameId,
  selectFreezeFrameTimestamp
} from "@/lib/rendering/treatment-rules";
import { RENDERING_LIMITS } from "@/lib/constants";

type BuildRenderPlanInput = {
  analysis: TutorialAnalysis;
  sourceVideoMetadata: unknown;
  sourceFrames: Array<Pick<SourceVideoFrame, "id" | "timestampSeconds">>;
  overrides?: RenderPlanOverrides;
};

function roundToPrecision(value: number, precision = 3) {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}

function selectDefaultGeneratedInsertSourceFrameId(
  evidenceFrameIds: string[],
  sourceFrames: Array<Pick<SourceVideoFrame, "id">>
) {
  return (
    evidenceFrameIds.find((frameId) => sourceFrames.some((frame) => frame.id === frameId)) ??
    evidenceFrameIds[0] ??
    null
  );
}

function clampGeneratedInsertDuration(durationSeconds: number | null) {
  return roundToPrecision(
    Math.min(
      RENDERING_LIMITS.maximumFreezeFrameDurationSeconds + 1,
      Math.max(
        RENDERING_LIMITS.minimumFreezeFrameDurationSeconds + 0.5,
        durationSeconds ?? 3
      )
    )
  );
}

export function buildRenderPlan(input: BuildRenderPlanInput): RenderPlan {
  const analysis = tutorialAnalysisSchema.parse(input.analysis);
  const sourceVideoMetadata = sourceVideoMetadataSchema.parse(input.sourceVideoMetadata);
  const overrides = renderPlanOverridesSchema.parse(input.overrides ?? {});
  const sortedSteps = [...analysis.steps].sort((left, right) => {
    if (left.startTime === right.startTime) {
      return left.endTime - right.endTime;
    }

    return left.startTime - right.startTime;
  });
  let cumulativeOutputTime = 0;
  let previousSourceEndTime = 0;

  const segments = sortedSteps.map((step, index) => {
    const stepOverride = overrides[step.id];
    const sourceStartTime = clampTimestamp(
      Math.max(step.startTime, previousSourceEndTime),
      0,
      Math.max(0, sourceVideoMetadata.durationSeconds - RENDERING_LIMITS.minimumSegmentDurationSeconds)
    );
    const sourceEndTime = clampTimestamp(
      Math.max(step.endTime, sourceStartTime + RENDERING_LIMITS.minimumSegmentDurationSeconds),
      sourceStartTime + RENDERING_LIMITS.minimumSegmentDurationSeconds,
      sourceVideoMetadata.durationSeconds
    );
    const sourceDurationSeconds = roundToPrecision(sourceEndTime - sourceStartTime);
    previousSourceEndTime = sourceEndTime;
    const treatmentResolution = resolveRenderableTreatment(step);
    const generatedInsert =
      step.treatment === "generated_insert"
        ? generatedInsertRenderStateSchema.parse(
            stepOverride?.generatedInsert ??
              buildDefaultGeneratedInsertState(
                buildDefaultGeneratedInsertIntent(step),
                selectDefaultGeneratedInsertSourceFrameId(
                  step.evidenceFrameIds,
                  input.sourceFrames
                )
              )
          )
        : generatedInsertRenderStateSchema.parse({
            status: "not_requested",
            intent: "",
            sourceFrameId: null,
            mediaType: null,
            mediaUrl: null,
            thumbnailUrl: null,
            durationSeconds: null,
            provider: null,
            model: null,
            warnings: [],
            generationPromptSummary: null,
            attemptCount: 0
          });
    const hasAcceptedGeneratedImage =
      generatedInsert.status === "completed" &&
      generatedInsert.mediaType === "image" &&
      Boolean(generatedInsert.mediaUrl);
    const playbackRate =
      treatmentResolution.treatment === "slow_motion"
        ? normalizePlaybackRate(stepOverride?.playbackRate)
        : 1;
    const freezeFrameTimestamp =
      treatmentResolution.treatment === "freeze_frame"
        ? selectFreezeFrameTimestamp(step, input.sourceFrames, stepOverride?.freezeFrameTimestamp)
        : null;
    const freezeFrameSourceFrameId =
      treatmentResolution.treatment === "freeze_frame" && freezeFrameTimestamp !== null
        ? selectFreezeFrameSourceFrameId(
            step,
            input.sourceFrames,
            freezeFrameTimestamp,
            stepOverride?.freezeFrameSourceFrameId
          )
        : null;
    const freezeFrameDurationSeconds =
      treatmentResolution.treatment === "freeze_frame"
        ? normalizeFreezeFrameDuration(stepOverride?.freezeFrameDurationSeconds)
        : null;
    const outputDurationSeconds = hasAcceptedGeneratedImage
      ? clampGeneratedInsertDuration(generatedInsert.durationSeconds)
      : getOutputDurationSeconds(
          sourceDurationSeconds,
          treatmentResolution.treatment,
          playbackRate,
          freezeFrameDurationSeconds
        );
    const defaultCropPreset = stepOverride?.cropPreset ?? "center";
    const crop =
      treatmentResolution.treatment === "crop_close_up"
        ? normalizeCrop(stepOverride?.crop, defaultCropPreset)
        : null;
    const annotations = normalizeAnnotations(
      stepOverride?.annotations?.length
        ? stepOverride.annotations
        : buildDefaultAnnotations(
            step,
            treatmentResolution.treatment,
            outputDurationSeconds,
            treatmentResolution.generatedInsertPending
          ),
      outputDurationSeconds
    );
    const outputStartTime = roundToPrecision(cumulativeOutputTime);
    const outputEndTime = roundToPrecision(outputStartTime + outputDurationSeconds);
    cumulativeOutputTime = outputEndTime;

    return {
      id: `segment-${step.id}`,
      stepId: step.id,
      stepNumber: index + 1,
      title: step.title.trim(),
      subtitle: step.instruction.trim(),
      confidence: step.confidence,
      evidenceFrameIds: step.evidenceFrameIds,
      requestedTreatment: step.treatment,
      treatment: treatmentResolution.treatment,
      sourceStartTime,
      sourceEndTime,
      sourceDurationSeconds,
      outputStartTime,
      outputEndTime,
      outputDurationSeconds,
      playbackRate,
      cropPreset:
        treatmentResolution.treatment === "crop_close_up"
          ? stepOverride?.cropPreset ?? "center"
          : "center",
      crop,
      freezeFrameTimestamp,
      freezeFrameDurationSeconds,
      freezeFrameSourceFrameId,
      annotations,
      generatedInsertPending:
        step.treatment === "generated_insert" &&
        !["completed", "rejected_by_user", "failed", "not_requested"].includes(
          generatedInsert.status
        ),
      generatedInsertPrompt:
        step.treatment === "generated_insert" ? generatedInsert.intent.trim() : null,
      generatedInsertFallbackTreatment:
        step.treatment === "generated_insert"
          ? treatmentResolution.generatedInsertFallbackTreatment
          : null,
      generatedInsert
    };
  });

  return renderPlanSchema.parse({
    sourceDurationSeconds: sourceVideoMetadata.durationSeconds,
    durationSeconds: cumulativeOutputTime,
    segments
  });
}

export function createDefaultCropOverride(preset: "center" | "left" | "right" | "top" | "bottom") {
  return {
    cropPreset: preset,
    crop: getDefaultCropForPreset(preset)
  };
}
