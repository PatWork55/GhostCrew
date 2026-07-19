import { z } from "zod";
import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import { ANALYSIS_LIMITS } from "@/lib/constants";
import { tutorialAnalysisSchema } from "@/lib/tutorial-schema";

export const modelUnsafeResponseSchema = z.object({
  status: z.literal("unsafe"),
  reason: z.string().min(1).max(240)
});

export const modelAnalysisResponseSchema = z.object({
  status: z.literal("ok"),
  analysis: tutorialAnalysisSchema
});

export const modelProviderResponseSchema = z.union([
  modelUnsafeResponseSchema,
  modelAnalysisResponseSchema
]);

export function buildVisionAnalysisPrompts(request: ValidatedAnalysisRequest) {
  const frameLines = request.selectedFrames
    .map(
      (frame, index) =>
        `${index + 1}. ${frame.id} | ${frame.timestampSeconds.toFixed(3)}s | ${frame.width}x${frame.height} | ${frame.mimeType}`
    )
    .join("\n");

  const systemPrompt = [
    "You are GhostCrew's instructional video analysis director.",
    "Analyze a short, non-dangerous physical task from chronological reference frames and metadata.",
    "Rely only on visible evidence in the provided images plus the supplied task context.",
    "Do not invent unseen actions, hidden geometry, missing tools, or safety claims.",
    "The original footage is the source of truth. Generated media is supplementary only.",
    "Reject or flag tasks involving medical procedures, self-harm, weapons, electrical repair, dangerous machinery, illegal activity, or hazardous chemicals.",
    "When the task is unsafe or likely to cause serious harm if instructed incorrectly, return the unsafe JSON shape instead of a storyboard.",
    "If the task is safe, return only valid JSON with no markdown, no prose, and no code fences.",
    `Every safe storyboard must contain ${ANALYSIS_LIMITS.minSteps} to ${ANALYSIS_LIMITS.maxSteps} chronological steps.`,
    "Each step must reference one or more actual evidenceFrameIds from the supplied frame list.",
    "Allowed treatments: keep_original, crop_close_up, slow_motion, freeze_frame, annotation, generated_insert.",
    "Prefer original-footage treatments whenever possible. Recommend generated_insert only when important information is genuinely missing from the visible evidence.",
    "Set generationPrompt to null unless treatment is generated_insert.",
    "Confidence must be a number between 0 and 1.",
    "reasoningSummary must be concise, evidence-based, and safe to display to the end user.",
    `Write titles, instructions, viewerRisk, summary, and reasoningSummary in ${request.language}.`
  ].join(" ");

  const userPrompt = [
    "Return exactly one of the following JSON shapes.",
    "Unsafe task JSON:",
    '{"status":"unsafe","reason":"Short user-facing explanation."}',
    "Safe task JSON:",
    '{"status":"ok","analysis":{"taskTitle":"string","summary":"string","steps":[{"id":"step-1","title":"string","instruction":"string","startTime":0,"endTime":1,"importance":"high|medium|low","visibility":"clear|partial|unclear","viewerRisk":"string","treatment":"keep_original|crop_close_up|slow_motion|freeze_frame|annotation|generated_insert","generationPrompt":null,"evidenceFrameIds":["frame-1"],"confidence":0.8,"reasoningSummary":"string"}]}}',
    "The nth image in image_urls corresponds to the nth frame entry below.",
    `Task title: ${request.taskTitle}`,
    `Requested tutorial language: ${request.language}`,
    `Optional task context: ${request.description ?? "None provided."}`,
    "Source video metadata:",
    `- fileName: ${request.video.fileName}`,
    `- mimeType: ${request.video.mimeType}`,
    `- durationSeconds: ${request.video.durationSeconds}`,
    `- width: ${request.video.width}`,
    `- height: ${request.video.height}`,
    `- aspectRatio: ${request.video.aspectRatioLabel}`,
    "Chronological frames:",
    frameLines,
    "Storyboard requirements:",
    "- Infer the physical task being demonstrated from the visible evidence.",
    "- Divide the clip into 3 to 6 meaningful instructional steps.",
    "- Keep step timing chronological and supported by the frame timestamps.",
    "- Do not claim actions or objects that are not visible or directly implied by the supplied context.",
    "- Identify what the viewer must understand and any visibility ambiguity.",
    "- Prefer keep_original, crop_close_up, slow_motion, freeze_frame, or annotation before generated_insert.",
    "- Use evidenceFrameIds that point only to submitted frame ids.",
    "- Keep reasoningSummary concise and evidence-based.",
    "Return JSON only."
  ].join("\n");

  return {
    systemPrompt,
    userPrompt
  };
}
