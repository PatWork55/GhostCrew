import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionPlan } from "@/lib/production/build-production-plan";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import {
  buildSubtitleCues,
  buildTutorialExportReport,
  reconcileSegmentDuration
} from "@/lib/export/tutorial-export";
import {
  createAnalysisResponse,
  createDirectVideoUnderstanding,
  createValidatedAnalysisRequest
} from "@/tests/fixtures";

function createProductionPlan() {
  return buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });
}

test("buildSubtitleCues groups word timestamps into readable cues", () => {
  const cues = buildSubtitleCues({
    timelineItemId: "timeline-segment-1",
    wordTimestamps: [
      { word: "Lift", startSeconds: 0, endSeconds: 0.2 },
      { word: "the", startSeconds: 0.21, endSeconds: 0.32 },
      { word: "support", startSeconds: 0.33, endSeconds: 0.52 },
      { word: "arm", startSeconds: 0.53, endSeconds: 0.71 },
      { word: "into", startSeconds: 0.72, endSeconds: 0.86 },
      { word: "place", startSeconds: 0.87, endSeconds: 1.05 },
      { word: "slowly", startSeconds: 1.06, endSeconds: 1.26 }
    ]
  });

  assert.equal(cues.length, 2);
  assert.match(cues[0]?.text ?? "", /Lift/);
  assert.match(cues[1]?.text ?? "", /slowly/);
});

test("reconcileSegmentDuration extends the segment when narration is longer", () => {
  assert.equal(
    reconcileSegmentDuration({
      visualDurationSeconds: 2,
      narrationDurationSeconds: 2.4
    }),
    2.55
  );
});

test("buildTutorialExportReport preserves production provenance and output metadata", () => {
  const productionPlan = createProductionPlan();
  const narration = buildProductionNarration(productionPlan, {
    voice: "Rachel",
    sourceAudioMode: "mute_source"
  });
  const subtitles = buildSubtitleCues({
    timelineItemId: productionPlan.finalTimeline[0]!.id,
    wordTimestamps: [
      { word: "Show", startSeconds: 0, endSeconds: 0.2 },
      { word: "the", startSeconds: 0.21, endSeconds: 0.3 },
      { word: "stand", startSeconds: 0.31, endSeconds: 0.52 }
    ]
  });
  const report = buildTutorialExportReport({
    exportId: "export-phone-stand",
    productionPlan,
    narration,
    renderedNarration: productionPlan.finalTimeline.map((item) => ({
      timelineItemId: item.id,
      audioUrl: "https://example.com/narration.mp3",
      durationSeconds: item.durationSeconds,
      wordTimestamps: [
        { word: "Step", startSeconds: 0, endSeconds: 0.2 },
        { word: "one", startSeconds: 0.21, endSeconds: 0.42 }
      ],
      warnings: []
    })),
    subtitles,
    warnings: [],
    output: {
      fileName: "ghostcrew-tutorial.mp4",
      mimeType: "video/mp4",
      durationSeconds: 11.5,
      width: 960,
      height: 540,
      downloadUrl: "/api/exports/export-phone-stand",
      reportUrl: "/api/exports/export-phone-stand/report"
    },
    audioMode: "mute_source"
  });

  assert.equal(report.exportId, "export-phone-stand");
  assert.equal(report.output.fileName, "ghostcrew-tutorial.mp4");
  assert.equal(report.segments.length, productionPlan.finalTimeline.length);
});
