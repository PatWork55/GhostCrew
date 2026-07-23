import "server-only";

import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXPORT_LIMITS, NARRATION_LIMITS } from "@/lib/constants";
import type { TtsProvider, WordTimestamp } from "@/lib/audio/tts-provider";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import {
  productionPlanSchema,
  productionNarrationSchema,
  type ProductionNarration,
  type ProductionPlan,
  type ProductionSegment,
  type SourceAudioMode
} from "@/lib/production/production-plan";
import { registerTutorialExport } from "@/lib/export/export-registry";
import {
  buildSubtitleCues,
  buildTutorialExportReport,
  reconcileSegmentDuration,
  tutorialExportResponseSchema,
  type SubtitleCue
} from "@/lib/export/tutorial-export";
import { runFfmpegCommand } from "@/lib/media/ffmpeg";
import { inspectMediaFile } from "@/lib/media/ffprobe";

type NarrationRenderState = {
  timelineItemId: string;
  text: string;
  voice: string;
  audioPath: string | null;
  audioUrl: string | null;
  durationSeconds: number;
  wordTimestamps: WordTimestamp[];
  warnings: string[];
};

function roundTime(value: number) {
  return Number(value.toFixed(3));
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatSrtTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const millis = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function escapeSubtitlePath(path: string) {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function estimateWordTimestamps(text: string, durationSeconds: number): WordTimestamp[] {
  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (!words.length) {
    return [];
  }

  const perWordSeconds = durationSeconds / words.length;

  return words.map((word, index) => {
    const startSeconds = roundTime(index * perWordSeconds);
    const endSeconds = roundTime((index + 1) * perWordSeconds);

    return {
      word,
      startSeconds,
      endSeconds: Math.max(startSeconds + 0.05, endSeconds)
    };
  });
}

async function downloadFile(url: string, outputPath: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download media from ${url}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
}

async function writeSourceVideoToWorkspace(sourceVideoFile: File, workspaceDirectory: string) {
  const sourcePath = join(
    workspaceDirectory,
    `${randomUUID()}-${sanitizeFileName(sourceVideoFile.name)}`
  );

  await writeFile(sourcePath, Buffer.from(await sourceVideoFile.arrayBuffer()));

  return sourcePath;
}

async function writeSubtitleFile(cues: SubtitleCue[], outputPath: string) {
  const contents = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(
          cue.endSeconds
        )}\n${cue.text}\n`
    )
    .join("\n");

  await writeFile(outputPath, contents, "utf8");
}

async function extractSegmentSourceClip(input: {
  sourcePath: string;
  segment: ProductionSegment;
  outputPath: string;
}) {
  const durationSeconds = roundTime(input.segment.sourceEndTime - input.segment.sourceStartTime);

  await runFfmpegCommand([
    "-y",
    "-ss",
    String(input.segment.sourceStartTime),
    "-t",
    String(durationSeconds),
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-r",
    String(EXPORT_LIMITS.renderFps),
    "-c:v",
    "libx264",
    "-preset",
    EXPORT_LIMITS.videoPreset,
    "-crf",
    String(EXPORT_LIMITS.videoCrf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    EXPORT_LIMITS.audioBitrate,
    "-ar",
    String(EXPORT_LIMITS.audioSampleRate),
    "-movflags",
    "+faststart",
    input.outputPath
  ]);
}

function buildVideoFilter(input: {
  segment: ProductionSegment;
  subtitlePath: string;
  visualDurationSeconds: number;
  finalDurationSeconds: number;
}) {
  const filters: string[] = [];

  if (input.segment.selectedStrategy === "slow_motion" && input.segment.playbackRate !== 1) {
    filters.push(`setpts=${roundTime(1 / input.segment.playbackRate)}*PTS`);
  }

  if (
    input.segment.selectedStrategy === "tracked_zoom" ||
    input.segment.selectedStrategy === "static_crop"
  ) {
    filters.push("scale=iw*1.12:ih*1.12", "crop=iw/1.12:ih/1.12");
  }

  const extraHoldSeconds = roundTime(input.finalDurationSeconds - input.visualDurationSeconds);

  if (extraHoldSeconds > 0) {
    filters.push(`tpad=stop_mode=clone:stop_duration=${extraHoldSeconds}`);
  }

  filters.push(
    `subtitles='${escapeSubtitlePath(
      input.subtitlePath
    )}':force_style='Alignment=2,MarginV=36,FontSize=18,Outline=1.2,Shadow=0,BorderStyle=3,BackColour=&H80000000'`
  );

  return filters.join(",");
}

