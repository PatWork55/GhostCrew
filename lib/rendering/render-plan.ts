import { z } from "zod";
import { RENDERING_LIMITS } from "@/lib/constants";
import { treatmentSchema } from "@/lib/tutorial-schema";

const normalizedCoordinateSchema = z.number().min(0).max(1);

export const cropPresetSchema = z.enum([
  "center",
  "left",
  "right",
  "top",
  "bottom",
  "custom"
]);

export const annotationTypeSchema = z.enum(["arrow", "box", "label"]);

export const annotationSchema = z
  .object({
    id: z.string().min(1),
    type: annotationTypeSchema,
    x: normalizedCoordinateSchema,
    y: normalizedCoordinateSchema,
    width: normalizedCoordinateSchema,
    height: normalizedCoordinateSchema,
    text: z.string().max(RENDERING_LIMITS.maximumAnnotationTextLength),
    startOffsetSeconds: z.number().min(0),
    endOffsetSeconds: z.number().min(0)
  })
  .superRefine((annotation, context) => {
    if (annotation.x + annotation.width > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annotation width exceeds the render bounds.",
        path: ["width"]
      });
    }

    if (annotation.y + annotation.height > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annotation height exceeds the render bounds.",
        path: ["height"]
      });
    }

    if (annotation.endOffsetSeconds < annotation.startOffsetSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annotation timing is invalid.",
        path: ["endOffsetSeconds"]
      });
    }
  });

export const cropSchema = z
  .object({
    x: normalizedCoordinateSchema,
    y: normalizedCoordinateSchema,
    width: normalizedCoordinateSchema,
    height: normalizedCoordinateSchema
  })
  .superRefine((crop, context) => {
    if (crop.width <= 0 || crop.height <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crop dimensions must be positive.",
        path: ["width"]
      });
    }

    if (crop.x + crop.width > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crop width exceeds the source bounds.",
        path: ["width"]
      });
    }

    if (crop.y + crop.height > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crop height exceeds the source bounds.",
        path: ["height"]
      });
    }
  });

export const renderableTreatmentSchema = z.enum([
  "keep_original",
  "crop_close_up",
  "slow_motion",
  "freeze_frame",
  "annotation"
]);

export const renderPlanSegmentSchema = z
  .object({
    id: z.string().min(1),
    stepId: z.string().min(1),
    stepNumber: z.number().int().positive(),
    title: z.string().min(1),
    subtitle: z.string(),
    confidence: z.number().min(0).max(1),
    evidenceFrameIds: z.array(z.string().min(1)).min(1),
    requestedTreatment: treatmentSchema,
    treatment: renderableTreatmentSchema,
    sourceStartTime: z.number().min(0),
    sourceEndTime: z.number().min(0),
    sourceDurationSeconds: z.number().positive(),
    outputStartTime: z.number().min(0),
    outputEndTime: z.number().min(0),
    outputDurationSeconds: z.number().positive(),
    playbackRate: z.number().positive(),
    cropPreset: cropPresetSchema,
    crop: cropSchema.nullable(),
    freezeFrameTimestamp: z.number().min(0).nullable(),
    freezeFrameDurationSeconds: z.number().positive().nullable(),
    freezeFrameSourceFrameId: z.string().nullable(),
    annotations: z.array(annotationSchema),
    generatedInsertPending: z.boolean(),
    generatedInsertPrompt: z.string().nullable(),
    generatedInsertFallbackTreatment: renderableTreatmentSchema.nullable()
  })
  .superRefine((segment, context) => {
    if (segment.sourceEndTime <= segment.sourceStartTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Segment source range is invalid.",
        path: ["sourceEndTime"]
      });
    }

    if (segment.outputEndTime <= segment.outputStartTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Segment output range is invalid.",
        path: ["outputEndTime"]
      });
    }

    if (segment.treatment === "crop_close_up" && !segment.crop) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crop segments require crop coordinates.",
        path: ["crop"]
      });
    }

    if (segment.treatment === "freeze_frame") {
      if (segment.freezeFrameTimestamp === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Freeze-frame segments require a freeze timestamp.",
          path: ["freezeFrameTimestamp"]
        });
      }

      if (segment.freezeFrameDurationSeconds === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Freeze-frame segments require a freeze duration.",
          path: ["freezeFrameDurationSeconds"]
        });
      }
    }

    if (segment.treatment !== "freeze_frame") {
      if (segment.freezeFrameDurationSeconds !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only freeze-frame segments can define a freeze duration.",
          path: ["freezeFrameDurationSeconds"]
        });
      }
    }

    if (segment.treatment === "slow_motion" && segment.playbackRate >= 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slow-motion segments require a playback rate below 1.",
        path: ["playbackRate"]
      });
    }

    if (segment.treatment !== "slow_motion" && segment.playbackRate !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only slow-motion segments can change playback rate.",
        path: ["playbackRate"]
      });
    }

    for (const [annotationIndex, annotation] of segment.annotations.entries()) {
      if (annotation.endOffsetSeconds > segment.outputDurationSeconds) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Annotation timing exceeds the segment duration.",
          path: ["annotations", annotationIndex, "endOffsetSeconds"]
        });
      }
    }
  });

export const renderPlanSchema = z
  .object({
    sourceDurationSeconds: z.number().positive(),
    durationSeconds: z.number().positive(),
    segments: z.array(renderPlanSegmentSchema).min(1)
  })
  .superRefine((plan, context) => {
    let previousSourceEnd = -1;
    let previousOutputEnd = 0;

    for (const [index, segment] of plan.segments.entries()) {
      if (segment.sourceStartTime < previousSourceEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Segments must be chronological in source time.",
          path: ["segments", index, "sourceStartTime"]
        });
      }

      if (index > 0 && segment.outputStartTime < previousOutputEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Segments must be chronological in output time.",
          path: ["segments", index, "outputStartTime"]
        });
      }

      previousSourceEnd = segment.sourceEndTime;
      previousOutputEnd = segment.outputEndTime;
    }

    const lastSegment = plan.segments.at(-1);

    if (lastSegment && Math.abs(lastSegment.outputEndTime - plan.durationSeconds) > 0.02) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Render plan duration must match the final segment end time.",
        path: ["durationSeconds"]
      });
    }
  });

export const renderStepOverrideSchema = z.object({
  cropPreset: cropPresetSchema.optional(),
  crop: cropSchema.optional(),
  playbackRate: z.number().positive().optional(),
  freezeFrameTimestamp: z.number().min(0).optional(),
  freezeFrameDurationSeconds: z.number().positive().optional(),
  freezeFrameSourceFrameId: z.string().nullable().optional(),
  annotations: z.array(annotationSchema).optional()
});

export const renderPlanOverridesSchema = z.record(z.string().min(1), renderStepOverrideSchema);

export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationType = z.infer<typeof annotationTypeSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type CropPreset = z.infer<typeof cropPresetSchema>;
export type RenderableTreatment = z.infer<typeof renderableTreatmentSchema>;
export type RenderPlan = z.infer<typeof renderPlanSchema>;
export type RenderPlanSegment = z.infer<typeof renderPlanSegmentSchema>;
export type RenderStepOverride = z.infer<typeof renderStepOverrideSchema>;
export type RenderPlanOverrides = z.infer<typeof renderPlanOverridesSchema>;
