import { RENDERING_LIMITS } from "@/lib/constants";
import type { SourceVideoFrame } from "@/lib/source-video";
import type { TutorialStep } from "@/lib/tutorial-schema";
import type {
  Annotation,
  AnnotationType,
  Crop,
  CropPreset,
  RenderPlanSegment,
  RenderableTreatment
} from "@/lib/rendering/render-plan";

type FrameReference = Pick<SourceVideoFrame, "id" | "timestampSeconds">;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToPrecision(value: number, precision = 3) {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}

export function clampTimestamp(
  timestampSeconds: number,
  minimumSeconds: number,
  maximumSeconds: number
) {
  return roundToPrecision(clamp(timestampSeconds, minimumSeconds, maximumSeconds));
}

export function normalizePlaybackRate(playbackRate: number | undefined) {
  if (!playbackRate) {
    return RENDERING_LIMITS.defaultSlowMotionPlaybackRate;
  }

  const supportedRate = RENDERING_LIMITS.slowMotionPlaybackRates.find(
    (rate) => Math.abs(rate - playbackRate) < 0.001
  );

  return supportedRate ?? RENDERING_LIMITS.defaultSlowMotionPlaybackRate;
}

export function getOutputDurationSeconds(
  sourceDurationSeconds: number,
  treatment: RenderableTreatment,
  playbackRate: number,
  freezeFrameDurationSeconds: number | null
) {
  if (treatment === "freeze_frame") {
    return roundToPrecision(
      clamp(
        freezeFrameDurationSeconds ?? RENDERING_LIMITS.defaultFreezeFrameDurationSeconds,
        RENDERING_LIMITS.minimumFreezeFrameDurationSeconds,
        RENDERING_LIMITS.maximumFreezeFrameDurationSeconds
      )
    );
  }

  if (treatment === "slow_motion") {
    return roundToPrecision(
      Math.max(
        RENDERING_LIMITS.minimumSegmentDurationSeconds,
        sourceDurationSeconds / normalizePlaybackRate(playbackRate)
      )
    );
  }

  return roundToPrecision(
    Math.max(RENDERING_LIMITS.minimumSegmentDurationSeconds, sourceDurationSeconds)
  );
}

export function getDefaultCropForPreset(preset: CropPreset): Crop {
  const size = RENDERING_LIMITS.defaultCropSize;

  switch (preset) {
    case "left":
      return { x: 0, y: roundToPrecision((1 - size) / 2), width: size, height: size };
    case "right":
      return {
        x: roundToPrecision(1 - size),
        y: roundToPrecision((1 - size) / 2),
        width: size,
        height: size
      };
    case "top":
      return { x: roundToPrecision((1 - size) / 2), y: 0, width: size, height: size };
    case "bottom":
      return {
        x: roundToPrecision((1 - size) / 2),
        y: roundToPrecision(1 - size),
        width: size,
        height: size
      };
    case "custom":
    case "center":
    default:
      return {
        x: roundToPrecision((1 - size) / 2),
        y: roundToPrecision((1 - size) / 2),
        width: size,
        height: size
      };
  }
}

export function normalizeCrop(
  crop: Crop | undefined,
  cropPreset: CropPreset | undefined
): Crop {
  const baseCrop = crop ?? getDefaultCropForPreset(cropPreset ?? "center");
  const normalizedSize = clamp(
    Math.max(baseCrop.width, baseCrop.height),
    RENDERING_LIMITS.minimumCropSize,
    RENDERING_LIMITS.maximumCropSize
  );

  const normalizedCrop = {
    x: clamp(baseCrop.x, 0, 1 - normalizedSize),
    y: clamp(baseCrop.y, 0, 1 - normalizedSize),
    width: normalizedSize,
    height: normalizedSize
  };

  return {
    x: roundToPrecision(normalizedCrop.x, 4),
    y: roundToPrecision(normalizedCrop.y, 4),
    width: roundToPrecision(normalizedCrop.width, 4),
    height: roundToPrecision(normalizedCrop.height, 4)
  };
}

export function normalizeFreezeFrameDuration(
  freezeFrameDurationSeconds: number | undefined
) {
  return roundToPrecision(
    clamp(
      freezeFrameDurationSeconds ?? RENDERING_LIMITS.defaultFreezeFrameDurationSeconds,
      RENDERING_LIMITS.minimumFreezeFrameDurationSeconds,
      RENDERING_LIMITS.maximumFreezeFrameDurationSeconds
    )
  );
}

export function normalizeAnnotations(
  annotations: Annotation[] | undefined,
  outputDurationSeconds: number
) {
  return (annotations ?? []).map((annotation) => {
    const x = clamp(annotation.x, 0, 1);
    const y = clamp(annotation.y, 0, 1);
    const width = clamp(annotation.width, 0, 1 - x);
    const height = clamp(annotation.height, 0, 1 - y);
    const startOffsetSeconds = clampTimestamp(annotation.startOffsetSeconds, 0, outputDurationSeconds);
    const minimumEnd = Math.min(outputDurationSeconds, startOffsetSeconds + 0.1);
    const endOffsetSeconds = clampTimestamp(
      Math.max(annotation.endOffsetSeconds, minimumEnd),
      minimumEnd,
      outputDurationSeconds
    );

    return {
      ...annotation,
      x: roundToPrecision(x, 4),
      y: roundToPrecision(y, 4),
      width: roundToPrecision(width, 4),
      height: roundToPrecision(height, 4),
      text: annotation.text.trim().slice(0, RENDERING_LIMITS.maximumAnnotationTextLength),
      startOffsetSeconds,
      endOffsetSeconds
    };
  });
}