function buildSourceAudioFilters(input: {
  audioMode: SourceAudioMode;
  playbackRate: number;
  sourceVolume: number;
  finalDurationSeconds: number;
}) {
  const filters = ["aresample=44100"];

  if (input.playbackRate !== 1) {
    filters.push(`atempo=${input.playbackRate}`);
  }

  if (input.audioMode === "under_narration") {
    filters.push(`volume=${input.sourceVolume}`);
  }

  filters.push(`apad=pad_dur=${input.finalDurationSeconds}`);

  return filters.join(",");
}

async function synthesizeNarrationSegments(input: {
  productionPlan: ProductionPlan;
  narration: ProductionNarration;
  ttsProvider: TtsProvider | null;
  workspaceDirectory: string;
}) {
  const renderedSegments: NarrationRenderState[] = [];

  for (let index = 0; index < input.narration.segments.length; index += 1) {
    const narrationSegment = input.narration.segments[index];
    const timelineItem = input.productionPlan.finalTimeline.find(
      (item) => item.id === narrationSegment.timelineItemId
    );

    if (!timelineItem) {
      throw new Error(`Missing final timeline item ${narrationSegment.timelineItemId}.`);
    }

    const previousText = index > 0 ? input.narration.segments[index - 1]?.text : undefined;
    const nextText =
      index < input.narration.segments.length - 1
        ? input.narration.segments[index + 1]?.text
        : undefined;
    const visualDurationSeconds = roundTime(timelineItem.durationSeconds);

    if (input.ttsProvider) {
      try {
        const ttsResult = await input.ttsProvider.synthesizeSegment({
          narration: input.narration,
          segment: narrationSegment,
          previousText,
          nextText
        });
        const audioPath = join(
          input.workspaceDirectory,
          `${narrationSegment.timelineItemId}-narration.mp3`
        );

        await downloadFile(ttsResult.audioUrl, audioPath);

        renderedSegments.push({
          timelineItemId: narrationSegment.timelineItemId,
          text: narrationSegment.text,
          voice: input.narration.voice,
          audioPath,
          audioUrl: ttsResult.audioUrl,
          durationSeconds: roundTime(ttsResult.durationSeconds),
          wordTimestamps: ttsResult.wordTimestamps,
          warnings: ttsResult.warnings
        });
        continue;
      } catch (error) {
        renderedSegments.push({
          timelineItemId: narrationSegment.timelineItemId,
          text: narrationSegment.text,
          voice: input.narration.voice,
          audioPath: null,
          audioUrl: null,
          durationSeconds: visualDurationSeconds,
          wordTimestamps: estimateWordTimestamps(narrationSegment.text, visualDurationSeconds),
          warnings: [
            error instanceof Error
              ? `TTS fallback: ${error.message}`
              : "TTS fallback: narration audio generation failed."
          ]
        });
        continue;
      }
    }

    renderedSegments.push({
      timelineItemId: narrationSegment.timelineItemId,
      text: narrationSegment.text,
      voice: input.narration.voice,
      audioPath: null,
      audioUrl: null,
      durationSeconds: visualDurationSeconds,
      wordTimestamps: estimateWordTimestamps(narrationSegment.text, visualDurationSeconds),
      warnings: ["TTS fallback: no TTS provider is configured, so GhostCrew exported subtitles only."]
    });
  }

  return renderedSegments;
}

