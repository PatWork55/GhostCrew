import assert from "node:assert/strict";
import test from "node:test";
import {
  generatedInsertRenderStateSchema,
  validateGeneratedInsertRequestPayload
} from "@/lib/generation/generated-insert-schema";
import {
  createGeneratedInsertRequest
} from "@/tests/fixtures";

test("validateGeneratedInsertRequestPayload rejects malformed Data URLs", () => {
  const request = createGeneratedInsertRequest({
    sourceFrame: {
      ...createGeneratedInsertRequest().sourceFrame,
      imageDataUrl: "data:image/webp;base64,***"
    }
  });

  assert.throws(
    () => validateGeneratedInsertRequestPayload(request),
    /malformed image Data URL/
  );
});

test("validateGeneratedInsertRequestPayload rejects unknown evidence-frame ids", () => {
  const request = createGeneratedInsertRequest({
    evidenceFrameIds: ["frame-3", "frame-4"],
    sourceFrame: {
      ...createGeneratedInsertRequest().sourceFrame,
      id: "frame-2"
    }
  });

  assert.throws(
    () => validateGeneratedInsertRequestPayload(request),
    /selected step evidence/
  );
});

test("validateGeneratedInsertRequestPayload rejects timestamps outside the source duration", () => {
  const request = createGeneratedInsertRequest({
    sourceFrame: {
      ...createGeneratedInsertRequest().sourceFrame,
      timestampSeconds: 30
    }
  });

  assert.throws(
    () => validateGeneratedInsertRequestPayload(request),
    /outside the source-video duration/
  );
});

test("validateGeneratedInsertRequestPayload enforces prompt-length limits", () => {
  const request = createGeneratedInsertRequest({
    intent: "x".repeat(400)
  });

  assert.throws(() => validateGeneratedInsertRequestPayload(request));
});

test("generatedInsertRenderStateSchema validates completed insert metadata", () => {
  assert.throws(() =>
    generatedInsertRenderStateSchema.parse({
      status: "completed",
      intent: "Close-up",
      sourceFrameId: "frame-2",
      mediaType: null,
      mediaUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      provider: null,
      model: null,
      warnings: [],
      generationPromptSummary: null,
      attemptCount: 1
    })
  );
});
