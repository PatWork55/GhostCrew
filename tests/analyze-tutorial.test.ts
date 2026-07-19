import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisConfigurationError,
  analyzeTutorial
} from "@/lib/analysis/analyze-tutorial";
import { UnsafeTaskError } from "@/lib/analysis/safety";
import type {
  VideoAnalysisProvider,
  VideoAnalysisProviderResult
} from "@/lib/analysis/video-analysis-provider";
import { createTutorialAnalysis, createValidatedAnalysisRequest } from "@/tests/fixtures";

class MockProvider implements VideoAnalysisProvider {
  constructor(
    private readonly handler: () => Promise<VideoAnalysisProviderResult> | VideoAnalysisProviderResult
  ) {}

  analyze() {
    return Promise.resolve(this.handler());
  }
}

test("analyzeTutorial uses demo fallback when real provider is unavailable", async () => {
  const request = createValidatedAnalysisRequest();

  const result = await analyzeTutorial(request, {
    realProvider: null,
    demoProvider: new MockProvider(() => ({
      kind: "analysis",
      provider: "demo",
      model: "demo",
      analysis: createTutorialAnalysis(),
      warnings: []
    })),
    demoFallbackEnabled: true,
    now: (() => {
      let current = 1000;
      return () => (current += 25);
    })()
  });

  assert.equal(result.provider, "demo");
  assert.equal(result.fallbackUsed, true);
  assert.ok(
    result.warnings.some((warning) => warning.includes("no FAL_KEY"))
  );
});

test("analyzeTutorial falls back to demo when the real provider fails", async () => {
  const request = createValidatedAnalysisRequest();

  const result = await analyzeTutorial(request, {
    realProvider: new MockProvider(() => {
      throw new Error("provider down");
    }),
    demoProvider: new MockProvider(() => ({
      kind: "analysis",
      provider: "demo",
      model: "demo",
      analysis: createTutorialAnalysis(),
      warnings: []
    })),
    demoFallbackEnabled: true,
    now: () => 1000
  });

  assert.equal(result.provider, "demo");
  assert.equal(result.fallbackUsed, true);
  assert.ok(
    result.warnings.some((warning) => warning.includes("Real AI analysis failed"))
  );
});

test("analyzeTutorial rejects unsafe tasks before provider execution", async () => {
  const request = createValidatedAnalysisRequest({
    taskTitle: "Repair a live electrical panel"
  });

  await assert.rejects(
    () =>
      analyzeTutorial(request, {
        realProvider: new MockProvider(() => ({
          kind: "analysis",
          provider: "fal",
          model: "google/gemini-2.5-flash",
          analysis: createTutorialAnalysis(),
          warnings: []
        })),
        demoProvider: new MockProvider(() => ({
          kind: "analysis",
          provider: "demo",
          model: "demo",
          analysis: createTutorialAnalysis(),
          warnings: []
        })),
        demoFallbackEnabled: true
      }),
    UnsafeTaskError
  );
});

test("analyzeTutorial errors when no provider is available and fallback is disabled", async () => {
  const request = createValidatedAnalysisRequest();

  await assert.rejects(
    () =>
      analyzeTutorial(request, {
        realProvider: null,
        demoProvider: new MockProvider(() => ({
          kind: "analysis",
          provider: "demo",
          model: "demo",
          analysis: createTutorialAnalysis(),
          warnings: []
        })),
        demoFallbackEnabled: false
      }),
    AnalysisConfigurationError
  );
});
