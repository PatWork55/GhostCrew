import { z } from "zod";
import { NARRATION_LIMITS } from "@/lib/constants";
import {
  productionPlanSchema,
  productionNarrationSchema,
  sourceAudioModeSchema,
  type ProductionPlan,
  type SourceAudioMode
} from "@/lib/production/production-plan";

export const wordTimestampSchema = z.object({
  word: z.string().min(1),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0)
});

export const subtitleCueSchema = z.object({
  id: z.string().min(1),
  timelineItemId: z.string().min(1),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  text: z.string().min(1)
});

export const renderedNarrationSegmentSchema = z.object({
  timelineItemId: z.string().min(1),
  audioUrl: z.string().url().nullable(),
  durationSeconds: z.number().min(0),
  wordTimestamps: z.array(wordTimestampSchema),
  warnings: z.array(z.string())
});

export const tutorialExportSegmentReportSchema = z.object({
  timelineItemId: z.string().min(1),
  segmentId: z.string().min(1),
  stepId: z.string().min(1),
  selectedStrategy: z.string().min(1),
  classification: z.enum(["original", "deterministic", "generated"]),
  audioMode: sourceAudioModeSchema,
  subtitleCueIds: z.array(z.string().min(1)),
  narrationDurationSeconds: z.number().min(0),
  finalDurationSeconds: z.number().positive(),
  provenanceIds: z.array(z.string().min(1)),
  warnings: z.array(z.string())
});

export const tutorialExportOutputSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.literal("video/mp4"),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  downloadUrl: z.string().min(1),
  reportUrl: z.string().min(1)
});

export const tutorialExportReportSchema = z.object({
  exportId: z.string().min(1),
  createdAtIso: z.string().min(1),
  productionPlan: productionPlanSchema,
  narration: productionNarrationSchema,
  renderedNarration: z.array(renderedNarrationSegmentSchema),
  subtitles: z.array(subtitleCueSchema),
  segments: z.array(tutorialExportSegmentReportSchema),
  output: tutorialExportOutputSchema,
  warnings: z.array(z.string())
});

export const tutorialExportResponseSchema = z.object({
  exportId: z.string().min(1),
  productionPlan: productionPlanSchema,
  narration: productionNarrationSchema,
  output: tutorialExportOutputSchema,
  warnings: z.array(z.string())
});

export type WordTimestampRecord = z.infer<typeof wordTimestampSchema>;
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;
export type TutorialExportReport = z.infer<typeof tutorialExportReportSchema>;
export type TutorialExportResponse = z.infer<typeof tutorialExportResponseSchema>;

export function reconcileSegmentDuration(input: {
  visualDurationSeconds: number;
  narrationDurationSeconds: number;
}) {
  return Number(
    Math.max(
      input.visualDurationSeconds,
      input.narrationDurationSeconds + NARRATION_LIMITS.defaultSpeechPaddingSeconds
    ).toFixed(3)
  );
}

function joinWords(words: string[]) {
  if (!words.length) {
    return "";
  }

  const joined = words.join(" ").replace(/\s+/g, " ").trim();

  if (joined.length <= NARRATION_LIMITS.maximumSubtitleCharactersPerCue) {
    return joined;
  }

  const midpoint = Math.ceil(words.length / 2);
  const left = words.slice(0, midpoint).join(" ").trim();
  const right = words.slice(midpoint).join(" ").trim();

  return `${left}\n${right}`;
}

export function buildSubtitleCues(input: {
  timelineItemId: string;
  wordTimestamps: WordTimestampRecord[];
}) {
  const cues: SubtitleCue[] = [];
  let currentWords: string[] = [];
  let currentStart: number | null = null;
  let currentEnd = 0;

  function flushCue() {
    if (!currentWords.length || currentStart === null) {
      currentWords = [];
      currentStart = null;
      currentEnd = 0;
      return;
    }

    cues.push(
      subtitleCueSchema.parse({
        id: `${input.timelineItemId}-subtitle-${cues.length + 1}`,
        timelineItemId: input.timelineItemId,
        startSeconds: Number(currentStart.toFixed(3)),
        endSeconds: Number(Math.max(currentStart + 0.05, currentEnd).toFixed(3)),
        text: joinWords(currentWords)
      })
    );

    currentWords = [];
    currentStart = null;
    currentEnd = 0;
  }

  for (const word of input.wordTimestamps) {
    const nextWords = [...currentWords, word.word];
    const nextText = nextWords.join(" ");

    if (
      currentWords.length >= NARRATION_LIMITS.maximumWordsPerSubtitleCue ||
      nextText.length > NARRATION_LIMITS.maximumSubtitleCharactersPerCue
    ) {
      flushCue();
    }

    if (currentStart === null) {
      currentStart = word.startSeconds;
    }

    currentWords.push(word.word);
    currentEnd = word.endSeconds;
  }

  flushCue();

  return cues;
}

export function buildTutorialExportReport(input: {
  exportId: string;
  productionPlan: ProductionPlan;
  narration: z.infer<typeof productionNarrationSchema>;
  renderedNarration: z.infer<typeof renderedNarrationSegmentSchema>[];
  subtitles: SubtitleCue[];
  warnings: string[];
  output: z.infer<typeof tutorialExportOutputSchema>;
  audioMode: SourceAudioMode;
}) {
  const segments = input.productionPlan.finalTimeline.map((timelineItem) => {
    const segment = input.productionPlan.segments.find((item) => item.id === timelineItem.segmentId);
    const narrationSegment = input.renderedNarration.find(
      (item) => item.timelineItemId === timelineItem.id
    );

    if (!segment || !narrationSegment) {
      throw new Error(`Missing export segment data for ${timelineItem.id}.`);
    }

    return tutorialExportSegmentReportSchema.parse({
      timelineItemId: timelineItem.id,
      segmentId: timelineItem.segmentId,
      stepId: timelineItem.stepId,
      selectedStrategy: segment.selectedStrategy,
      classification: timelineItem.classification,
      audioMode: input.audioMode,
      subtitleCueIds: input.subtitles
        .filter((cue) => cue.timelineItemId === timelineItem.id)
        .map((cue) => cue.id),
      narrationDurationSeconds: narrationSegment.durationSeconds,
      finalDurationSeconds: timelineItem.durationSeconds,
      provenanceIds: timelineItem.modelProvenanceIds,
      warnings: [...segment.acceptedAsset?.warnings ?? [], ...narrationSegment.warnings]
    });
  });

  return tutorialExportReportSchema.parse({
    exportId: input.exportId,
    createdAtIso: new Date().toISOString(),
    productionPlan: input.productionPlan,
    narration: input.narration,
    renderedNarration: input.renderedNarration,
    subtitles: input.subtitles,
    segments,
    output: input.output,
    warnings: input.warnings
  });
}
