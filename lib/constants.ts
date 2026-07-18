export const PROJECT = {
  name: "GhostCrew",
  tagline: "Film once. Teach clearly."
} as const;

export const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const VIDEO_DURATION_RANGE = {
  minSeconds: 10,
  maxSeconds: 45
} as const;
