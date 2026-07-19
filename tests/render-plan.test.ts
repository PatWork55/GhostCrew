import assert from "node:assert/strict";
import test from "node:test";
import { buildRenderPlan } from "@/lib/rendering/build-render-plan";
import { renderPlanSchema } from "@/lib/rendering/render-plan";
import {
  normalizeAnnotations,
  getOutputDurationSeconds
} from "@/lib/rendering/treatment-rules";
import {
  createAnalysisRequest,
  createSourceVideoFrame,
  createTutorialAnalysis
} from "@/tests/fixtures";

function createSourceFrames() {
  return [
    createSourceVideoFrame("frame-1", 0.35),
    createSourceVideoFrame("frame-2", 4.5),
    createSourceVideoFrame("frame-3", 9.2),
    createSourceVideoFrame("frame-4", 13.8),
    createSourceVideoFrame("frame-5", 18.4)
  ];
}

test("buildRenderPlan orders segments chronologically and computes output duration", () => {
  const request = createAnalysisRequest();
  const analysis = createTutorialAnalysis({
    steps: [
      {
        ...createTutorialAnalysis().steps[2]!,
        startTime: 10,
        endTime: 16
      },
      {
        ...createTutorialAnalysis().steps[0]!,
        startTime: 0,
        endTime: 4.5
      },
      {
        ...createTutorialAnalysis().steps[1]!,
        startTime: 4.5,
        endTime: 10
      },
      {
        ...createTutorialAnalysis().steps[3]!,
        startTime: 16,
        endTime: 24.2
      }
    ]
  });

  const renderPlan = buildRenderPlan({
    analysis,
    sourceVideoMetadata: request.video,
    sourceFrames: createSourceFrames()
  });

  assert.equal(renderPlan.segments[0]?.stepId, "step-1");
  assert.equal(renderPlan.segments[1]?.outputStartTime, renderPlan.segments[0]?.outputEndTime);
  assert.equal(renderPlan.segments[3]?.outputEndTime, renderPlan.durationSeconds);
  assert.ok(
    (renderPlan.segments[1]?.sourceStartTime ?? 0) >=
      (renderPlan.segments[0]?.sourceEndTime ?? 0)
  );
});

test("getOutputDurationSeconds stretches slow-motion segments by playback rate", () => {
  assert.equal(getOutputDurationSeconds(6, "slow_motion", 0.5, null), 12);
  assert.equal(getOutputDurationSeconds(6, "slow_motion", 0.75, null), 8);
});

test("buildRenderPlan clamps invalid timestamps to the source duration", () => {
  const request = createAnalysisRequest();
  const analysis = createTutorialAnalysis({
    steps: [
      {
        ...createTutorialAnalysis().steps[0]!,
        startTime: 0,
        endTime: 5
      },
      {
        ...createTutorialAnalysis().steps[1]!,
        startTime: 5,
        endTime: 12
      },
      {
        ...createTutorialAnalysis().steps[2]!,
        startTime: 12,
        endTime: 20
      },
      {
        ...createTutorialAnalysis().steps[3]!,
        startTime: 20,
        endTime: 40
      }
    ]
  });

  const renderPlan = buildRenderPlan({
    analysis,
    sourceVideoMetadata: request.video,
    sourceFrames: createSourceFrames()
  });

  assert.equal(renderPlan.segments[0]?.sourceStartTime, 0);
  assert.equal(renderPlan.segments.at(-1)?.sourceEndTime, request.video.durationSeconds);
});

test("buildRenderPlan falls back generated_insert to a playable treatment", () => {
  const request = createAnalysisRequest();
  const analysis = createTutorialAnalysis({
    steps: [
      {
        ...createTutorialAnalysis().steps[0]!,
        treatment: "generated_insert",
        visibility: "unclear",
        generationPrompt: "Show the hinge from a clearer explanatory angle."
      },
      ...createTutorialAnalysis().steps.slice(1)
    ]
  });

  const renderPlan = buildRenderPlan({
    analysis,
    sourceVideoMetadata: request.video,
    sourceFrames: createSourceFrames()
  });

  assert.equal(renderPlan.segments[0]?.generatedInsertPending, true);
  assert.equal(renderPlan.segments[0]?.treatment, "freeze_frame");
  assert.equal(renderPlan.segments[0]?.generatedInsertFallbackTreatment, "freeze_frame");
});

test("normalizeAnnotations clamps coordinates and timing to valid bounds", () => {
  const normalized = normalizeAnnotations(
    [
      {
        id: "annotation-1",
        type: "label",
        x: 0.95,
        y: 0.94,
        width: 0.2,
        height: 0.2,
        text: "  Insert here  ",
        startOffsetSeconds: -1,
        endOffsetSeconds: 8
      }
    ],
    2
  );

  assert.equal(normalized[0]?.x, 0.95);
  assert.equal(normalized[0]?.width, 0.05);
  assert.equal(normalized[0]?.startOffsetSeconds, 0);
  assert.equal(normalized[0]?.endOffsetSeconds, 2);
  assert.equal(normalized[0]?.text, "Insert here");
});

test("renderPlanSchema rejects invalid crop segments", () => {
  assert.throws(() =>
    renderPlanSchema.parse({
      sourceDurationSeconds: 24,
      durationSeconds: 4,
      segments: [
        {
          id: "segment-step-1",
          stepId: "step-1",
          stepNumber: 1,
          title: "Bad crop",
          subtitle: "Broken",
          confidence: 0.8,
          evidenceFrameIds: ["frame-1"],
          requestedTreatment: "crop_close_up",
          treatment: "crop_close_up",
          sourceStartTime: 0,
          sourceEndTime: 4,
          sourceDurationSeconds: 4,
          outputStartTime: 0,
          outputEndTime: 4,
          outputDurationSeconds: 4,
          playbackRate: 1,
          cropPreset: "custom",
          crop: null,
          freezeFrameTimestamp: null,
          freezeFrameDurationSeconds: null,
          freezeFrameSourceFrameId: null,
          annotations: [],
          generatedInsertPending: false,
          generatedInsertPrompt: null,
          generatedInsertFallbackTreatment: null
        }
      ]
    })
  );
});
