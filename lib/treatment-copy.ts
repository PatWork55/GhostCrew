import type { Treatment } from "@/lib/tutorial-schema";

export const treatmentLabel: Record<Treatment, string> = {
  keep_original: "Original footage",
  crop_close_up: "Crop / close-up",
  slow_motion: "Slow motion",
  freeze_frame: "Freeze frame",
  annotation: "Annotation",
  generated_insert: "Generated insert"
};

export const treatmentDescription: Record<Treatment, string> = {
  keep_original: "Use the original shot because the action is already understandable.",
  crop_close_up: "Zoom into the important detail already visible in the source clip.",
  slow_motion: "Stretch the fast action so the completion point is easy to see.",
  freeze_frame: "Pause on a key frame to clarify object orientation or end state.",
  annotation: "Add labels or arrows to direct the viewer to the correct part.",
  generated_insert:
    "Generate a supplementary explanatory shot only when the source video is insufficient."
};
