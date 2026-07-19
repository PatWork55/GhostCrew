import assert from "node:assert/strict";
import test from "node:test";
import { fal } from "@fal-ai/client";
import { FalVideoAnalysisProvider } from "@/lib/analysis/fal-video-analysis-provider";
import { VideoAnalysisProviderError } from "@/lib/analysis/video-analysis-provider";
import { createValidatedAnalysisRequest } from "@/tests/fixtures";

function createSubscribeResult(output: string, cost?: number) {
  return {
    requestId: "test-request-id",
    data: {
      output,
      usage:
        typeof cost === "number"
          ? {
              cost,
              input_tokens: 100,
              output_tokens: 250,
              total_tokens: 350
            }
          : undefined
    }
  };
}

test("FalVideoAnalysisProvider repairs fenced JSON output once", async () => {
  const originalSubscribe = fal.subscribe;
  const originalConfig = fal.config;

  fal.config = (() => undefined) as typeof fal.config;
  fal.subscribe = (async () =>
    createSubscribeResult(
      [
        "```json",
        JSON.stringify({
          status: "ok",
          analysis: {
            taskTitle: "Assemble a phone stand",
            summary: "A four-step storyboard.",
            steps: [
              {
                id: "step-1",
                title: "Start",
                instruction: "Show the starting orientation.",
                startTime: 0,
                endTime: 4,
                importance: "medium",
                visibility: "partial",
                viewerRisk: "The first orientation may be unclear.",
                treatment: "annotation",
                generationPrompt: null,
                evidenceFrameIds: ["frame-1"],
                confidence: 0.7,
                reasoningSummary: "The first frame establishes the base orientation."
              },
              {
                id: "step-2",
                title: "Open",
                instruction: "Lift the support arm.",
                startTime: 4,
                endTime: 10,
                importance: "high",
                visibility: "partial",
                viewerRisk: "The hinge is small in frame.",
                treatment: "crop_close_up",
                generationPrompt: null,
                evidenceFrameIds: ["frame-2", "frame-3"],
                confidence: 0.76,
                reasoningSummary: "The hinge motion is visible but needs a closer crop."
              },
              {
                id: "step-3",
                title: "Lock",
                instruction: "Push until it locks.",
                startTime: 10,
                endTime: 16,
                importance: "high",
                visibility: "clear",
                viewerRisk: "The lock point is fast.",
                treatment: "slow_motion",
                generationPrompt: null,
                evidenceFrameIds: ["frame-3", "frame-4"],
                confidence: 0.83,
                reasoningSummary: "The fast lock is visible but benefits from slower playback."
              },
              {
                id: "step-4",
                title: "Confirm",
                instruction: "Pause on the final angle.",
                startTime: 16,
                endTime: 24,
                importance: "medium",
                visibility: "partial",
                viewerRisk: "The final angle needs confirmation.",
                treatment: "freeze_frame",
                generationPrompt: null,
                evidenceFrameIds: ["frame-4", "frame-5"],
                confidence: 0.72,
                reasoningSummary: "A pause confirms the final resting angle."
              }
            ]
          }
        }),
        "```"
      ].join("\n"),
      0.0012
    )) as unknown as typeof fal.subscribe;

  try {
    const provider = new FalVideoAnalysisProvider({
      apiKey: "test-key",
      endpointId: "openrouter/router/vision",
      modelId: "google/gemini-2.5-flash"
    });
    const result = await provider.analyze(createValidatedAnalysisRequest());

    assert.equal(result.kind, "analysis");
    if (result.kind === "analysis") {
      assert.equal(result.provider, "fal");
      assert.ok(
        result.warnings.some((warning) => warning.includes("repair pass"))
      );
      assert.equal(result.analysis.steps.length, 4);
    }
  } finally {
    fal.subscribe = originalSubscribe;
    fal.config = originalConfig;
  }
});

test("FalVideoAnalysisProvider rejects invalid structured output", async () => {
  const originalSubscribe = fal.subscribe;
  const originalConfig = fal.config;

  fal.config = (() => undefined) as typeof fal.config;
  fal.subscribe = (async () =>
    createSubscribeResult(
      JSON.stringify({
        status: "ok",
        analysis: {
          taskTitle: "Broken",
          summary: "Missing required fields on steps.",
          steps: [
            {
              id: "step-1"
            }
          ]
        }
      })
    )) as unknown as typeof fal.subscribe;

  try {
    const provider = new FalVideoAnalysisProvider({
      apiKey: "test-key",
      endpointId: "openrouter/router/vision",
      modelId: "google/gemini-2.5-flash"
    });

    await assert.rejects(
      () => provider.analyze(createValidatedAnalysisRequest()),
      VideoAnalysisProviderError
    );
  } finally {
    fal.subscribe = originalSubscribe;
    fal.config = originalConfig;
  }
});
