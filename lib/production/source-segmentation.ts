import "server-only";

import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { File } from "node:buffer";
import { registerProductionAsset } from "@/lib/production/asset-registry";
import type { ProductionMediaAsset, ProductionPlan } from "@/lib/production/production-plan";

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function fileExists(path: string | null | undefined) {
  if (!path) {
    return false;
  }

  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveFfmpegBinary() {
  const candidates = [
    ffmpegPath as string | null | undefined,
    process.env.FFMPEG_BIN,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg")
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && (await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    "GhostCrew could not locate an ffmpeg binary for source clip extraction. Set FFMPEG_BIN or install ffmpeg-static in the deployment environment."
  );
}

async function runCommand(args: string[]) {
  const ffmpegBinary = await resolveFfmpegBinary();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });

    child.on("error", (error: Error) => {
      reject(error);
    });

    child.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? -1}.`));
    });
  });
}

export async function extractSourceSegments(input: {
  projectId: string;
  sourceVideoFile: File;
  plan: ProductionPlan;
}) {
  const workingDirectory = join(tmpdir(), "ghostcrew-production", input.projectId);
  await mkdir(workingDirectory, { recursive: true });

  const inputPath = join(
    workingDirectory,
    `${randomUUID()}-${input.sourceVideoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  );
  await writeFile(inputPath, Buffer.from(await input.sourceVideoFile.arrayBuffer()));

  const assetsByStepId: Record<string, ProductionMediaAsset> = {};

  for (const segment of input.plan.segments) {
    const assetId = `${segment.stepId}-asset-source`;
    const outputFileName = `${segment.stepId}-source.mp4`;
    const outputPath = join(workingDirectory, outputFileName);
    const durationSeconds = Math.max(
      0.25,
      roundTime(segment.sourceEndTime - segment.sourceStartTime)
    );

    await runCommand([
      "-y",
      "-i",
      inputPath,
      "-ss",
      String(segment.sourceStartTime),
      "-t",
      String(durationSeconds),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath
    ]);

    registerProductionAsset(input.projectId, assetId, {
      path: outputPath,
      mimeType: "video/mp4",
      fileName: outputFileName
    });

    const fileStats = await readFile(outputPath);

    assetsByStepId[segment.stepId] = {
      id: assetId,
      type: "video",
      source: "original",
      fileName: outputFileName,
      mediaUrl: `/api/production-assets/${input.projectId}/${assetId}`,
      durationSeconds,
      width: input.plan.sourceVideo.width,
      height: input.plan.sourceVideo.height,
      mimeType: "video/mp4",
      originSegmentId: segment.id,
      createdBy: "ffmpeg-segmentation",
      warnings:
        fileStats.length === 0
          ? ["The extracted segment file is unexpectedly empty."]
          : []
    };
  }

  return assetsByStepId;
}
