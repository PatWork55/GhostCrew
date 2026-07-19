import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import type { ValidatedGeneratedInsertRequest } from "@/lib/generation/generated-insert-schema";
import type { GeneratedInsertProviderPrompt } from "@/lib/generation/generated-insert-provider";

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildGeneratedInsertIntent(request: {
  stepTitle: string;
  viewerRisk: string;
  modelSuggestedPrompt?: string | null;
}) {
  if (request.modelSuggestedPrompt?.trim()) {
    return collapseWhitespace(request.modelSuggestedPrompt).slice(
      0,
      GENERATED_INSERT_LIMITS.maxIntentLength
    );
  }

  return collapseWhitespace(
    `Create a clearer explanatory view for "${request.stepTitle}" and make this easier to understand: ${request.viewerRisk}`
  ).slice(0, GENERATED_INSERT_LIMITS.maxIntentLength);
}

export function buildGeneratedInsertPrompt(
  request: ValidatedGeneratedInsertRequest
): GeneratedInsertProviderPrompt {
  const promptSummary = collapseWhitespace(request.intent).slice(
    0,
    GENERATED_INSERT_LIMITS.maxPromptSummaryLength
  );

  const systemPrompt = [
    "You create supplementary still images for GhostCrew, an instructional-video tool.",
    "The reference image is the factual source of truth for the object and environment.",
    "Preserve the same object identity, visible shape, materials, colors, scale, and overall setting unless a small crop-like reframing improves clarity.",
    "Create an explanatory supplementary view, not a replacement for factual footage.",
    "Do not add new parts, tools, labels rendered inside the image, hidden mechanisms, or unsupported object states.",
    "Avoid hands unless they are already present and necessary for orientation.",
    "Do not make medical, weapon, electrical, dangerous, or hazardous imagery.",
    "Keep the visual realistic, calm, and consistent with the source frame."
  ].join(" ");

  const userPrompt = [
    `Task: ${request.taskTitle}.`,
    request.taskDescription ? `Context: ${request.taskDescription}.` : null,
    `Step title: ${request.stepTitle}.`,
    `Instruction: ${request.instruction}.`,
    `Viewer confusion: ${request.viewerRisk}.`,
    `User intent: ${promptSummary}.`,
    `Requested aspect ratio: ${request.aspectRatio}.`,
    "Create a clear explanatory close-up or orientation view that helps the viewer understand this step.",
    "Preserve the same object from the reference frame.",
    "Do not add new components or text inside the image.",
    "Do not fabricate hidden geometry or physically authoritative interactions."
  ]
    .filter(Boolean)
    .join(" ");

  return {
    systemPrompt,
    userPrompt,
    promptSummary
  };
}
