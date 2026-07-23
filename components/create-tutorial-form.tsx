"use client";

import { useMemo, useState } from "react";
import {
  analysisResponseSchema,
  buildAnalysisRequest,
  estimateAnalysisRequestBytes,
  type AnalysisResponse
} from "@/lib/analysis-contract";
import {
  ANALYSIS_LIMITS,
  FRAME_EXTRACTION_LIMITS,
  PROJECT,
  SUPPORTED_VIDEO_TYPES,
  VIDEO_DURATION_RANGE,
  VIDEO_UPLOAD_LIMITS
} from "@/lib/constants";
import { formatDuration, formatFileSize } from "@/lib/format";
import { FrameReviewStrip } from "@/components/frame-review-strip";
import { StoryboardEditor } from "@/components/storyboard-editor";
import { StatusPill } from "@/components/status-pill";
import { TutorialPreview } from "@/components/tutorial-preview";
import { useSourceVideoPipeline } from "@/hooks/use-source-video-pipeline";
import {
  productionPlanResponseSchema,
  type ProductionPlanResponse
} from "@/lib/production/production-plan-contract";
import { ProductionWorkspace } from "@/components/production-workspace";
import type { AnalysisStatus, SourceVideoStatus } from "@/types/tutorial";

const DEFAULT_LANGUAGE = "English";
type ProductionPlanStatus = "idle" | "submitting" | "ready" | "error";

function getSourceStatusMessage(
  sourceStatus: SourceVideoStatus,
  error: string,
  selectedFrameCount: number,
  payloadLimitMessage: string
) {
  switch (sourceStatus) {
    case "idle":
      return "Upload a short MP4 or WebM source clip to begin preprocessing.";
    case "loading_video":
      return "Loading source video...";
    case "extracting_metadata":
      return "Reading filename, dimensions, duration, and aspect ratio...";
    case "extracting_frames":
      return "Extracting representative frames directly in the browser...";
    case "ready_for_analysis":
      if (payloadLimitMessage) {
        return payloadLimitMessage;
      }

      if (selectedFrameCount < ANALYSIS_LIMITS.minSelectedFrames) {
        return `Select at least ${ANALYSIS_LIMITS.minSelectedFrames} frames before analysis.`;
      }

      return `${selectedFrameCount} selected frames are ready for server-side analysis.`;
    case "error":
      return error || "GhostCrew could not preprocess this clip.";
    default:
      return "Preparing source video...";
  }
}

function getPrimaryStatusLabel(
  sourceStatus: SourceVideoStatus,
  analysisStatus: AnalysisStatus,
  analysisResult: AnalysisResponse | null
) {
  if (analysisStatus === "submitting") {
    return "analysis in progress";
  }

  if (analysisResult) {
    return analysisResult.provider === "fal" && !analysisResult.fallbackUsed
      ? "AI analysis"
      : "demo fallback";
  }

  switch (sourceStatus) {
    case "loading_video":
      return "loading video";
    case "extracting_metadata":
      return "metadata extraction";
    case "extracting_frames":
      return "frame extraction";
    case "ready_for_analysis":
      return "ready for analysis";
    case "error":
      return "retry available";
    default:
      return "preprocessing";
  }
}

