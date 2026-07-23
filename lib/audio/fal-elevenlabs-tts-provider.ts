import { fal } from "@fal-ai/client";
import { getTutorialLanguageCode } from "@/lib/narration/build-narration";
import { type TtsProvider, type TtsSegmentResult, TtsProviderError } from "@/lib/audio/tts-provider";

type FalTtsProviderOptions = {
  endpointId: string;
  apiKey: string;
};

type LooseTimestamp =
  | {
      word?: string;
      text?: string;
      start?: number;
      end?: number;
      start_time?: number;
      end_time?: number;
    }
  | string;

type FalTtsResponse = {
  audio?: {
    url?: string;
  };
  timestamps?: LooseTimestamp[];
};

function normalizeWordTimestamps(
  timestamps: LooseTimestamp[] | undefined,
  text: string
): TtsSegmentResult["wordTimestamps"] {
  if (!Array.isArray(timestamps) || !timestamps.length) {
    const words = text
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);

    return words.map((word, index) => ({
      word,
      startSeconds: Number((index * 0.28).toFixed(3)),
      endSeconds: Number(((index + 1) * 0.28).toFixed(3))
    }));
  }

  const normalized = timestamps.flatMap((entry, index) => {
    if (typeof entry === "string") {
      const startSeconds = Number((index * 0.28).toFixed(3));
      return [
        {
          word: entry.trim(),
          startSeconds,
          endSeconds: Number((startSeconds + 0.28).toFixed(3))
        }
      ];
    }

    const word = entry.word?.trim() || entry.text?.trim();

    if (!word) {
      return [];
    }

    const startRaw =
      typeof entry.start === "number"
        ? entry.start
        : typeof entry.start_time === "number"
          ? entry.start_time
          : index * 0.28;
    const endRaw =
      typeof entry.end === "number"
        ? entry.end
        : typeof entry.end_time === "number"
          ? entry.end_time
          : startRaw + 0.28;

    return [
      {
        word,
        startSeconds: Number(Math.max(0, startRaw).toFixed(3)),
        endSeconds: Number(Math.max(startRaw + 0.01, endRaw).toFixed(3))
      }
    ];
  });

  return normalized.length
    ? normalized
    : text
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .map((word, index) => ({
          word,
          startSeconds: Number((index * 0.28).toFixed(3)),
          endSeconds: Number(((index + 1) * 0.28).toFixed(3))
        }));
}

export class FalElevenLabsTtsProvider implements TtsProvider {
  private readonly endpointId: string;

  constructor(options: FalTtsProviderOptions) {
    this.endpointId = options.endpointId;
    fal.config({
      credentials: options.apiKey
    });
  }

  async synthesizeSegment(input: Parameters<TtsProvider["synthesizeSegment"]>[0]) {
    const startedAt = Date.now();
    const languageCode = getTutorialLanguageCode(input.narration.language);

    try {
      const result = (await fal.subscribe(this.endpointId, {
        input: {
          text: input.segment.text,
          voice: input.narration.voice,
          stability: 0.5,
          speed: 1,
          language_code: languageCode,
          timestamps: true,
          output_format: "mp3_44100_128",
          previous_text: input.previousText,
          next_text: input.nextText
        }
      })) as { data?: FalTtsResponse };

      const audioUrl = result.data?.audio?.url;

      if (!audioUrl || !URL.canParse(audioUrl)) {
        throw new Error("The TTS provider did not return an audio URL.");
      }

      const wordTimestamps = normalizeWordTimestamps(result.data?.timestamps, input.segment.text);
      const durationSeconds = wordTimestamps.at(-1)?.endSeconds ?? 0;

      return {
        timelineItemId: input.segment.timelineItemId,
        text: input.segment.text,
        voice: input.narration.voice,
        audioUrl,
        durationSeconds,
        wordTimestamps,
        warnings: [],
        usage: {
          latencyMs: Date.now() - startedAt,
          characters: input.segment.text.length
        }
      };
    } catch (error) {
      throw new TtsProviderError(
        error instanceof Error ? error.message : "The fal ElevenLabs TTS provider failed."
      );
    }
  }
}
