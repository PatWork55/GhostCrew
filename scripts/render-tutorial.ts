import { basename, join } from "node:path";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { File } from "node:buffer";
import { serverEnv } from "@/lib/env";
import { renderTutorialExport } from "@/lib/export/render-tutorial";
import { getTutorialExport } from "@/lib/export/export-registry";
import { productionPlanSchema } from "@/lib/production/production-plan";
import { FalElevenLabsTtsProvider } from "@/lib/audio/fal-elevenlabs-tts-provider";

function getArgValue(flag: string) {
  const entry = process.argv.find((value) => value.startsWith(`${flag}=`));

  return entry ? entry.slice(flag.length + 1) : null;
}

function inferMimeType(filePath: string) {
  if (filePath.endsWith(".webm")) {
    return "video/webm";
  }

  return "video/mp4";
}

async function main() {
  const sourcePath = getArgValue("--source");
  const planPath = getArgValue("--plan");
  const outputDirectory = getArgValue("--output-dir") ?? join(process.cwd(), "exports");

  if (!sourcePath || !planPath) {
    throw new Error(
      "Usage: npm run export:tutorial -- --source=/abs/path/video.mp4 --plan=/abs/path/production-plan.json [--output-dir=/abs/path/exports]"
    );
  }

  const [sourceBytes, planBytes] = await Promise.all([readFile(sourcePath), readFile(planPath, "utf8")]);
  const productionPlan = productionPlanSchema.parse(JSON.parse(planBytes) as unknown);
  const ttsProvider = serverEnv.falKey
    ? new FalElevenLabsTtsProvider({
        apiKey: serverEnv.falKey,
        endpointId: serverEnv.falTtsEndpointId
      })
    : null;
  const sourceVideoFile = new File([sourceBytes], basename(sourcePath), {
    type: inferMimeType(sourcePath)
  });
  const result = await renderTutorialExport({
    sourceVideoFile,
    productionPlan,
    narration: productionPlan.narration,
    ttsProvider
  });
  const exportRecord = getTutorialExport(result.exportId);

  if (!exportRecord) {
    throw new Error("The tutorial export completed but the registry entry is missing.");
  }

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    copyFile(exportRecord.videoPath, join(outputDirectory, exportRecord.fileName)),
    copyFile(exportRecord.reportPath, join(outputDirectory, "ghostcrew-process-report.json"))
  ]);

  console.log(
    JSON.stringify(
      {
        exportId: result.exportId,
        outputDirectory,
        videoFile: join(outputDirectory, exportRecord.fileName),
        reportFile: join(outputDirectory, "ghostcrew-process-report.json")
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "GhostCrew export failed.");
  process.exitCode = 1;
});