export function CreateTutorialForm({
  generatedInsertMaxPerTutorial
}: {
  generatedInsertMaxPerTutorial: number;
}) {
  const [taskTitle, setTaskTitle] = useState("Assemble a phone stand");
  const [description, setDescription] = useState(
    "A quick one-angle phone video showing how to unfold and lock a small desk phone stand."
  );
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [productionPlanStatus, setProductionPlanStatus] = useState<ProductionPlanStatus>("idle");
  const [productionPlanError, setProductionPlanError] = useState("");
  const [productionPlanResult, setProductionPlanResult] =
    useState<ProductionPlanResponse | null>(null);
  const {
    file,
    previewUrl,
    sourceVideo,
    status: sourceStatus,
    error: sourceError,
    selectedFrames,
    selectFile,
    reExtractFrames,
    toggleFrameSelection,
    removeFrame
  } = useSourceVideoPipeline();

  function resetProductionPlanState() {
    setProductionPlanResult(null);
    setProductionPlanStatus("idle");
    setProductionPlanError("");
  }

  const analysisRequestPreview = useMemo(() => {
    if (!sourceVideo) {
      return {
        request: null,
        serializedBytes: 0,
        aggregateImageBytes: 0,
        error: ""
      };
    }

    try {
      const request = buildAnalysisRequest({
        taskTitle,
        description,
        language,
        sourceVideo
      });
      const aggregateImageBytes = request.selectedFrames.reduce(
        (total, frame) => total + frame.byteSize,
        0
      );
      const serializedBytes = estimateAnalysisRequestBytes(request);

      if (aggregateImageBytes > ANALYSIS_LIMITS.maxAggregateFrameBytes) {
        return {
          request,
          serializedBytes,
          aggregateImageBytes,
          error: `Select fewer frames before analysis. The selected frames decode to ${(
            aggregateImageBytes /
            (1024 * 1024)
          ).toFixed(1)} MB, which is above the 2.5 MB server limit.`
        };
      }

      if (serializedBytes > ANALYSIS_LIMITS.maxSerializedRequestBytes) {
        return {
          request,
          serializedBytes,
          aggregateImageBytes,
          error: `Select fewer frames before analysis. This request would be about ${(
            serializedBytes /
            (1024 * 1024)
          ).toFixed(1)} MB after Base64 serialization, which is above the 4 MB deployment-safe limit.`
        };
      }

      return {
        request,
        serializedBytes,
        aggregateImageBytes,
        error: ""
      };
    } catch (error) {
      return {
        request: null,
        serializedBytes: 0,
        aggregateImageBytes: 0,
        error:
          error instanceof Error
            ? error.message
            : "GhostCrew could not prepare the analysis request."
      };
    }
  }, [description, language, sourceVideo, taskTitle]);

  const selectedFrameCount = selectedFrames.length;
  const sourceStatusMessage = getSourceStatusMessage(
    sourceStatus,
    sourceError,
    selectedFrameCount,
    analysisRequestPreview.error
  );
  const activeError = analysisStatus === "error" ? analysisError : sourceError;
  const canAnalyze =
    sourceStatus === "ready_for_analysis" &&
    selectedFrameCount >= ANALYSIS_LIMITS.minSelectedFrames &&
    selectedFrameCount <= ANALYSIS_LIMITS.maxSelectedFrames &&
    !analysisRequestPreview.error &&
    analysisStatus !== "submitting";
  const showVideoPreview =
    Boolean(previewUrl) &&
    Boolean(file) &&
    SUPPORTED_VIDEO_TYPES.includes((file?.type ?? "") as (typeof SUPPORTED_VIDEO_TYPES)[number]);
  const evidenceFramesById = useMemo(
    () =>
      Object.fromEntries((sourceVideo?.frames ?? []).map((frame) => [frame.id, frame])),
    [sourceVideo?.frames]
  );

  async function submitAnalysisRequest() {
    if (analysisStatus === "submitting") {
      return;
    }

    if (!sourceVideo) {
      setAnalysisStatus("error");
      setAnalysisError("Upload a valid source video before analysis.");
      return;
    }

    try {
      const request =
        analysisRequestPreview.request ??
        buildAnalysisRequest({
          taskTitle,
          description,
          language,
          sourceVideo
        });

      if (analysisRequestPreview.error) {
        throw new Error(analysisRequestPreview.error);
      }

      setAnalysisError("");
      setAnalysisStatus("submitting");
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });
      const rawPayload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(rawPayload.error ?? "Analysis failed");
      }

      const parsedPayload = analysisResponseSchema.parse(rawPayload);
      setAnalysisResult(parsedPayload);
      setAnalysisStatus("ready");
      resetProductionPlanState();
    } catch (requestError) {
      setAnalysisStatus("error");
      setAnalysisError(
        requestError instanceof Error
          ? requestError.message
          : "The analysis request failed. Try again with a different clip."
      );
    }
  }

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canAnalyze) {
      setAnalysisStatus("error");
      setAnalysisError(sourceStatusMessage);
      return;
    }

    await submitAnalysisRequest();
  }

  async function submitProductionPlanRequest() {
    if (productionPlanStatus === "submitting") {
      return;
    }

    if (!file || !sourceVideo || !analysisResult) {
      setProductionPlanStatus("error");
      setProductionPlanError("Run and review the storyboard analysis before building the production plan.");
      return;
    }

    if (!analysisRequestPreview.request) {
      setProductionPlanStatus("error");
      setProductionPlanError("GhostCrew could not prepare the production-plan request.");
      return;
    }

    try {
      setProductionPlanStatus("submitting");
      setProductionPlanError("");
      const formData = new FormData();
      formData.set("video", file);
      formData.set("request", JSON.stringify(analysisRequestPreview.request));
      formData.set("storyboard", JSON.stringify(analysisResult));

      const response = await fetch("/api/production-plan", {
        method: "POST",
        body: formData
      });
      const rawPayload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(rawPayload.error ?? "Production-plan creation failed.");
      }

      const parsedPayload = productionPlanResponseSchema.parse(rawPayload);
      setProductionPlanResult(parsedPayload);
      setProductionPlanStatus("ready");
    } catch (error) {
      setProductionPlanStatus("error");
      setProductionPlanError(
        error instanceof Error
          ? error.message
          : "GhostCrew could not build the production plan."
      );
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <form
          onSubmit={handleAnalyze}
          className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-glow"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                Create a tutorial
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-white">{PROJECT.tagline}</h1>
              <p className="mt-3 max-w-2xl text-base text-white/68">
                Upload a rough 10 to 45 second source clip, extract representative frames, and
                analyze them server-side into a validated instructional storyboard.
              </p>
            </div>
            <StatusPill
              label={getPrimaryStatusLabel(sourceStatus, analysisStatus, analysisResult)}
              tone={
                sourceStatus === "error" || analysisStatus === "error"
                  ? "warning"
                  : analysisResult || sourceStatus === "ready_for_analysis"
                    ? "success"
                    : "neutral"
              }
            />
          </div>

          <div className="mt-8 grid gap-5">
            <label className="space-y-2">
              <span className="text-sm text-white/70">Task name</span>
              <input
                required
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onBlur={() => {
                  if (productionPlanResult) {
                    resetProductionPlanState();
                  }
                }}
                className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                placeholder="Assemble a phone stand"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-white/70">What are you teaching?</span>
              <textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => {
                  if (productionPlanResult) {
                    resetProductionPlanState();
                  }
                }}
                className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                placeholder="Optional context for the tutorial"
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-white/70">Tutorial language</span>
                <select
                  value={language}
                  onChange={(event) => {
                    setLanguage(event.target.value);
                    if (productionPlanResult) {
                      resetProductionPlanState();
                    }
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                >
                  <option>English</option>
                  <option>French</option>
                  <option>Spanish</option>
                  <option>German</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-white/70">Source video</span>
                <input
                  required
                  type="file"
                  accept={SUPPORTED_VIDEO_TYPES.join(",")}
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    selectFile(nextFile);
                    setAnalysisResult(null);
                    setAnalysisStatus("idle");
                    setAnalysisError("");
                    resetProductionPlanState();
                  }}
                  className="block w-full rounded-2xl border border-dashed border-white/18 bg-black/25 px-4 py-[0.82rem] text-sm text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
              <p className="text-white">{sourceStatusMessage}</p>
              <p className="mt-2 text-white/58">
                Supported formats: MP4 and WebM. Duration: {VIDEO_DURATION_RANGE.minSeconds} to{" "}
                {VIDEO_DURATION_RANGE.maxSeconds} seconds. Max upload size:{" "}
                {Math.round(VIDEO_UPLOAD_LIMITS.maxBytes / (1024 * 1024))} MB. Extracted frames
                are resized to a maximum dimension of {FRAME_EXTRACTION_LIMITS.maxDimension}px.
                Analysis accepts {ANALYSIS_LIMITS.minSelectedFrames} to{" "}
                {ANALYSIS_LIMITS.maxSelectedFrames} selected frames.
              </p>
              {analysisRequestPreview.request ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                      Decoded frame payload
                    </p>
                    <p className="mt-2 text-sm text-white/78">
                      {formatFileSize(analysisRequestPreview.aggregateImageBytes)} /{" "}
                      {formatFileSize(ANALYSIS_LIMITS.maxAggregateFrameBytes)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                      Estimated request size
                    </p>
                    <p className="mt-2 text-sm text-white/78">
                      {formatFileSize(analysisRequestPreview.serializedBytes)} /{" "}
                      {formatFileSize(ANALYSIS_LIMITS.maxSerializedRequestBytes)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {activeError || analysisRequestPreview.error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {activeError || analysisRequestPreview.error}
              </div>
            ) : null}

            {productionPlanError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {productionPlanError}
              </div>
            ) : null}

            {analysisResult ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/72">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill
                    label={
                      analysisResult.provider === "fal" && !analysisResult.fallbackUsed
                        ? "AI analysis"
                        : "Demo fallback"
                    }
                    tone={
                      analysisResult.provider === "fal" && !analysisResult.fallbackUsed
                        ? "success"
                        : "warning"
                    }
                  />
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                    Model: {analysisResult.model}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                    {analysisResult.usage.selectedFrameCount} frames
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                    {analysisResult.usage.latencyMs} ms
                  </span>
                </div>
                {analysisResult.warnings.length ? (
                  <div className="mt-3 space-y-2">
                    {analysisResult.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
                      >
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!canAnalyze}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
              >
                {analysisStatus === "submitting" ? "Running analysis..." : "Start analysis"}
              </button>
              <button
                type="button"
                onClick={() => void submitAnalysisRequest()}
                disabled={
                  !sourceVideo ||
                  sourceStatus !== "ready_for_analysis" ||
                  analysisStatus === "submitting"
                }
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Retry analysis
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalysisResult(null);
                  setAnalysisStatus("idle");
                  setAnalysisError("");
                  resetProductionPlanState();
                  void reExtractFrames();
                }}
                disabled={
                  !sourceVideo ||
                  sourceStatus === "extracting_frames" ||
                  analysisStatus === "submitting"
                }
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sourceStatus === "extracting_frames" ? "Extracting frames..." : "Re-extract frames"}
              </button>
              <button
                type="button"
                onClick={() => void submitProductionPlanRequest()}
                disabled={
                  !file ||
                  !sourceVideo ||
                  !analysisResult ||
                  !!analysisRequestPreview.error ||
                  productionPlanStatus === "submitting" ||
                  analysisStatus === "submitting"
                }
                className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100 transition hover:border-cyan-400/35 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {productionPlanStatus === "submitting"
                  ? "Building production plan..."
                  : "Build production plan"}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-black/35">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                  Source preview
                </p>
                <StatusPill
                  label={sourceStatus.replaceAll("_", " ")}
                  tone={
                    sourceStatus === "error"
                      ? "warning"
                      : sourceStatus === "ready_for_analysis"
                        ? "success"
                        : "neutral"
                  }
                />
              </div>
            </div>
            <div className="p-5">
              {showVideoPreview ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
                    <video
                      src={previewUrl}
                      controls
                      preload="metadata"
                      className="aspect-video w-full bg-black object-contain"
                    />
                  </div>
                  {sourceVideo?.metadata ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Filename</p>
                        <p className="mt-2 truncate text-sm text-white/76">
                          {sourceVideo.metadata.fileName}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">MIME type</p>
                        <p className="mt-2 text-sm text-white/76">{sourceVideo.metadata.mimeType}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">File size</p>
                        <p className="mt-2 text-sm text-white/76">
                          {formatFileSize(sourceVideo.metadata.fileSizeBytes)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Duration</p>
                        <p className="mt-2 text-sm text-white/76">
                          {formatDuration(sourceVideo.metadata.durationSeconds)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Width</p>
                        <p className="mt-2 text-sm text-white/76">{sourceVideo.metadata.width}px</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Height</p>
                        <p className="mt-2 text-sm text-white/76">{sourceVideo.metadata.height}px</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Aspect ratio</p>
                        <p className="mt-2 text-sm text-white/76">
                          {sourceVideo.metadata.aspectRatioLabel} ({sourceVideo.metadata.aspectRatio}:1)
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                          Selected frames
                        </p>
                        <p className="mt-2 text-sm text-white/76">{selectedFrameCount}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                      Metadata will appear here once extraction completes.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-3xl border border-dashed border-white/12 bg-black/25 px-6 text-center text-sm text-white/52">
                  Drop in a rough phone recording to inspect its metadata, extract review frames,
                  and start the storyboard analysis.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
              Director logic
            </p>
            <div className="mt-4 grid gap-3 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                If the action is visible and understandable, keep the original footage.
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                If the important detail is present but too small, crop into a close-up.
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                If a critical motion is too fast, slow it down and label the completion point.
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                If orientation remains ambiguous, freeze the key frame and annotate it.
              </div>
            </div>
          </div>
        </div>
      </section>

      <FrameReviewStrip
        frames={sourceVideo?.frames ?? []}
        selectedCount={selectedFrameCount}
        status={sourceStatus}
        error={sourceError}
        onReExtract={() => {
          setAnalysisResult(null);
          setAnalysisStatus("idle");
          setAnalysisError("");
          resetProductionPlanState();
          void reExtractFrames();
        }}
        onToggleSelected={(frameId) => {
          toggleFrameSelection(frameId);
          setAnalysisResult(null);
          setAnalysisStatus("idle");
          setAnalysisError("");
          resetProductionPlanState();
        }}
        onRemove={(frameId) => {
          removeFrame(frameId);
          setAnalysisResult(null);
          setAnalysisStatus("idle");
          setAnalysisError("");
          resetProductionPlanState();
        }}
      />

      {analysisResult && sourceVideo && previewUrl ? (
        <div className="space-y-8">
          <StoryboardEditor
            analysis={analysisResult.analysis}
            onChange={(nextAnalysis) => {
              resetProductionPlanState();
              setAnalysisResult((current) =>
                current
                  ? {
                      ...current,
                      analysis: nextAnalysis
                    }
                  : current
              );
            }}
            evidenceFramesById={evidenceFramesById}
          />
          <TutorialPreview
            analysis={analysisResult.analysis}
            taskDescription={description}
            generatedInsertMaxPerTutorial={generatedInsertMaxPerTutorial}
            sourceVideo={sourceVideo}
            sourceVideoUrl={previewUrl}
            onChangeAnalysis={(nextAnalysis) => {
              resetProductionPlanState();
              setAnalysisResult((current) =>
                current
                  ? {
                      ...current,
                      analysis: nextAnalysis
                    }
                  : current
              );
            }}
          />
          {productionPlanResult ? (
            <ProductionWorkspace
              result={productionPlanResult}
              sourceVideoFile={file!}
              onRebuild={() => {
                void submitProductionPlanRequest();
              }}
              onUpdateResult={(nextResult) => {
                setProductionPlanResult(nextResult);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
