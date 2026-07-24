import assert from "node:assert/strict";
import test from "node:test";
import { handleExportRequest } from "@/lib/export/handle-export-request";
import { detectUnsafeTask } from "@/lib/analysis/safety";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import { buildProductionPlan } from "@/lib/production/build-production-plan";
import {
  createAnalysisResponse,
  createDirectVideoUnderstanding,
  createValidatedAnalysisRequest
} from "@/tests/fixtures";

function createProductionPlan(taskTitle = "Assemble a phone stand", description = "Show the hinge.") {
  return buildProductionPlan({
    projectId: "project-export-test",
    analysis: createAnalysisResponse(),
    request: createValidatedAnalysisRequest({
      taskTitle,
      description
    }),
    directVideoUnderstanding: createDirectVideoUnderstanding()
  });
}

function createExportRequest(productionPlan = createProductionPlan()) {
  const formData = new FormData();
  formData.set(
    "video",
    new Blob([Buffer.alloc(2_048)], { type: "video/mp4" }),
    "phone-stand.mp4"
  );
  formData.set("productionPlan", JSON.stringify(productionPlan));

  return new Request("http://localhost/api/export", {
    method: "POST",
    headers: {
      "content-length": "2048"
    },
    body: formData
  });
}

function createExportResponse(productionPlan = createProductionPlan()) {
  const narration =
    productionPlan.narration ??
    buildProductionNarration(productionPlan, {
      voice: "Rachel",
      sourceAudioMode: "mute_source"
    });

  return {
    exportId: "export-test",
    productionPlan,
    narration,
    output: {
      fileName: "ghostcrew-tutorial.mp4",
      mimeType: "video/mp4" as const,
      durationSeconds: 11.5,
      width: 960,
      height: 540,
      downloadUrl: "/api/exports/export-test",
      reportUrl: "/api/exports/export-test/report"
    },
    warnings: []
  };
}

test("handleExportRequest allows { unsafe: false, reason: null } and reaches the renderer", async () => {
  const productionPlan = createProductionPlan();
  const logs: unknown[] = [];
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(productionPlan), {
    detectUnsafeTask: (() => ({
      unsafe: false,
      reason: null
    })) as typeof detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse(productionPlan);
    }),
    createTtsProvider: () => null,
    log: (payload) => {
      logs.push(payload);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(rendererCalls, 1);
  assert.deepEqual(await response.json(), createExportResponse(productionPlan));
  assert.deepEqual(logs, [
    {
      unsafe: false,
      hasReason: false,
      projectId: "project-export-test",
      segmentCount: productionPlan.segments.length,
      requestContentLength: 2048,
      renderingReached: false
    },
    {
      unsafe: false,
      hasReason: false,
      projectId: "project-export-test",
      segmentCount: productionPlan.segments.length,
      requestContentLength: 2048,
      renderingReached: true
    }
  ]);
});

test("handleExportRequest returns 422 with the unsafe export contract when unsafe is true", async () => {
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(), {
    detectUnsafeTask: (() => ({
      unsafe: true,
      reason: "GhostCrew does not support electrical repair or breaker-panel instructions."
    })) as typeof detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse();
    }),
    createTtsProvider: () => null,
    log: () => {}
  });

  assert.equal(response.status, 422);
  assert.equal(rendererCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Unsafe export request",
    reason: "GhostCrew does not support electrical repair or breaker-panel instructions."
  });
});

test("handleExportRequest fails safely when detectUnsafeTask returns null", async () => {
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(), {
    detectUnsafeTask: (() => null) as unknown as typeof detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse();
    }),
    createTtsProvider: () => null,
    log: () => {}
  });

  assert.equal(response.status, 422);
  assert.equal(rendererCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Unsafe export request",
    reason: "GhostCrew could not verify that this export request is safe."
  });
});

test("handleExportRequest fails safely when detectUnsafeTask returns malformed output", async () => {
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(), {
    detectUnsafeTask: (() => ({
      reason: null
    })) as unknown as typeof detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse();
    }),
    createTtsProvider: () => null,
    log: () => {}
  });

  assert.equal(response.status, 422);
  assert.equal(rendererCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Unsafe export request",
    reason: "GhostCrew could not verify that this export request is safe."
  });
});

test("handleExportRequest does not reject a harmless phone-stand tutorial", async () => {
  const productionPlan = createProductionPlan("Assemble a phone stand", "Show the hinge and the lock.");
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(productionPlan), {
    detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse(productionPlan);
    }),
    createTtsProvider: () => null,
    log: () => {}
  });

  assert.equal(response.status, 200);
  assert.equal(rendererCalls, 1);
});

test("handleExportRequest still rejects an actually unsafe tutorial", async () => {
  const productionPlan = createProductionPlan(
    "Replace a breaker in an electrical panel",
    "Show the wires and the live circuit."
  );
  let rendererCalls = 0;

  const response = await handleExportRequest(createExportRequest(productionPlan), {
    detectUnsafeTask,
    renderTutorialExport: (async () => {
      rendererCalls += 1;
      return createExportResponse(productionPlan);
    }),
    createTtsProvider: () => null,
    log: () => {}
  });

  assert.equal(response.status, 422);
  assert.equal(rendererCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Unsafe export request",
    reason: "GhostCrew does not support electrical repair or breaker-panel instructions."
  });
});
