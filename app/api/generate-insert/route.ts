import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { serverEnv } from "@/lib/env";
import { UnsafeTaskError } from "@/lib/analysis/safety";
import { FalGeneratedInsertProvider } from "@/lib/generation/fal-generated-insert-provider";
import {
  GeneratedInsertConfigurationError,
  GeneratedInsertExecutionError,
  generateInsert
} from "@/lib/generation/generate-insert";
import {
  GenerationRateLimitError,
  getClientIpAddress,
  reserveGeneratedInsertSlot
} from "@/lib/generation/generation-rate-limit";
import {
  validateGeneratedInsertRequestPayload
} from "@/lib/generation/generated-insert-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!serverEnv.generatedInsertsEnabled) {
    return NextResponse.json(
      {
        error:
          "Supplementary-view generation is currently disabled for this deployment."
      },
      { status: 503 }
    );
  }

  const clientIp = getClientIpAddress(request);
  let releaseGenerationSlot: (() => void) | null = null;

  try {
    const payload = validateGeneratedInsertRequestPayload(await request.json());
    releaseGenerationSlot = reserveGeneratedInsertSlot(
      clientIp,
      serverEnv.generationRateLimitPerHour
    );
    const result = await generateInsert(payload, {
      imageProvider: serverEnv.falKey
        ? new FalGeneratedInsertProvider({
            apiKey: serverEnv.falKey,
            endpointId: serverEnv.falImageEditEndpointId,
            modelId: serverEnv.falImageEditModel
          })
        : null
    });

    console.info("Generated insert completed", {
      stepId: result.stepId,
      provider: result.provider,
      imageModel: result.imageModel,
      resultType: result.resultType,
      latencyMs: result.usage.latencyMs,
      estimatedCostUsd: result.usage.estimatedCostUsd,
      warnings: result.warnings.length
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GenerationRateLimitError) {
      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds)
          }
        }
      );
    }

    if (error instanceof UnsafeTaskError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error:
            "GhostCrew could not validate this supplementary-view request. Check the selected source frame, intent, and limits, then try again."
        },
        { status: 400 }
      );
    }

    if (error instanceof GeneratedInsertConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof GeneratedInsertExecutionError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Generated insert request failed", {
      type: typeof error
    });

    return NextResponse.json(
      {
        error: "GhostCrew could not generate this supplementary view."
      },
      { status: 500 }
    );
  } finally {
    releaseGenerationSlot?.();
  }
}
