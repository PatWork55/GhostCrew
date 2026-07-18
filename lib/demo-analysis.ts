import { VIDEO_DURATION_RANGE } from "@/lib/constants";
import { type AnalysisRequest } from "@/lib/analysis-contract";
import { type TutorialAnalysis, tutorialAnalysisSchema } from "@/lib/tutorial-schema";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPhoneStandAnalysis(input: AnalysisRequest): TutorialAnalysis {
  const duration = clamp(
    input.video.durationSeconds,
    VIDEO_DURATION_RANGE.minSeconds,
    VIDEO_DURATION_RANGE.maxSeconds
  );

  const checkpoints = [
    0,
    duration * 0.26,
    duration * 0.5,
    duration * 0.76,
    duration
  ];

  return tutorialAnalysisSchema.parse({
    taskTitle: input.taskTitle,
    summary:
      "A rough single-camera walkthrough is reorganized into a four-step tutorial focused on the moving parts, the fast locking action, and the final viewing angle.",
    steps: [
      {
        id: "step-1",
        title: "Show the folded stand",
        instruction: "Hold the phone stand flat and orient the base toward the viewer before unfolding it.",
        startTime: checkpoints[0],
        endTime: checkpoints[1],
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The viewer may not immediately understand which hinge becomes the base.",
        treatment: "annotation",
        generationPrompt: null
      },
      {
        id: "step-2",
        title: "Open the support arm",
        instruction: "Lift the support arm until the stand forms its main viewing angle.",
        startTime: checkpoints[1],
        endTime: checkpoints[2],
        importance: "high",
        visibility: "partial",
        viewerRisk: "The hinge movement is visible but still too small in a wide phone shot.",
        treatment: "crop_close_up",
        generationPrompt: null
      },
      {
        id: "step-3",
        title: "Lock the angle in place",
        instruction: "Push the last notch firmly until the stand stops moving and feels stable.",
        startTime: checkpoints[2],
        endTime: checkpoints[3],
        importance: "high",
        visibility: "clear",
        viewerRisk: "This action often happens too quickly for a first-time viewer to notice the final click.",
        treatment: "slow_motion",
        generationPrompt: null
      },
      {
        id: "step-4",
        title: "Confirm the final position",
        instruction: "Set the stand down and show the final resting angle so the viewer can copy it.",
        startTime: checkpoints[3],
        endTime: checkpoints[4],
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The final orientation may still be ambiguous from a single angle.",
        treatment: "freeze_frame",
        generationPrompt:
          "Create a supplementary clean product-style insert of the finished phone stand from a slight side angle, matching the object identity and showing the final resting position."
      }
    ]
  });
}

function buildGenericAnalysis(input: AnalysisRequest): TutorialAnalysis {
  const duration = clamp(
    input.video.durationSeconds,
    VIDEO_DURATION_RANGE.minSeconds,
    VIDEO_DURATION_RANGE.maxSeconds
  );

  const stepCount = 4;
  const segment = duration / stepCount;

  return tutorialAnalysisSchema.parse({
    taskTitle: input.taskTitle,
    summary:
      "This rough recording is split into a setup, key movement, fast detail, and final check so the viewer can follow the task without needing a second camera angle.",
    steps: [
      {
        id: "step-1",
        title: "Prepare the object",
        instruction: "Bring the object fully into frame and show the starting orientation before the main action begins.",
        startTime: 0,
        endTime: segment,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The viewer may not know the correct starting orientation.",
        treatment: "annotation",
        generationPrompt: null
      },
      {
        id: "step-2",
        title: "Make the first movement",
        instruction: "Perform the main movement slowly enough for the viewer to understand what part is changing.",
        startTime: segment,
        endTime: segment * 2,
        importance: "high",
        visibility: "partial",
        viewerRisk: "The critical detail is present but may be too small in the original frame.",
        treatment: "crop_close_up",
        generationPrompt: null
      },
      {
        id: "step-3",
        title: "Highlight the fast detail",
        instruction: "Repeat the quick locking or connecting motion and emphasize the exact moment it completes.",
        startTime: segment * 2,
        endTime: segment * 3,
        importance: "high",
        visibility: "clear",
        viewerRisk: "The viewer could miss the completion point because the action happens quickly.",
        treatment: "slow_motion",
        generationPrompt: null
      },
      {
        id: "step-4",
        title: "Show the completed result",
        instruction: "Pause on the final arrangement so the viewer can compare their own result against it.",
        startTime: segment * 3,
        endTime: duration,
        importance: "medium",
        visibility: "partial",
        viewerRisk: "The final shape or orientation may still be unclear from one perspective.",
        treatment: "freeze_frame",
        generationPrompt:
          "Create a supplementary explanatory insert that shows the completed object from a slightly clearer angle while preserving the original object's identity."
      }
    ]
  });
}

export function generateDemoAnalysis(input: AnalysisRequest): TutorialAnalysis {
  const normalized = input.taskTitle.toLowerCase();

  if (normalized.includes("phone stand")) {
    return buildPhoneStandAnalysis(input);
  }

  return buildGenericAnalysis(input);
}
