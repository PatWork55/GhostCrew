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

export const ANALYSIS_LIMITS = {
  minSteps: 3,
  maxSteps: 6,
  minSelectedFrames: 3,
  maxSelectedFrames: 10,
  maxAggregateFrameBytes: Math.round(2.5 * 1024 * 1024),
  maxSerializedRequestBytes: 4 * 1024 * 1024,
  maxReasoningSummaryLength: 240,
  minimumStepDurationSeconds: 0.25,
  maximumOverlapSeconds: 0.35
} as const;

export const GENERATED_INSERT_LIMITS = {
  defaultMaxAcceptedInsertsPerTutorial: 1,
  maxGenerationRequestsPerTutorial: 2,
  maxIntentLength: 180,
  maxPromptSummaryLength: 180,
  maxReferenceFrameBytes: 2 * 1024 * 1024,
  imageResolution: "1K" as const,
  imageOutputFormat: "png" as const,
  imageAspectRatios: ["16:9", "9:16", "1:1"] as const,
  defaultImageDisplayDurationSeconds: 3,
  minimumImageDisplayDurationSeconds: 2,
  maximumImageDisplayDurationSeconds: 4,
  requestTimeoutMs: 60_000,
  defaultRateLimitPerHour: 4
} as const;

export const RENDERING_LIMITS = {
  minimumSegmentDurationSeconds: 0.25,
  defaultSlowMotionPlaybackRate: 0.5,
  slowMotionPlaybackRates: [0.5, 0.75] as const,
  defaultFreezeFrameDurationSeconds: 2,
  minimumFreezeFrameDurationSeconds: 1.5,
  maximumFreezeFrameDurationSeconds: 3,
  defaultCropSize: 0.64,
  minimumCropSize: 0.4,
  maximumCropSize: 0.82,
  defaultAnnotationDurationSeconds: 2,
  maximumAnnotationTextLength: 80
} as const;
