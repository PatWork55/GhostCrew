import "server-only";

import { access, constants as fsConstants } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

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

export async function resolveFfmpegBinary() {
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
    "GhostCrew could not locate an ffmpeg binary. Set FFMPEG_BIN or install ffmpeg-static in the runtime environment."
  );
}

export async function runFfmpegCommand(args: string[]) {
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
