import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDirectVideoUnderstanding } from "@/lib/production/fal-video-understanding-provider";

test("normalizeDirectVideoUnderstanding trims overlong provider output into the canonical schema", () => {
  const normalized = normalizeDirectVideoUnderstanding({
    taskTitle: "Assemble a phone stand",
    factualSummary: "A folded stand is opened and locked into place.",
    objects: [
      {
        id: "object-1",
        name: "support arm",
        description: "A detailed object description.",
        visualEvidenceFrameIds: Array.from({ length: 14 }, (_, index) => `frame-${index + 1}`),
        confidence: 0.92
      }
    ],
    chronologicalActions: [
      {
        id: "action-1",
        title: "Lift the support arm",
        startTime: 1,
        endTime: 3,
        description: "A".repeat(340),
        handsOrTools: ["hand"],
        spatialRelationship: "The arm rotates upward from the base hinge.",
        viewerNeedsToUnderstand: "Notice the direction of the lift.",
        visibleIssues: ["too_small", "poor_framing", "not_a_real_issue"],
        recommendedAlternativeVisual: "A tighter close-up could help.",
        evidenceSummary: "The action is visible in motion.",
        confidence: 0.88
      }
    ],
    momentsTooFast: [],
    momentsTooSmall: [],
    hiddenDetails: [],
    alternativeExplanationMoments: [],
    safetyConcerns: [],
    uncertaintySummary: "The single camera angle leaves some detail uncertain.",
    overallConfidence: 0.84
  });

  assert.equal(normalized.objects[0]?.visualEvidenceFrameIds.length, 10);
  assert.equal(normalized.chronologicalActions[0]?.description.length, 280);
  assert.deepEqual(normalized.chronologicalActions[0]?.visibleIssues, [
    "too_small",
    "poor_framing"
  ]);
});
