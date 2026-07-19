import assert from "node:assert/strict";
import test from "node:test";
import {
  GeneratedInsertConfigurationError,
  generateInsert
} from "@/lib/generation/generate-insert";
import type {
  GeneratedInsertProvider,
  GeneratedInsertProviderSuccess
} from "@/lib/generation/generated-insert-provider";
import {
  canRegenerateGeneratedInsert,
  canStartGeneratedInsert,
  shouldUseAcceptedGeneratedImage
} from "@/lib/generation/generated-insert-state";
import { UnsafeTaskError } from "@/lib/analysis/safety";
import {
  createValidatedGeneratedInsertRequest
} from "@/tests/fixtures";

class MockGeneratedInsertProvider implements GeneratedInsertProvider {
  constructor(
    private readonly handler:
      | ((
          request: ReturnType<typeof createValidatedGeneratedInsertRequest>
        ) => Promise<GeneratedInsertProviderSuccess> | GeneratedInsertProviderSuccess)
  ) {}

  generate(request: ReturnType<typeof createValidatedGeneratedInsertRequest>) {
    return Promise.resolve(this.handler(request));
  }
}

test("generateInsert rejects unsafe tasks", async () => {
  const request = createValidatedGeneratedInsertRequest({
    taskTitle: "Repair a live wall outlet"
  });

  await assert.rejects(
    () =>
      generateInsert(request, {
        imageProvider: new MockGeneratedInsertProvider(() => {
          throw new Error("should not run");
        })
      }),
    UnsafeTaskError
  );
});

test("generateInsert requires a configured provider", async () => {
  await assert.rejects(
    () =>
      generateInsert(createValidatedGeneratedInsertRequest(), {
        imageProvider: null
      }),
    GeneratedInsertConfigurationError
  );
});

test("generateInsert normalizes a successful image result", async () => {
  const request = createValidatedGeneratedInsertRequest();
  const result = await generateInsert(request, {
    imageProvider: new MockGeneratedInsertProvider(() => ({
      provider: "fal",
      imageModel: "fal-ai/nano-banana-2/edit",
      videoModel: null,
      resultType: "image",
      mediaUrl: "https://example.com/generated.png",
      thumbnailUrl: "https://example.com/generated.png",
      durationSeconds: 3,
      width: 1280,
      height: 720,
      generationPromptSummary: "Create a clearer hinge close-up.",
      warnings: [],
      estimatedCostUsd: 0.08
    })),
    now: (() => {
      let current = 1_000;
      return () => (current += 250);
    })()
  });

  assert.equal(result.provider, "fal");
  assert.equal(result.resultType, "image");
  assert.equal(result.usage.estimatedCostUsd, 0.08);
  assert.equal(result.stepId, request.stepId);
});

test("generateInsert falls back to an image result when video was requested", async () => {
  const result = await generateInsert(
    createValidatedGeneratedInsertRequest({
      outputType: "video"
    }),
    {
      imageProvider: new MockGeneratedInsertProvider(() => ({
        provider: "fal",
        imageModel: "fal-ai/nano-banana-2/edit",
        videoModel: null,
        resultType: "image",
        mediaUrl: "https://example.com/generated.png",
        thumbnailUrl: "https://example.com/generated.png",
        durationSeconds: 3,
        width: 1280,
        height: 720,
        generationPromptSummary: "Create a clearer hinge close-up.",
        warnings: [],
        estimatedCostUsd: 0.08
      }))
    }
  );

  assert.equal(result.resultType, "image");
  assert.ok(result.warnings.some((warning) => warning.includes("Video animation")));
});

test("generateInsert ignores removed client quota fields because they are no longer part of the API contract", async () => {
  const result = await generateInsert(
    createValidatedGeneratedInsertRequest(),
    {
      imageProvider: new MockGeneratedInsertProvider(() => ({
        provider: "fal",
        imageModel: "fal-ai/nano-banana-2/edit",
        videoModel: null,
        resultType: "image",
        mediaUrl: "https://example.com/generated.png",
        thumbnailUrl: "https://example.com/generated.png",
        durationSeconds: 3,
        width: 1280,
        height: 720,
        generationPromptSummary: "Create a clearer hinge close-up.",
        warnings: [],
        estimatedCostUsd: 0.08
      }))
    }
  );

  assert.equal(result.provider, "fal");
  assert.equal(result.resultType, "image");
});

test("generated insert state helpers prevent duplicate submission and media-load misuse", () => {
  assert.equal(
    canStartGeneratedInsert({
      status: "queued",
      acceptedInsertCount: 0,
      sessionGenerationCount: 0
    }),
    false
  );
  assert.equal(
    canRegenerateGeneratedInsert({
      status: "fallback_active",
      attemptCount: 1
    }),
    true
  );
  assert.equal(
    shouldUseAcceptedGeneratedImage(
      {
        status: "completed",
        intent: "intent",
        sourceFrameId: "frame-2",
        mediaType: "image",
        mediaUrl: "https://example.com/generated.png",
        thumbnailUrl: "https://example.com/generated.png",
        durationSeconds: 3,
        provider: "fal",
        model: "fal-ai/nano-banana-2/edit",
        warnings: [],
        generationPromptSummary: "summary",
        attemptCount: 1
      },
      true
    ),
    false
  );
});
