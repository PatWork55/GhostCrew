import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionPlan } from "@/lib/production/build-production-plan";
import { productionPlanSchema } from "@/lib/production/production-plan";
import {
  createAnalysisResponse,
  createDirectVideoUnderstanding,
  createTutorialAnalysis,
  createValidatedAnalysisRequest
} from "@/tests/fixtures";

test("buildProductionPlan creates a chronological final timeline", () => {
  const plan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });

  assert.equal(plan.segments.length, 4);
  assert.equal(plan.finalTimeline.length, 4);
  assert.equal(plan.finalTimeline[0]?.outputStartTime, 0);
  assert.equal(
    plan.finalTimeline[1]?.outputStartTime,
    plan.finalTimeline[0]?.outputEndTime
  );
  assert.equal(plan.finalTimeline.at(-1)?.outputEndTime, plan.segments.at(-1)?.outputEndTime);
});

test("buildProductionPlan upgrades small-detail actions to tracked_zoom and fast actions to slow_motion", () => {
  const plan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });

  assert.equal(plan.segments[1]?.selectedStrategy, "tracked_zoom");
  assert.equal(plan.segments[2]?.selectedStrategy, "slow_motion");
  assert.equal(plan.segments[2]?.playbackRate, 0.5);
});

test("buildProductionPlan promotes one moving-video treatment when the model leaves every step as keep_original", () => {
  const plan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse({
      analysis: createTutorialAnalysis({
        steps: createTutorialAnalysis().steps.map((step) => ({
          ...step,
          treatment: "keep_original"
        }))
      })
    }),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding({
      chronologicalActions: createDirectVideoUnderstanding().chronologicalActions.map((action) => ({
        ...action,
        visibleIssues: []
      })),
      momentsTooFast: [],
      momentsTooSmall: [],
      alternativeExplanationMoments: [],
      uncertaintySummary: "The clip is understandable, but a closer moving view would still help."
    })
  });

  assert.ok(
    plan.segments.some(
      (segment) =>
        segment.selectedStrategy === "tracked_zoom" || segment.selectedStrategy === "slow_motion"
    )
  );
});

test("productionPlanSchema validates the minimal phase-a production plan slice", () => {
  const plan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });

  const parsed = productionPlanSchema.parse(plan);

  assert.equal(parsed.projectId, "project-phone-stand");
  assert.equal(parsed.objects.length, 2);
  assert.equal(parsed.narration, null);
  assert.equal(parsed.finalTimeline[0]?.classification, "original");
});

test("productionPlanSchema accepts internal application asset URLs", () => {
  const plan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding(),
    sourceAssets: {
      "step-1": {
        id: "step-1-asset-source",
        type: "video",
        source: "original",
        fileName: "step-1-source.mp4",
        mediaUrl: "/api/production-assets/project-phone-stand/step-1-asset-source",
        durationSeconds: 2,
        width: 960,
        height: 540,
        mimeType: "video/mp4",
        originSegmentId: "segment-step-1",
        createdBy: "ffmpeg-segmentation",
        warnings: []
      }
    }
  });

  const parsed = productionPlanSchema.parse(plan);

  assert.equal(
    parsed.segments[0]?.acceptedAsset?.mediaUrl,
    "/api/production-assets/project-phone-stand/step-1-asset-source"
  );
  assert.equal(
    parsed.finalTimeline[0]?.mediaUrl,
    "/api/production-assets/project-phone-stand/step-1-asset-source"
  );
});
