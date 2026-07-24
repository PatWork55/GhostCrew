import { buildProductionNarration } from "@/lib/narration/build-narration";
import { handleExportRequest } from "@/lib/export/handle-export-request";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: Request) {
  const [{ serverEnv }, { FalElevenLabsTtsProvider }, { renderTutorialExport }] =
    await Promise.all([
      import("@/lib/env"),
      import("@/lib/audio/fal-elevenlabs-tts-provider"),
      import("@/lib/export/render-tutorial")
    ]);

  return handleExportRequest(request, {
    renderTutorialExport,
    buildNarration: (productionPlan) =>
      productionPlan.narration ??
      buildProductionNarration(productionPlan, {
        voice: serverEnv.falTtsDefaultVoice
      }),
    createTtsProvider: () =>
      serverEnv.falKey
        ? new FalElevenLabsTtsProvider({
            apiKey: serverEnv.falKey,
            endpointId: serverEnv.falTtsEndpointId
          })
        : null
  });
}