function applyExportDurations(input: {
  productionPlan: ProductionPlan;
  narration: ProductionNarration;
  renderedNarration: NarrationRenderState[];
}) {
  let currentOutputTime = 0;

  const timelineDurations = new Map<string, number>();

  const finalTimeline = input.productionPlan.finalTimeline.map((timelineItem) => {
    const narrationSegment = input.renderedNarration.find(
      (item) => item.timelineItemId === timelineItem.id
    );

    if (!narrationSegment) {
      throw new Error(`Missing narration render state for ${timelineItem.id}.`);
    }

    const durationSeconds = reconcileSegmentDuration({
      visualDurationSeconds: timelineItem.durationSeconds,
      narrationDurationSeconds: narrationSegment.durationSeconds
    });
    const outputStartTime = roundTime(currentOutputTime);
    const outputEndTime = roundTime(outputStartTime + durationSeconds);
    currentOutputTime = outputEndTime;
    timelineDurations.set(timelineItem.id, durationSeconds);

    return {
      ...timelineItem,
      durationSeconds,
      outputStartTime,
      outputEndTime
    };
  });

  const segments = input.productionPlan.segments.map((segment) => {
    const timelineItem = finalTimeline.find((item) => item.segmentId === segment.id);

    if (!timelineItem) {
      return segment;
    }

    return {
      ...segment,
      outputStartTime: timelineItem.outputStartTime,
      outputEndTime: timelineItem.outputEndTime
    };
  });

  const narration = productionNarrationSchema.parse({
    ...input.narration,
    segments: input.narration.segments.map((segment) => {
      const timelineItem = finalTimeline.find((item) => item.id === segment.timelineItemId);

      if (!timelineItem) {
        return segment;
      }

      return {
        ...segment,
        targetStartTime: timelineItem.outputStartTime,
        targetEndTime: timelineItem.outputEndTime
      };
    })
  });

  const updatedPlan = productionPlanSchema.parse({
    ...input.productionPlan,
    narration,
    segments,
    finalTimeline,
    provenance: [
      ...input.productionPlan.provenance,
      {
        id: "provenance-tts",
        kind: "tts",
        provider: input.renderedNarration.some((item) => item.audioUrl) ? "fal" : "fallback",
        model: input.renderedNarration.some((item) => item.audioUrl)
          ? "fal-ai/elevenlabs/tts/eleven-v3"
          : "subtitle-only-fallback",
        safePromptSummary: "Generated or estimated narration timing for each accepted timeline item.",
        latencyMs: null,
        estimatedCostUsd: null,
        status: "completed",
        warnings: input.renderedNarration.flatMap((item) => item.warnings)
      },
      {
        id: "provenance-render",
        kind: "render",
        provider: "ghostcrew",
        model: "ffmpeg-export-v1",
        safePromptSummary: "Deterministic MP4 assembly from accepted timeline assets, narration, and subtitles.",
        latencyMs: null,
        estimatedCostUsd: null,
        status: "completed",
        warnings: []
      }
    ]
  });

  return {
    productionPlan: updatedPlan,
    narration,
    timelineDurations
  };
}

