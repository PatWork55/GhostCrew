export const PROJECT = {
  name: "GhostCrew",
  tagline: "Film once. Teach clearly."
} as const;

export const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

export const VIDEO_UPLOAD_LIMITS = {
  maxBytes: 80 * 1024 * 1024
} as const;

export const VIDEO_DURATION_RANGE = {
  minSeconds: 10,
  maxSeconds: 45
} as const;

export const FRAME_EXTRACTION_LIMITS = {
  minFrames: 5,
  maxFrames: 10,
  maxDimension: 640,
  quality: 0.82
} as const;