function createAnnotation(
  type: AnnotationType,
  text: string,
  outputDurationSeconds: number,
  overrides?: Partial<Annotation>
): Annotation {
  return {
    id: overrides?.id ?? `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    x: overrides?.x ?? 0.16,
    y: overrides?.y ?? 0.16,
    width: overrides?.width ?? 0.28,
    height: overrides?.height ?? 0.18,
    text: text.slice(0, RENDERING_LIMITS.maximumAnnotationTextLength),
    startOffsetSeconds: overrides?.startOffsetSeconds ?? 0,
    endOffsetSeconds:
      overrides?.endOffsetSeconds ??
      Math.min(outputDurationSeconds, RENDERING_LIMITS.defaultAnnotationDurationSeconds)
  };
}

export function buildDefaultAnnotations(
  step: Pick<TutorialStep, "id" | "title" | "instruction" | "treatment">,
  treatment: RenderableTreatment,
  outputDurationSeconds: number,
  generatedInsertPending: boolean
) {
  const annotations: Annotation[] = [];

  if (treatment === "annotation") {
    annotations.push(
      createAnnotation("box", step.title, outputDurationSeconds, {
        id: `${step.id}-box`,
        x: 0.2,
        y: 0.18,
        width: 0.34,
        height: 0.24
      }),
      createAnnotation("label", step.instruction, outputDurationSeconds, {
        id: `${step.id}-label`,
        x: 0.12,
        y: 0.08,
        width: 0.34,
        height: 0.14
      }),
      createAnnotation("arrow", step.title, outputDurationSeconds, {
        id: `${step.id}-arrow`,
        x: 0.12,
        y: 0.12,
        width: 0.14,
        height: 0.2
      })
    );
  }

  if (generatedInsertPending) {
    annotations.push(
      createAnnotation("label", "Generated insert pending", outputDurationSeconds, {
        id: `${step.id}-generated-pending`,
        x: 0.62,
        y: 0.08,
        width: 0.28,
        height: 0.12,
        endOffsetSeconds: outputDurationSeconds
      })
    );
  }

  return normalizeAnnotations(annotations, outputDurationSeconds);
}

export function resolveGeneratedInsertFallback(step: TutorialStep): RenderableTreatment {
  if (step.visibility === "unclear") {
    return "freeze_frame";
  }

  if (step.evidenceFrameIds.length > 1) {
    return "crop_close_up";
  }

  return "annotation";
}

export function resolveRenderableTreatment(step: TutorialStep): {
  treatment: RenderableTreatment;
  generatedInsertPending: boolean;
  generatedInsertFallbackTreatment: RenderableTreatment | null;
} {
  if (step.treatment !== "generated_insert") {
    return {
      treatment: step.treatment,
      generatedInsertPending: false,
      generatedInsertFallbackTreatment: null
    };
  }

  const fallbackTreatment = resolveGeneratedInsertFallback(step);

  return {
    treatment: fallbackTreatment,
    generatedInsertPending: true,
    generatedInsertFallbackTreatment: fallbackTreatment
  };
}

export function selectFreezeFrameTimestamp(
  step: TutorialStep,
  sourceFrames: FrameReference[],
  freezeFrameTimestamp: number | undefined
) {
  if (typeof freezeFrameTimestamp === "number") {
    return clampTimestamp(freezeFrameTimestamp, step.startTime, step.endTime);
  }

  const evidenceTimestamps = sourceFrames
    .filter((frame) => step.evidenceFrameIds.includes(frame.id))
    .map((frame) => frame.timestampSeconds)
    .filter((timestamp) => timestamp >= step.startTime && timestamp <= step.endTime)
    .sort((left, right) => left - right);

  if (evidenceTimestamps.length) {
    return clampTimestamp(
      evidenceTimestamps[Math.floor((evidenceTimestamps.length - 1) / 2)] ?? step.startTime,
      step.startTime,
      step.endTime
    );
  }

  return clampTimestamp((step.startTime + step.endTime) / 2, step.startTime, step.endTime);
}

export function selectFreezeFrameSourceFrameId(
  step: TutorialStep,
  sourceFrames: FrameReference[],
  freezeFrameTimestamp: number,
  requestedFrameId: string | null | undefined
) {
  if (requestedFrameId && step.evidenceFrameIds.includes(requestedFrameId)) {
    return requestedFrameId;
  }

  const evidenceFrames = sourceFrames.filter((frame) => step.evidenceFrameIds.includes(frame.id));

  if (!evidenceFrames.length) {
    return null;
  }

  const nearestFrame = evidenceFrames.reduce((bestFrame, currentFrame) => {
    if (!bestFrame) {
      return currentFrame;
    }

    const bestDistance = Math.abs(bestFrame.timestampSeconds - freezeFrameTimestamp);
    const currentDistance = Math.abs(currentFrame.timestampSeconds - freezeFrameTimestamp);

    return currentDistance < bestDistance ? currentFrame : bestFrame;
  }, evidenceFrames[0]);

  return nearestFrame?.id ?? null;
}

export function getCropStyle(segment: Pick<RenderPlanSegment, "crop" | "treatment">) {
  if (segment.treatment !== "crop_close_up" || !segment.crop) {
    return {
      width: "100%",
      height: "100%",
      left: "0%",
      top: "0%"
    };
  }

  return {
    width: `${roundToPrecision(100 / segment.crop.width, 2)}%`,
    height: `${roundToPrecision(100 / segment.crop.height, 2)}%`,
    left: `${roundToPrecision((-segment.crop.x / segment.crop.width) * 100, 2)}%`,
    top: `${roundToPrecision((-segment.crop.y / segment.crop.height) * 100, 2)}%`
  };
}
