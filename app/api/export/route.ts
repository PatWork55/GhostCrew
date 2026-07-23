import { File } from "node:buffer";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { detectUnsafeTask } from "@/lib/analysis/safety";
import { serverEnv } from "@/lib/env";
import { renderTutorialExport } from "@/lib/export/render-tutorial";
import { tutorialExportResponseSchema } from "@/lib/export/tutorial-export";
import { VIDEO_UPLOAD_LIMITS } from "@/lib/constants";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import { productionPlanSchema } from "@/lib/production/production-plan";
import { FalElevenLabsTtsProvider } from "@/lib/audio/fal-elevenlabs-tts-provider";

export const runtime = "nodejs";
export const maxDuration = 240;

function validateSourceVideoFile(file: File) {
  if (!file.type.startsWith("video/")) {
    throw new Error("Attach the source video file before exporting the tutorial.");
  }

  if (file.size > VIDEO_UPLOAD_LIMITS.maxBytes) {
    throw new Error("Source video is too large for tutorial export.");
  }
}

export async function POST(request: Request) {
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
    const unsafeReason = detectUnsafeTask({
      taskTitle: productionPlan.task.title,
      description: productionPlan.task.description
    });

    if (unsafeReason) {
      return NextResponse.json({ error: unsafeReason }, { status: 422 });
    }

    const narration =
      productionPlan.narration ??
      buildProductionNarration(productionPlan, {
        voice: serverEnv.falTtsDefaultVoice
      });
    const ttsProvider = serverEnv.falKey
      ? new FalElevenLabsTtsProvider({
          apiKey: serverEnv.falKey,
          endpointId: serverEnv.falTtsEndpointId
        })
      : null;
    const exportResult = await renderTutorialExport({
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
