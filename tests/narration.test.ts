import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionPlan } from "@/lib/production/build-production-plan";
import { buildProductionNarration, getTutorialLanguageCode } from "@/lib/narration/build-narration";
import {
  createAnalysisResponse,
  createDirectVideoUnderstanding,
  createValidatedAnalysisRequest
} from "@/tests/fixtures";

test("buildProductionNarration creates one narration segment per timeline item", () => {
  const productionPlan = buildProductionPlan({
    projectId: "project-phone-stand",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest(),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });

  const narration = buildProductionNarration(productionPlan, {
    voice: "Rachel",
    sourceAudioMode: "mute_source"
  });

  assert.equal(narration.voice, "Rachel");
  assert.equal(narration.sourceAudioMode, "mute_source");
  assert.equal(narration.segments.length, productionPlan.finalTimeline.length);
  assert.ok(narration.segments.every((segment) => segment.text.length > 0));
});

test("getTutorialLanguageCode maps common language labels", () => {
  assert.equal(getTutorialLanguageCode("English"), "en");
  assert.equal(getTutorialLanguageCode("French"), "fr");
  assert.equal(getTutorialLanguageCode("Spanish"), "es");
  assert.equal(getTutorialLanguageCode("German"), "de");
});
