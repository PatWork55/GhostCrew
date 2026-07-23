import { NARRATION_LIMITS } from "@/lib/constants";
import {
  productionNarrationSchema,
  type ProductionNarration,
  type ProductionPlan,
  type ProductionSegment
} from "@/lib/production/production-plan";

function sentenceCase(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function ensureTerminalPunctuation(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function trimNarrationText(text: string) {
  return ensureTerminalPunctuation(
    text.replace(/\s+/g, " ").trim().slice(0, NARRATION_LIMITS.maximumSegmentTextLength)
  );
}

function getFactText(segment: ProductionSegment, index: number) {
  return segment.visualFactsForNarration[index]?.text?.trim() ?? "";
}

function buildSegmentNarrationText(plan: ProductionPlan, segment: ProductionSegment) {
  const primaryFact = getFactText(segment, 0);
  const secondaryFact = getFactText(segment, 1);

  if (segment.generatedLabelRequired) {
    return trimNarrationText(
      sentenceCase(
        `This AI-generated explanatory view highlights ${segment.title.toLowerCase()}. ${primaryFact || segment.pedagogicalGoal}`
      )
    );
  }

  switch (segment.selectedStrategy) {
    case "slow_motion":
      return trimNarrationText(
        sentenceCase(`In slow motion, ${primaryFact || segment.factualAction.toLowerCase()}`)
      );
    case "tracked_zoom":
    case "static_crop":
      return trimNarrationText(
        sentenceCase(`Look closely as ${primaryFact || segment.factualAction.toLowerCase()}`)
      );
    case "freeze_frame":
      return trimNarrationText(
        sentenceCase(`Pause here to confirm ${primaryFact || segment.pedagogicalGoal.toLowerCase()}`)
      );
    case "annotation_overlay":
      return trimNarrationText(
        sentenceCase(`${primaryFact || segment.pedagogicalGoal} ${secondaryFact}`.trim())
      );
    default:
      return trimNarrationText(
        sentenceCase(primaryFact || secondaryFact || segment.factualAction || plan.task.title)
      );
  }
}

export function getTutorialLanguageCode(language: string) {
  const normalized = language.trim().toLowerCase();

  if (normalized.startsWith("fr") || normalized.includes("french")) {
    return "fr";
  }

  if (normalized.startsWith("es") || normalized.includes("spanish")) {
    return "es";
  }

  if (normalized.startsWith("de") || normalized.includes("german")) {
    return "de";
  }

  return "en";
}

export function buildProductionNarration(
  plan: ProductionPlan,
  options?: {
    voice?: string;
    sourceAudioMode?: ProductionNarration["sourceAudioMode"];
  }
): ProductionNarration {
  return productionNarrationSchema.parse({
    language: plan.task.tutorialLanguage,
    voice: options?.voice?.trim() || NARRATION_LIMITS.defaultVoice,
    sourceAudioMode: options?.sourceAudioMode || NARRATION_LIMITS.defaultAudioMode,
    segments: plan.finalTimeline.map((timelineItem) => {
      const segment = plan.segments.find((item) => item.id === timelineItem.segmentId);

      if (!segment) {
        throw new Error(`Missing production segment ${timelineItem.segmentId} for narration.`);
      }

      return {
        timelineItemId: timelineItem.id,
        text: buildSegmentNarrationText(plan, segment),
        allowedVisualFactIds: timelineItem.allowedNarrationFactIds,
        targetStartTime: timelineItem.outputStartTime,
        targetEndTime: timelineItem.outputEndTime,
        tone: "clear, calm, instructional",
        pronunciations: []
      };
    })
  });
}
