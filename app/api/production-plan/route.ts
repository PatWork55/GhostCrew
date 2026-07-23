import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AnalysisConfigurationError,
  AnalysisExecutionError,
  analyzeTutorial
} from "@/lib/analysis/analyze-tutorial";
import { analysisResponseSchema, validateAnalysisRequestPayload } from "@/lib/analysis-contract";
import { DemoVideoAnalysisProvider } from "@/lib/analysis/demo-video-analysis-provider";
import { FalVideoAnalysisProvider } from "@/lib/analysis/fal-video-analysis-provider";
import { UnsafeTaskError, assertSafeTask } from "@/lib/analysis/safety";
import { SUPPORTED_VIDEO_TYPES, VIDEO_UPLOAD_LIMITS } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import { buildProductionPlan } from "@/lib/production/build-production-plan";
import { buildFallbackDirectVideoUnderstanding } from "@/lib/production/fallback-direct-video-understanding";
import { FalVideoUnderstandingProvider } from "@/lib/production/fal-video-understanding-provider";
import { productionPlanResponseSchema } from "@/lib/production/production-plan-contract";
import { extractSourceSegments } from "@/lib/production/source-segmentation";
import { DirectVideoUnderstandingProviderError } from "@/lib/production/video-understanding-provider";

export const runtime = "nodejs";
export const maxDuration = 120;

function validateSourceVideoFile(file: File) {
  if (!SUPPORTED_VIDEO_TYPES.includes(file.type as (typeof SUPPORTED_VIDEO_TYPES)[number])) {
    throw new Error("Only MP4 and WebM source videos are supported.");
  }

  if (file.size > VIDEO_UPLOAD_LIMITS.maxBytes) {
    throw new Error("Source video is too large for this production-plan route.");
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sourceVideoFile = formData.get("video");
    const requestPayload = formData.get("request");
    const storyboardPayload = formData.get("storyboard");

    if (!(sourceVideoFile instanceof File)) {
      throw new Error("Attach the source video file before building a production plan.");
    }

    if (typeof requestPayload !== "string") {
      throw new Error("Missing production-plan request payload.");
    }

    validateSourceVideoFile(sourceVideoFile);

    const analysisRequest = validateAnalysisRequestPayload(
      JSON.parse(requestPayload) as unknown
    );

    if (
      analysisRequest.video.fileName !== sourceVideoFile.name ||
      analysisRequest.video.mimeType !== sourceVideoFile.type ||
      analysisRequest.video.fileSizeBytes !== sourceVideoFile.size
    ) {
      throw new Error(
        "The uploaded source video no longer matches the preprocessed browser metadata. Re-select the file and try again."
      );
    }

    assertSafeTask(analysisRequest);

    const storyboard =
      typeof storyboardPayload === "string"
        ? analysisResponseSchema.parse(JSON.parse(storyboardPayload) as unknown)
        : await analyzeTutorial(analysisRequest, {
            realProvider: serverEnv.falKey
              ? new FalVideoAnalysisProvider({
                  apiKey: serverEnv.falKey,
                  endpointId: serverEnv.falVisionEndpointId,
                  modelId: serverEnv.falVisionModel
                })
              : null,
            demoProvider: new DemoVideoAnalysisProvider(),
            demoFallbackEnabled: serverEnv.analysisFallbackEnabled
          });

    let directVideoWarnings: string[] = [];
    let directVideoProvider: "fal" | "fallback" = "fallback";
    let directVideoModel = "frame-fallback";
    let directVideoUsage:
      | {
          costUsd?: number;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        }
      | undefined;

    const directVideoProviderInstance = serverEnv.falKey
      ? new FalVideoUnderstandingProvider({
          apiKey: serverEnv.falKey,
          endpointId: "fal-ai/video-understanding"
        })
      : null;

    let directVideoUnderstanding = buildFallbackDirectVideoUnderstanding(
      analysisRequest,
      storyboard
    );

    if (directVideoProviderInstance) {
      try {
        const directVideoResult = await directVideoProviderInstance.understand({
          videoFile: sourceVideoFile,
          taskTitle: analysisRequest.taskTitle,
          description: analysisRequest.description,
          language: analysisRequest.language
        });

        if (directVideoResult.kind === "unsafe") {
          throw new UnsafeTaskError(directVideoResult.reason);
        }

        directVideoUnderstanding = directVideoResult.understanding;
        directVideoWarnings = directVideoResult.warnings;
        directVideoProvider = directVideoResult.provider;
        directVideoModel = directVideoResult.model;
        directVideoUsage = directVideoResult.usage;
      } catch (error) {
        if (error instanceof UnsafeTaskError) {
          throw error;
        }

        directVideoWarnings = [
          error instanceof DirectVideoUnderstandingProviderError
            ? `Direct video understanding failed (${error.message}). Using frame-based fallback instead.`
            : "Direct video understanding failed. Using frame-based fallback instead."
        ];
      }
    } else {
      directVideoWarnings = [
        "Direct video understanding is unavailable because FAL_KEY is not configured. Using the frame-based fallback instead."
      ];
    }

    const projectId = `project-${randomUUID()}`;
    const provisionalPlan = buildProductionPlan({
      projectId,
      analysis: storyboard,
      request: analysisRequest,
      directVideoUnderstanding,
      directVideoMeta: {
        provider: directVideoProvider,
        model: directVideoModel,
        warnings: directVideoWarnings,
        usage: directVideoUsage
      }
    });
    const sourceAssets = await extractSourceSegments({
      projectId,
      sourceVideoFile,
      plan: provisionalPlan
    });
    const productionPlan = buildProductionPlan({
      projectId,
      analysis: storyboard,
      request: analysisRequest,
      directVideoUnderstanding,
      sourceAssets,
      directVideoMeta: {
        provider: directVideoProvider,
        model: directVideoModel,
        warnings: directVideoWarnings,
        usage: directVideoUsage
      }
    });

    return NextResponse.json(
      productionPlanResponseSchema.parse({
        productionPlan,
        storyboard,
        directVideo: {
          provider: directVideoProvider,
          model: directVideoModel,
          fallbackUsed: directVideoProvider !== "fal",
          warnings: directVideoWarnings,
          understanding: directVideoUnderstanding,
          usage: directVideoUsage
        },
        warnings: [...storyboard.warnings, ...directVideoWarnings]
      })
    );
  } catch (error) {
    if (error instanceof UnsafeTaskError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error:
            "GhostCrew could not validate this production-plan request. Re-check the clip, selected frames, and task details."
        },
        { status: 400 }
      );
    }

    if (error instanceof AnalysisConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof AnalysisExecutionError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "GhostCrew could not build the production plan."
      },
      { status: 500 }
    );
  }
}
