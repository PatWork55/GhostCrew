import { z } from "zod";
import { directVideoUnderstandingSchema } from "@/lib/production/direct-video-understanding";

export const directVideoUnsafeResponseSchema = z.object({
  status: z.literal("unsafe"),
  reason: z.string().min(1).max(240)
});

export const directVideoProviderResponseSchema = z.union([
  directVideoUnsafeResponseSchema,
  z.object({
    status: z.literal("ok"),
    understanding: directVideoUnderstandingSchema
  })
]);

export function buildDirectVideoUnderstandingPrompts(input: {
  taskTitle: string;
  description?: string;
  language: string;
}) {
  const systemPrompt = [
    "You are GhostCrew's direct video understanding analyst.",
    "Analyze a short, non-dangerous instructional video as a complete temporal sequence.",
    "Rely on the visible video evidence and the supplied task context only.",
    "Do not invent hidden components, unseen steps, or unsupported safety claims.",
    "Reject or flag tasks involving medical procedures, self-harm, weapons, unsafe electrical work, dangerous machinery, illegal activity, or hazardous chemicals.",
    "When unsafe, return the unsafe JSON shape only.",
    "When safe, return strict JSON only with no markdown, prose, or code fences.",
    "Summaries must be concise, evidence-based, and safe for product display.",
    `Write task summaries, object names, action titles, and evidence summaries in ${input.language}.`
  ].join(" ");

  const userPrompt = [
    "Return exactly one of these JSON shapes.",
    '{"status":"unsafe","reason":"Short user-facing explanation."}',
    '{"status":"ok","understanding":{"taskTitle":"string","factualSummary":"string","objects":[{"id":"object-1","name":"string","description":"string","visualEvidenceFrameIds":["frame-1"],"confidence":0.9}],"chronologicalActions":[{"id":"action-1","title":"string","startTime":0,"endTime":1,"description":"string","handsOrTools":["hand"],"spatialRelationship":"string","viewerNeedsToUnderstand":"string","visibleIssues":["too_fast"],"recommendedAlternativeVisual":"string or null","evidenceSummary":"string","confidence":0.8}],"momentsTooFast":["action-1"],"momentsTooSmall":[],"hiddenDetails":[],"alternativeExplanationMoments":[],"safetyConcerns":[],"uncertaintySummary":"string","overallConfidence":0.8}}',
    `Task title: ${input.taskTitle}`,
    `Task context: ${input.description?.trim() || "None provided."}`,
    `Requested tutorial language: ${input.language}`,
    "Requirements:",
    "- Detect the demonstrated physical task.",
    "- List the visible objects and components.",
    "- Produce chronological actions with estimated timestamps.",
    "- Identify what is too fast, too small, hidden by hands, or poorly framed.",
    "- Use concise evidence summaries instead of chain-of-thought.",
    "- Keep safety concerns empty for harmless tasks.",
    "Return JSON only."
  ].join("\n");

  return {
    systemPrompt,
    userPrompt
  };
}
