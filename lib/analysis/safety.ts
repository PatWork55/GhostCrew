import type { AnalysisRequest } from "@/lib/analysis-contract";
import type { TutorialAnalysis } from "@/lib/tutorial-schema";

export type TaskSafetyResult = {
  unsafe: boolean;
  reason: string | null;
};

const UNSAFE_TASK_RULES = [
  {
    reason: "GhostCrew does not support medical or health-procedure tutorials.",
    patterns: [
      /\bmedical\b/i,
      /\binject/i,
      /\bsyringe\b/i,
      /\bfirst aid\b/i,
      /\bbandage\b/i,
      /\bsurgery\b/i
    ]
  },
  {
    reason: "GhostCrew does not support self-harm or suicide-related instructions.",
    patterns: [/\bself-harm\b/i, /\bsuicide\b/i, /\boverdose\b/i]
  },
  {
    reason: "GhostCrew does not support weapon-related tutorials.",
    patterns: [/\bweapon\b/i, /\bgun\b/i, /\bfirearm\b/i, /\bknife\b/i, /\bexplosive\b/i]
  },
  {
    reason: "GhostCrew does not support electrical repair or breaker-panel instructions.",
    patterns: [
      /\belectrical\b/i,
      /\bwire\b/i,
      /\bwiring\b/i,
      /\bbreaker\b/i,
      /\bcircuit\b/i,
      /\boutlet\b/i,
      /\bvoltage\b/i
    ]
  },
  {
    reason: "GhostCrew does not support dangerous machinery tutorials.",
    patterns: [/\blathe\b/i, /\bchainsaw\b/i, /\btable saw\b/i, /\bdrill press\b/i, /\bforklift\b/i]
  },
  {
    reason: "GhostCrew does not support hazardous-chemical tutorials.",
    patterns: [/\bacid\b/i, /\bbleach\b/i, /\bsolvent\b/i, /\bpesticide\b/i, /\bhazardous chemical\b/i]
  },
  {
    reason: "GhostCrew does not support illegal-activity tutorials.",
    patterns: [/\bsteal\b/i, /\bforge\b/i, /\bcounterfeit\b/i, /\bhack into\b/i]
  }
];

const ANALYSIS_UNSAFE_TERMS = [
  /\bweapon\b/i,
  /\bmedical\b/i,
  /\belectrical\b/i,
  /\bdangerous machinery\b/i,
  /\bhazardous chemical\b/i
];

export class UnsafeTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTaskError";
  }
}

function findUnsafeReason(text: string) {
  for (const rule of UNSAFE_TASK_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.reason;
    }
  }

  return null;
}

export function detectUnsafeTask(
  request: Pick<AnalysisRequest, "taskTitle" | "description">
): TaskSafetyResult {
  const combined = [request.taskTitle, request.description ?? ""].join(" ").trim();
  const reason = findUnsafeReason(combined);

  return {
    unsafe: Boolean(reason),
    reason
  };
}

export function normalizeTaskSafetyResult(
  result: unknown,
  fallbackReason = "GhostCrew could not verify that this export request is safe."
): TaskSafetyResult {
  if (!result || typeof result !== "object") {
    return {
      unsafe: true,
      reason: fallbackReason
    };
  }

  const record = result as {
    unsafe?: unknown;
    reason?: unknown;
  };

  if (typeof record.unsafe !== "boolean") {
    return {
      unsafe: true,
      reason: fallbackReason
    };
  }

  const reason =
    typeof record.reason === "string" && record.reason.trim().length > 0
      ? record.reason.trim()
      : null;

  if (record.unsafe) {
    return {
      unsafe: true,
      reason: reason ?? fallbackReason
    };
  }

  return {
    unsafe: false,
    reason
  };
}

export function assertSafeTask(
  request: Pick<AnalysisRequest, "taskTitle" | "description">
) {
  const result = detectUnsafeTask(request);

  if (result.reason) {
    throw new UnsafeTaskError(result.reason);
  }
}

export function detectUnsafeAnalysisContent(analysis: TutorialAnalysis) {
  const combined = [
    analysis.taskTitle,
    analysis.summary,
    ...analysis.steps.flatMap((step) => [
      step.title,
      step.instruction,
      step.viewerRisk,
      step.reasoningSummary
    ])
  ].join(" ");

  if (ANALYSIS_UNSAFE_TERMS.some((pattern) => pattern.test(combined))) {
    return "GhostCrew cannot provide instructions for tasks that appear unsafe or safety-critical.";
  }

  return null;
}