async function renderSegmentVideo(input: {
  clipPath: string;
  outputPath: string;
  subtitlePath: string;
  segment: ProductionSegment;
  finalDurationSeconds: number;
  narrationAudioPath: string | null;
  sourceAudioMode: SourceAudioMode;
}) {
  const clipInfo = await inspectMediaFile(input.clipPath);
  const visualDurationSeconds = roundTime(clipInfo.durationSeconds || input.finalDurationSeconds);
  const videoFilter = buildVideoFilter({
    segment: input.segment,
    subtitlePath: input.subtitlePath,
    visualDurationSeconds,
    finalDurationSeconds: input.finalDurationSeconds
  });

  const args = [
    "-y",
    "-i",
    input.clipPath
  ];

  const filterParts: string[] = [`[0:v]${videoFilter}[vout]`];
  let audioMap = "";

  if (input.narrationAudioPath) {
    args.push("-i", input.narrationAudioPath);

    if (clipInfo.hasAudio && input.sourceAudioMode !== "mute_source") {
      filterParts.push(
        `[0:a]${buildSourceAudioFilters({
          audioMode: input.sourceAudioMode,
          playbackRate: input.segment.playbackRate,
          sourceVolume: EXPORT_LIMITS.defaultSourceAudioVolume,
          finalDurationSeconds: input.finalDurationSeconds
        })}[srca]`,
        `[1:a]aresample=44100,apad=pad_dur=${input.finalDurationSeconds}[narra]`,
        "[srca][narra]amix=inputs=2:duration=longest:normalize=0[aout]"
      );
      audioMap = "[aout]";
    } else {
      filterParts.push(`[1:a]aresample=44100,apad=pad_dur=${input.finalDurationSeconds}[aout]`);
      audioMap = "[aout]";
    }
  } else if (clipInfo.hasAudio && input.sourceAudioMode !== "mute_source") {
    filterParts.push(
      `[0:a]${buildSourceAudioFilters({
        audioMode: input.sourceAudioMode,
        playbackRate: input.segment.playbackRate,
        sourceVolume: EXPORT_LIMITS.defaultSourceAudioVolume,
        finalDurationSeconds: input.finalDurationSeconds
      })}[aout]`
    );
    audioMap = "[aout]";
  } else {
    args.push(
      "-f",
      "lavfi",
      "-t",
      String(input.finalDurationSeconds),
      "-i",
      `anullsrc=r=${EXPORT_LIMITS.audioSampleRate}:cl=stereo`
    );
    audioMap = "2:a";
  }

  await runFfmpegCommand([
    ...args,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    audioMap,
    "-t",
    String(input.finalDurationSeconds),
    "-r",
    String(EXPORT_LIMITS.renderFps),
    "-c:v",
    "libx264",
    "-preset",
    EXPORT_LIMITS.videoPreset,
    "-crf",
    String(EXPORT_LIMITS.videoCrf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    EXPORT_LIMITS.audioBitrate,
    "-ar",
    String(EXPORT_LIMITS.audioSampleRate),
    "-movflags",
    "+faststart",
    input.outputPath
  ]);
}

async function concatRenderedSegments(segmentPaths: string[], outputPath: string, workspaceDirectory: string) {
  const concatListPath = join(workspaceDirectory, "segments.txt");
  const concatList = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(concatListPath, concatList, "utf8");

  await runFfmpegCommand([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outputPath
  ]);
}

export async function renderTutorialExport(input: {
  sourceVideoFile: File;
  productionPlan: ProductionPlan;
  narration?: ProductionNarration | null;
  ttsProvider: TtsProvider | null;
}) {
  const exportId = `export-${randomUUID()}`;
  const workspaceDirectory = join(tmpdir(), EXPORT_LIMITS.exportDirectoryPrefix, exportId);
  await mkdir(workspaceDirectory, { recursive: true });

  const sourcePath = await writeSourceVideoToWorkspace(input.sourceVideoFile, workspaceDirectory);
  const narration =
    input.narration ??
    buildProductionNarration(input.productionPlan, {
      voice: NARRATION_LIMITS.defaultVoice
    });
  const renderedNarration = await synthesizeNarrationSegments({
    productionPlan: input.productionPlan,
    narration,
    ttsProvider: input.ttsProvider,
    workspaceDirectory
  });
  const { productionPlan, narration: updatedNarration } = applyExportDurations({
    productionPlan: input.productionPlan,
    narration,
    renderedNarration
  });

  const subtitles: SubtitleCue[] = [];
  const segmentVideoPaths: string[] = [];
  const warnings = renderedNarration.flatMap((segment) => segment.warnings);

  for (const timelineItem of productionPlan.finalTimeline) {
    const segment = productionPlan.segments.find((item) => item.id === timelineItem.segmentId);
    const narrationSegment = renderedNarration.find((item) => item.timelineItemId === timelineItem.id);

    if (!segment || !narrationSegment) {
      throw new Error(`Missing export data for ${timelineItem.id}.`);
    }

    const clipPath = join(workspaceDirectory, `${timelineItem.id}-source.mp4`);
    const subtitlePath = join(workspaceDirectory, `${timelineItem.id}.srt`);
    const renderedPath = join(workspaceDirectory, `${timelineItem.id}.mp4`);
    await extractSegmentSourceClip({
      sourcePath,
      segment,
      outputPath: clipPath
    });

    const segmentSubtitles = buildSubtitleCues({
      timelineItemId: timelineItem.id,
      wordTimestamps: narrationSegment.wordTimestamps
    });
    subtitles.push(...segmentSubtitles);
    await writeSubtitleFile(segmentSubtitles, subtitlePath);

    await renderSegmentVideo({
      clipPath,
      outputPath: renderedPath,
      subtitlePath,
      segment,
      finalDurationSeconds: timelineItem.durationSeconds,
      narrationAudioPath: narrationSegment.audioPath,
      sourceAudioMode: updatedNarration.sourceAudioMode
    });
    segmentVideoPaths.push(renderedPath);
  }

  const outputPath = join(workspaceDirectory, EXPORT_LIMITS.outputFileName);
  await concatRenderedSegments(segmentVideoPaths, outputPath, workspaceDirectory);
  const outputInfo = await inspectMediaFile(outputPath);
  const reportPath = join(workspaceDirectory, EXPORT_LIMITS.reportFileName);
  const output = {
    fileName: EXPORT_LIMITS.outputFileName,
    mimeType: "video/mp4" as const,
    durationSeconds: outputInfo.durationSeconds,
    width: outputInfo.width ?? productionPlan.sourceVideo.width,
    height: outputInfo.height ?? productionPlan.sourceVideo.height,
    downloadUrl: `/api/exports/${exportId}`,
    reportUrl: `/api/exports/${exportId}/report`
  };
  const report = buildTutorialExportReport({
    exportId,
    productionPlan,
    narration: updatedNarration,
    renderedNarration: renderedNarration.map((segment) => ({
      timelineItemId: segment.timelineItemId,
      audioUrl: segment.audioUrl,
      durationSeconds: segment.durationSeconds,
      wordTimestamps: segment.wordTimestamps,
      warnings: segment.warnings
    })),
    subtitles,
    warnings,
    output,
    audioMode: updatedNarration.sourceAudioMode
  });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  registerTutorialExport(exportId, {
    videoPath: outputPath,
    reportPath,
    fileName: output.fileName
  });

  return tutorialExportResponseSchema.parse({
    exportId,
    productionPlan,
    narration: updatedNarration,
    output,
    warnings
  });
}
