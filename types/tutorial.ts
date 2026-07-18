export type SourceVideoStatus =
  | "idle"
  | "loading_video"
  | "extracting_metadata"
  | "extracting_frames"
  | "ready_for_analysis"
  | "error";

export type AnalysisStatus = "idle" | "submitting" | "ready" | "error";
