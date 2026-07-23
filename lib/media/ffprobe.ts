import "server-only";

import { access, constants as fsConstants } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ffprobePath from "ffprobe-static";

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  sample_rate?: string;
};

type FfprobeFormat = {
  duration?: string;
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
};

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

async function resolveFfprobeBinary() {
  const candidates = [
    ffprobePath.path as string | null | undefined,
    process.env.FFPROBE_BIN,
    join(process.cwd(), "node_modules", "ffprobe-static", "bin", "linux", "x64", "ffprobe")
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && (await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    "GhostCrew could not locate an ffprobe binary. Set FFPROBE_BIN or install ffprobe-static in the runtime environment."
  );
}

function parseFrameRate(rawRate: string | undefined) {
  if (!rawRate || !rawRate.includes("/")) {
    return null;
  }

  const [numeratorRaw, denominatorRaw] = rawRate.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(3));
}

export async function inspectMediaFile(path: string) {
  const ffprobeBinary = await resolveFfprobeBinary();

  return new Promise<{
    hasAudio: boolean;
    durationSeconds: number;
    width: number | null;
    height: number | null;
    fps: number | null;
    audioSampleRate: number | null;
  }>((resolve, reject) => {
    const child = spawn(
      ffprobeBinary,
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        path
      ],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });

    child.on("error", (error: Error) => {
      reject(error);
    });

    child.on("exit", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? -1}.`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as FfprobeOutput;
        const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
        const audioStream = parsed.streams?.find((stream) => stream.codec_type === "audio");
        const durationSeconds = Number(
          (
            Number(parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration ?? 0) || 0
          ).toFixed(3)
        );

        resolve({
          hasAudio: Boolean(audioStream),
          durationSeconds,
          width: videoStream?.width ?? null,
          height: videoStream?.height ?? null,
          fps: parseFrameRate(videoStream?.r_frame_rate),
          audioSampleRate:
            audioStream?.sample_rate && Number.isFinite(Number(audioStream.sample_rate))
              ? Number(audioStream.sample_rate)
              : null
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to parse ffprobe output."));
      }
    });
  });
}
