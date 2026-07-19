import assert from "node:assert/strict";
import test from "node:test";
import { postProcessTutorialAnalysis } from "@/lib/analysis/post-process";
import { createTutorialAnalysis, createValidatedAnalysisRequest } from "@/tests/fixtures";

test("postProcessTutorialAnalysis rejects unknown evidence frame ids", () => {
  const request = createValidatedAnalysisRequest();
  const analysis = createTutorialAnalysis({
    steps: [
      {
        ...createTutorialAnalysis().steps[0]!,
        evidenceFrameIds: ["frame-404"]
      },
      ...createTutorialAnalysis().steps.slice(1)
    ]
  });

  assert.throws(
    () => postProcessTutorialAnalysis(analysis, request),
    /unknown evidence frame/
  );
});

test("postProcessTutorialAnalysis downgrades low-confidence generated inserts", () => {
  const request = createValidatedAnalysisRequest();
  const analysis = createTutorialAnalysis({
    steps: [
      createTutorialAnalysis().steps[0]!,
      {
        ...createTutorialAnalysis().steps[1]!,
        treatment: "generated_insert",
        generationPrompt: "Show a cleaner hinge angle.",
        confidence: 0.4,
        visibility: "unclear"
      },
      createTutorialAnalysis().steps[2]!,
      createTutorialAnalysis().steps[3]!
    ]
  });

  const result = postProcessTutorialAnalysis(analysis, request);

  assert.equal(result.analysis.steps[1]?.treatment, "freeze_frame");
  assert.equal(result.analysis.steps[1]?.generationPrompt, null);
  assert.ok(
    result.warnings.some((warning) => warning.includes("downgraded from generated_insert"))
  );
});

test("postProcessTutorialAnalysis sorts and de-overlaps steps chronologically", () => {
  const request = createValidatedAnalysisRequest();
  const base = createTutorialAnalysis();
  const analysis = createTutorialAnalysis({
    steps: [
      {
        ...base.steps[2]!,
        startTime: 10,
        endTime: 16
      },
      {
        ...base.steps[0]!,
        startTime: 0,
        endTime: 4.6
      },
      {
        ...base.steps[1]!,
        startTime: 4.2,
        endTime: 11
      },
      {
        ...base.steps[3]!,
        startTime: 15.5,
        endTime: 24.2
      }
    ]
  });

  const result = postProcessTutorialAnalysis(analysis, request);

  assert.deepEqual(
    result.analysis.steps.map((step) => step.id),
    ["step-1", "step-2", "step-3", "step-4"]
  );
  assert.ok(result.analysis.steps[1]!.startTime >= result.analysis.steps[0]!.endTime);
  assert.ok(result.warnings.some((warning) => warning.includes("shifted")));
});
