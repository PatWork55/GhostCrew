import { File } from "node:buffer";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { TtsProvider } from "@/lib/audio/tts-provider";
import {
  detectUnsafeTask,
  normalizeTaskSafetyResult,
  type TaskSafetyResult
} from "@/lib/analysis/safety";
import { NARRATION_LIMITS, VIDEO_UPLOAD_LIMITS } from "@/lib/constants";
import {
  tutorialExportResponseSchema,
  type TutorialExportResponse
} from "@/lib/export/tutorial-export";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import {
  productionPlanSchema,
  type ProductionNarration,
  type ProductionPlan
} from "@/lib/production/production-plan";

export const UNSAFE_EXPORT_ERROR = "Unsafe export request";

export type ExportRouteLogPayload = {
  unsafe: boolean;
  hasReason: boolean;
  projectId: string;
  segmentCount: number;
  requestContentLength: number | null;
  renderingReached: boolean;
};

export type ExportRouteDependencies = {
  detectUnsafeTask: typeof detectUnsafeTask;
  renderTutorialExport: (input: {
    sourceVideoFile: File;
    productionPlan: ProductionPlan;
    narration?: ProductionNarration | null;
    ttsProvider: TtsProvider | null;
  }) => Promise<TutorialExportResponse>;
  buildNarration: (productionPlan: ProductionPlan) => ProductionNarration;
  createTtsProvider: () => TtsProvider | null;
  log: (payload: ExportRouteLogPayload) => void;
};

function validateSourceVideoFile(file: File) {
  if (!file.type.startsWith("video/")) {
    throw new Error("Attach the source video file before exporting the tutorial.");
  }

  if (file.size > VIDEO_UPLOAD_LIMITS.maxBytes) {
    throw new Error("Source video is too large for tutorial export.");
  }
}

function getRequestContentLength(request: Request) {
  const header = request.headers.get("content-length");

  if (!header) {
    return null;
  }

  const parsed = Number.parseInt(header, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

export function logExportRoute(payload: ExportRouteLogPayload) {
  console.info("[api/export]", payload);
}

function createUnsafeExportResponse(reason: string) {
  return NextResponse.json(
    {
      error: UNSAFE_EXPORT_ERROR,
      reason
    },
    { status: 422 }
  );
}

export function createDefaultExportRouteDependencies(): ExportRouteDependencies {
  return {
    detectUnsafeTask,
    renderTutorialExport: async () => {
      throw new Error("GhostCrew could not load the export renderer.");
    },
    buildNarration: (productionPlan) =>
      productionPlan.narration ??
      buildProductionNarration(productionPlan, {
        voice: NARRATION_LIMITS.defaultVoice
      }),
    createTtsProvider: () => null,
    log: logExportRoute
  };
}

export async function handleExportRequest(
  request: Request,
  dependencies: Partial<ExportRouteDependencies> = {}
) {
  const resolvedDependencies = {
    ...createDefaultExportRouteDependencies(),
    ...dependencies
  } satisfies ExportRouteDependencies;
  const requestContentLength = getRequestContentLength(request);
  let projectId = "unknown";
  let segmentCount = 0;
  let renderingReached = false;

  try {
    const formData = await request.formData();
    const sourceVideoFile = formData.get("video");
    const productionPlanPayload = formData.get("productionPlan");

    if (!(sourceVideoFile instanceof File)) {
      throw new Error("Attach the source video file before exporting the tutorial.");
    }

    if (typeof productionPlanPayload !== "string") {
      throw new Error("Missing serialized production plan.");
    }

    validateSourceVideoFile(sourceVideoFile);

    const productionPlan = productionPlanSchema.parse(
      JSON.parse(productionPlanPayload) as unknown
    );
    projectId = productionPlan.projectId;
    segmentCount = productionPlan.segments.length;
    const safetyResult: TaskSafetyResult = normalizeTaskSafetyResult(
      resolvedDependencies.detectUnsafeTask({
        taskTitle: productionPlan.task.title,
        description: productionPlan.task.description
      })
    );

    resolvedDependencies.log({
      unsafe: safetyResult.unsafe,
      hasReason: Boolean(safetyResult.reason),
      projectId,
      segmentCount,
      requestContentLength,
      renderingReached
    });

    if (safetyResult.unsafe === true) {
      return createUnsafeExportResponse(
        safetyResult.reason ?? "GhostCrew could not verify that this export request is safe."
      );
    }

    const narration = resolvedDependencies.buildNarration(productionPlan);
    const ttsProvider = resolvedDependencies.createTtsProvider();
    renderingReached = true;

    resolvedDependencies.log({
      unsafe: safetyResult.unsafe,
      hasReason: Boolean(safetyResult.reason),
      projectId,
      segmentCount,
      requestContentLength,
      renderingReached
    });

    const exportResult = await resolvedDependencies.renderTutorialExport({
      sourceVideoFile,
      productionPlan,
      narration,
      ttsProvider
    });

    return NextResponse.json(tutorialExportResponseSchema.parse(exportResult));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error:
            "GhostCrew could not validate the production plan for export. Rebuild the plan and try again."
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "GhostCrew could not render the final MP4."
      },
      { status: 500 }
    );
  }
}
