import { VIDEO_DURATION_RANGE } from "@/lib/constants";
import type { ValidatedAnalysisRequest } from "@/lib/analysis-contract";
import { tutorialAnalysisSchema, type TutorialAnalysis } from "@/lib/tutorial-schema";
import type {
  VideoAnalysisProvider,
  VideoAnalysisProviderResult
} from "@/lib/analysis/video-analysis-provider";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickEvidenceFrameIds(
  request: ValidatedAnalysisRequest,
  startTime: number,
  endTime: number
) {
  const inRangeFrames = request.selectedFrames.filter(
    (frame) => frame.timestampSeconds >= startTime && frame.timestampSeconds <= endTime
  );

  if (inRangeFrames.length >= 2) {
    return [inRangeFrames[0]!.id, inRangeFrames.at(-1)!.id];
  }

  if (inRangeFrames.length === 1) {
    return [inRangeFrames[0]!.id];
  }

  const midpoint = (startTime + endTime) / 2;
  const closestFrame = [...request.selectedFrames].sort(
    (left, right) =>
      Math.abs(left.timestampSeconds - midpoint) - Math.abs(right.timestampSeconds - midpoint)
  )[0];

  return closestFrame ? [closestFrame.id] : [request.selectedFrames[0]!.id];
}

function buildPhoneStandAnalysis(request: ValidatedAnalysisRequest): TutorialAnalysis {
  const duration = clamp(
    request.video.durationSeconds,
    VIDEO_DURATION_RANGE.minSeconds,
    VIDEO_DURATION_RANGE.maxSeconds
  );
  const checkpoints = [0, duration * 0.26, duration * 0.5, duration * 0.76, duration];

  return tutorialAnalysisSchema.parse({
    taskTitle: request.taskTitle,
    summary:
      "Demo fallback analysis reorganizes the rough clip into setup, hinge movement, lock moment, and final orientation checks.",
    steps: [
      {
        id: "step-1",
        title: "Show the folded stand",
        instruction: "Hold the folded stand in view and show which side becomes the base before opening it.",
        startTime: checkpoints[0],
        endTime: checkpoints[1],
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The viewer may not understand the starting orientation from a single wide shot.",
        treatment: "annotation",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, checkpoints[0], checkpoints[1]),
        confidence: 0.68,
        reasoningSummary: "The opening orientation needs a label before the main movement begins."
      },
      {
        id: "step-2",
        title: "Open the support arm",
        instruction: "Lift the support arm until the stand reaches its main viewing angle.",
        startTime: checkpoints[1],
        endTime: checkpoints[2],
        importance: "high",
        visibility: "partial",
        viewerRisk: "The hinge is visible but still small in the original framing.",
        treatment: "crop_close_up",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, checkpoints[1], checkpoints[2]),
        confidence: 0.74,
        reasoningSummary: "A crop helps the viewer track the hinge motion already present in the footage."
      },
      {
        id: "step-3",
        title: "Lock the angle in place",
        instruction: "Push the last hinge movement until the stand stops and feels stable.",
        startTime: checkpoints[2],
        endTime: checkpoints[3],
        importance: "high",
        visibility: "clear",
        viewerRisk: "The final locking action often happens too quickly to notice on first watch.",
        treatment: "slow_motion",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, checkpoints[2], checkpoints[3]),
        confidence: 0.8,
        reasoningSummary: "The action is visible, but slowing it down makes the completion point easier to follow."
      },
      {
        id: "step-4",
        title: "Confirm the final position",
        instruction: "Pause on the final angle so the viewer can compare their result against it.",
        startTime: checkpoints[3],
        endTime: checkpoints[4],
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The final resting angle can still feel ambiguous without a pause and marker.",
        treatment: "freeze_frame",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, checkpoints[3], checkpoints[4]),
        confidence: 0.7,
        reasoningSummary: "A paused frame helps confirm the final orientation without inventing a new angle."
      }
    ]
  });
}

function buildGenericAnalysis(request: ValidatedAnalysisRequest): TutorialAnalysis {
  const duration = clamp(
    request.video.durationSeconds,
    VIDEO_DURATION_RANGE.minSeconds,
    VIDEO_DURATION_RANGE.maxSeconds
  );
  const segment = duration / 4;

  return tutorialAnalysisSchema.parse({
    taskTitle: request.taskTitle,
    summary:
      "Demo fallback analysis splits the clip into setup, main movement, fast detail, and final check.",
    steps: [
      {
        id: "step-1",
        title: "Prepare the starting position",
        instruction: "Show the object clearly before the main movement begins so the viewer understands the starting orientation.",
        startTime: 0,
        endTime: segment,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The starting orientation may be unclear from a single frame.",
        treatment: "annotation",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, 0, segment),
        confidence: 0.66,
        reasoningSummary: "The first step should anchor the object orientation before any movement happens."
      },
      {
        id: "step-2",
        title: "Make the main movement",
        instruction: "Perform the key movement and emphasize the part that changes position.",
        startTime: segment,
        endTime: segment * 2,
        importance: "high",
        visibility: "partial",
        viewerRisk: "The critical detail is visible but still small in the frame.",
        treatment: "crop_close_up",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, segment, segment * 2),
        confidence: 0.73,
        reasoningSummary: "The source footage likely contains the detail already, so a closer crop is preferable."
      },
      {
        id: "step-3",
        title: "Highlight the fast detail",
        instruction: "Repeat the quick locking or connecting motion and make the exact completion point easier to see.",
        startTime: segment * 2,
        endTime: segment * 3,
        importance: "high",
        visibility: "clear",
        viewerRisk: "The viewer could miss the exact moment the action completes.",
        treatment: "slow_motion",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, segment * 2, segment * 3),
        confidence: 0.78,
        reasoningSummary: "The motion appears visible, but slowing it down makes the completion moment clearer."
      },
      {
        id: "step-4",
        title: "Show the completed result",
        instruction: "Pause on the finished arrangement so the viewer can confirm their final result.",
        startTime: segment * 3,
        endTime: duration,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The final arrangement may still need a pause for orientation.",
        treatment: "freeze_frame",
        generationPrompt: null,
        evidenceFrameIds: pickEvidenceFrameIds(request, segment * 3, duration),
        confidence: 0.69,
        reasoningSummary: "A freeze frame is enough when the final state is visible but benefits from more time."
      }
    ]
  });
}

export class DemoVideoAnalysisProvider implements VideoAnalysisProvider {
  async analyze(request: ValidatedAnalysisRequest): Promise<VideoAnalysisProviderResult> {
    const normalizedTitle = request.taskTitle.toLowerCase();
    const analysis = normalizedTitle.includes("phone stand")
      ? buildPhoneStandAnalysis(request)
      : buildGenericAnalysis(request);

    return {
      kind: "analysis",
      provider: "demo",
      model: "demo",
      analysis,
      warnings: [
        request.language === "English"
          ? "Demo fallback uses a rule-based storyboard rather than real multimodal reasoning."
          : "Demo fallback uses a rule-based storyboard and may not fully localize all instructional copy."
      ]
    };
  }
}
