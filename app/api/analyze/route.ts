import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { validateAnalysisRequestPayload } from "@/lib/analysis-contract";
import {
  AnalysisConfigurationError,
  AnalysisExecutionError,
  analyzeTutorial
} from "@/lib/analysis/analyze-tutorial";
import { DemoVideoAnalysisProvider } from "@/lib/analysis/demo-video-analysis-provider";
import { FalVideoAnalysisProvider } from "@/lib/analysis/fal-video-analysis-provider";
import { UnsafeTaskError } from "@/lib/analysis/safety";
import { serverEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const payload = validateAnalysisRequestPayload(await request.json());
    const result = await analyzeTutorial(payload, {
      realProvider: serverEnv.falKey
        ? new FalVideoAnalysisProvider({
            apiKey: serverEnv.falKey,
            endpointId: serverEnv.falVisionEndpointId,
            modelId: serverEnv.falVisionModel
          })
        : null,
      demoProvider: new DemoVideoAnalysisProvider(),
      demoFallbackEnabled: serverEnv.demoFallbackEnabled
    });

    console.info("Tutorial analysis completed", {
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      selectedFrameCount: result.usage.selectedFrameCount,
      aggregateImageBytes: result.usage.aggregateImageBytes,
      latencyMs: result.usage.latencyMs,
      warnings: result.warnings.length
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnsafeTaskError) {
      return NextResponse.json(
        {
          error: error.message
        },
        { status: 422 }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "GhostCrew could not validate this analysis request. Check the selected frames, timestamps, and metadata, then try again."
        },
        { status: 400 }
      );
    }

    if (error instanceof AnalysisConfigurationError) {
      return NextResponse.json(
        {
          error: error.message
        },
        { status: 503 }
      );
    }

    if (error instanceof AnalysisExecutionError) {
      return NextResponse.json(
        {
          error: error.message
        },
        { status: 502 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: error.message
        },
        { status: 400 }
      );
    }

    console.error("Analysis request failed", {
      type: typeof error
    });

    return NextResponse.json({ error: "GhostCrew could not analyze this clip." }, { status: 500 });
  }
}
