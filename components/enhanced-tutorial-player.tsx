"use client";

import { useEffect, useMemo, useState } from "react";
import { captureSourceVideoFrameAtTimestamp } from "@/lib/browser-video-processing";
import { formatDuration } from "@/lib/format";
import type { SourceVideo } from "@/lib/source-video";
import type {
  AnnotationType,
  RenderPlan,
  RenderPlanSegment,
  RenderStepOverride
} from "@/lib/rendering/render-plan";
import { getDefaultCropForPreset } from "@/lib/rendering/treatment-rules";
import { createDefaultCropOverride } from "@/lib/rendering/build-render-plan";
import { AnnotationOverlay } from "@/components/annotation-overlay";
import { TutorialTimeline } from "@/components/tutorial-timeline";
import { StatusPill } from "@/components/status-pill";
import { useTutorialPlayback } from "@/hooks/use-tutorial-playback";
import type { Treatment } from "@/lib/tutorial-schema";
import { treatmentDescription, treatmentLabel } from "@/lib/treatment-copy";
import { RENDERING_LIMITS } from "@/lib/constants";

type EnhancedTutorialPlayerProps = {
  renderPlan: RenderPlan;
  sourceVideoUrl: string;
  sourceVideo: SourceVideo;
  onChangeTreatment: (stepId: string, treatment: Treatment) => void;
  onUpdateStepOverride: (
    stepId: string,
    updater: (current: RenderStepOverride) => RenderStepOverride
  ) => void;
  onResetStepOverride: (stepId: string) => void;
};

function formatPlaybackRate(playbackRate: number) {
  return `${playbackRate.toFixed(2).replace(/\.00$/, "")}x`;
}

function getVisibleVideoStyle(segment: RenderPlanSegment | null) {
  if (!segment || !segment.crop) {
    return {
      width: "100%",
      height: "100%",
      left: "0%",
      top: "0%"
    };
  }

  return {
    width: `${(100 / segment.crop.width).toFixed(2)}%`,
    height: `${(100 / segment.crop.height).toFixed(2)}%`,
    left: `${((-segment.crop.x / segment.crop.width) * 100).toFixed(2)}%`,
    top: `${((-segment.crop.y / segment.crop.height) * 100).toFixed(2)}%`
  };
}

function buildAnnotationId(stepId: string, annotationType: AnnotationType, index: number) {
  return `${stepId}-${annotationType}-${index + 1}`;
}

export function EnhancedTutorialPlayer({
  renderPlan,
  sourceVideoUrl,
  sourceVideo,
  onChangeTreatment,
  onUpdateStepOverride,
  onResetStepOverride
}: EnhancedTutorialPlayerProps) {
  const {
    activeSegment: playbackActiveSegment,
    activeSegmentOutputOffset,
    currentOutputTime,
    displayMode,
    isPlaying,
    pause,
    playbackError,
    play,
    previewSegment,
    restart,
    totalOutputDuration,
    videoRef
  } = useTutorialPlayback(renderPlan, sourceVideoUrl);
  const [selectedSegmentId, setSelectedSegmentId] = useState(renderPlan.segments[0]?.id ?? "");
  const [annotationDraftType, setAnnotationDraftType] = useState<AnnotationType>("label");
  const [freezeFrameImageCache, setFreezeFrameImageCache] = useState<Record<string, string>>({});
  const [freezeFrameError, setFreezeFrameError] = useState("");

  const selectedSegment =
    renderPlan.segments.find((segment) => segment.id === selectedSegmentId) ??
    playbackActiveSegment ??
    renderPlan.segments[0] ??
    null;
  const activeSegment = playbackActiveSegment ?? renderPlan.segments[0] ?? null;
  const freezeFrameSegment =
    displayMode === "freeze"
      ? activeSegment
      : selectedSegment?.treatment === "freeze_frame"
        ? selectedSegment
        : null;

  const sourceFrameById = useMemo(
    () => Object.fromEntries(sourceVideo.frames.map((frame) => [frame.id, frame])),
    [sourceVideo.frames]
  );

  useEffect(() => {
    setFreezeFrameImageCache({});
    setFreezeFrameError("");
  }, [sourceVideoUrl]);

  const freezeFrameImage = useMemo(() => {
    if (!freezeFrameSegment) {
      return "";
    }

    if (
      freezeFrameSegment.freezeFrameSourceFrameId &&
      sourceFrameById[freezeFrameSegment.freezeFrameSourceFrameId]
    ) {
      return sourceFrameById[freezeFrameSegment.freezeFrameSourceFrameId]?.imageDataUrl ?? "";
    }

    return freezeFrameImageCache[freezeFrameSegment.id] ?? "";
  }, [freezeFrameImageCache, freezeFrameSegment, sourceFrameById]);

  useEffect(() => {
    setSelectedSegmentId((current) => {
      if (!renderPlan.segments.length) {
        return "";
      }

      return renderPlan.segments.some((segment) => segment.id === current)
        ? current
        : renderPlan.segments[0]?.id ?? "";
    });
  }, [renderPlan.segments]);

  useEffect(() => {
    if (isPlaying && playbackActiveSegment) {
      setSelectedSegmentId(playbackActiveSegment.id);
    }
  }, [isPlaying, playbackActiveSegment]);

  useEffect(() => {
    if (!selectedSegmentId || isPlaying) {
      return;
    }

    void previewSegment(selectedSegmentId);
  }, [isPlaying, previewSegment, renderPlan.segments, selectedSegmentId]);

  useEffect(() => {
    let cancelled = false;

    async function ensureFreezeFrameImage() {
      if (!freezeFrameSegment || freezeFrameSegment.freezeFrameSourceFrameId || !freezeFrameSegment.freezeFrameTimestamp) {
        return;
      }

      if (freezeFrameImageCache[freezeFrameSegment.id]) {
        return;
      }

      try {
        setFreezeFrameError("");
        const capturedFrame = await captureSourceVideoFrameAtTimestamp({
          objectUrl: sourceVideoUrl,
          metadata: sourceVideo.metadata,
          timestampSeconds: freezeFrameSegment.freezeFrameTimestamp
        });

        if (cancelled) {
          return;
        }

        setFreezeFrameImageCache((current) => ({
          ...current,
          [freezeFrameSegment.id]: capturedFrame.imageDataUrl
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setFreezeFrameError(
          error instanceof Error
            ? error.message
            : "GhostCrew could not capture a freeze-frame image."
        );
      }
    }

    void ensureFreezeFrameImage();

    return () => {
      cancelled = true;
    };
  }, [
    freezeFrameImageCache,
    freezeFrameSegment,
    sourceVideo.metadata,
    sourceVideoUrl
  ]);

  function updateSelectedSegmentOverride(
    updater: (current: RenderStepOverride) => RenderStepOverride
  ) {
    if (!selectedSegment) {
      return;
    }

    onUpdateStepOverride(selectedSegment.stepId, updater);
  }

  function setCropPreset(preset: "center" | "left" | "right" | "top" | "bottom") {
    updateSelectedSegmentOverride(() => createDefaultCropOverride(preset));
  }

  function setCustomCropValue(key: "x" | "y" | "width" | "height", value: number) {
    updateSelectedSegmentOverride((current) => {
      const nextCrop = {
        ...(current.crop ?? getDefaultCropForPreset(current.cropPreset ?? "center")),
        [key]: value
      };

      if (key === "width" || key === "height") {
        nextCrop.width = value;
        nextCrop.height = value;
      }

      return {
        ...current,
        cropPreset: "custom",
        crop: nextCrop
      };
    });
  }

  function addAnnotationAtPosition(clientX: number, clientY: number, element: HTMLElement) {
    if (!selectedSegment) {
      return;
    }

    const rect = element.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    updateSelectedSegmentOverride((current) => {
      const nextAnnotations = [...(current.annotations ?? selectedSegment.annotations)];

      nextAnnotations.push({
        id: buildAnnotationId(selectedSegment.stepId, annotationDraftType, nextAnnotations.length),
        type: annotationDraftType,
        x,
        y,
        width: annotationDraftType === "label" ? 0.28 : 0.2,
        height: annotationDraftType === "arrow" ? 0.2 : 0.16,
        text:
          annotationDraftType === "label"
            ? selectedSegment.subtitle
            : annotationDraftType === "box"
              ? selectedSegment.title
              : selectedSegment.title,
        startOffsetSeconds: 0,
        endOffsetSeconds: Math.min(
          selectedSegment.outputDurationSeconds,
          RENDERING_LIMITS.defaultAnnotationDurationSeconds
        )
      });

      return {
        ...current,
        annotations: nextAnnotations
      };
    });
  }

  function updateAnnotationText(annotationId: string, text: string) {
    updateSelectedSegmentOverride((current) => ({
      ...current,
      annotations: (current.annotations ?? selectedSegment?.annotations ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, text } : annotation
      )
    }));
  }

  function removeAnnotation(annotationId: string) {
    updateSelectedSegmentOverride((current) => ({
      ...current,
      annotations: (current.annotations ?? selectedSegment?.annotations ?? []).filter(
        (annotation) => annotation.id !== annotationId
      )
    }));
  }

  function updateFreezeFrameSource(value: string) {
    updateSelectedSegmentOverride((current) => ({
      ...current,
      freezeFrameSourceFrameId: value === "capture" ? null : value,
      freezeFrameTimestamp:
        value === "capture"
          ? selectedSegment?.freezeFrameTimestamp ?? current.freezeFrameTimestamp
          : sourceFrameById[value]?.timestampSeconds ?? current.freezeFrameTimestamp
    }));
  }

  function updateFreezeFrameDuration(value: number) {
    updateSelectedSegmentOverride((current) => ({
      ...current,
      freezeFrameDurationSeconds: value
    }));
  }

  function updateSlowMotionRate(value: number) {
    updateSelectedSegmentOverride((current) => ({
      ...current,
      playbackRate: value
    }));
  }

  const segmentAnnotations = selectedSegment?.annotations ?? [];
  const cropStyle = getVisibleVideoStyle(activeSegment);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                  Enhanced tutorial
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Deterministic preview from the original source clip
                </h3>
              </div>
              {activeSegment ? (
                <StatusPill
                  label={
                    activeSegment.generatedInsertPending
                      ? "generated insert pending"
                      : treatmentLabel[activeSegment.treatment]
                  }
                  tone={activeSegment.generatedInsertPending ? "warning" : "success"}
                />
              ) : null}
            </div>
          </div>

          <div className="p-5">
            <div
              className={`relative overflow-hidden rounded-3xl border border-white/10 bg-black ${
                !isPlaying && selectedSegment ? "cursor-crosshair" : ""
              }`}
              onClick={(event) => {
                if (isPlaying || !selectedSegment) {
                  return;
                }

                addAnnotationAtPosition(
                  event.clientX,
                  event.clientY,
                  event.currentTarget
                );
              }}
            >
              <div
                className="w-full bg-black"
                style={{
                  aspectRatio: `${sourceVideo.metadata.width} / ${sourceVideo.metadata.height}`
                }}
              >
                <video
                  key={sourceVideoUrl}
                  ref={videoRef}
                  src={sourceVideoUrl}
                  preload="metadata"
                  playsInline
                  className={`absolute inset-0 bg-black object-cover ${
                    displayMode === "freeze" ? "opacity-0" : "opacity-100"
                  }`}
                  style={cropStyle}
                />
                {displayMode === "freeze" && activeSegment ? (
                  freezeFrameImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={freezeFrameImage}
                      alt={`${activeSegment.title} freeze frame`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/70">
                      Capturing freeze frame...
                    </div>
                  )
                ) : null}
              </div>

              {activeSegment ? (
                <>
                  <AnnotationOverlay
                    annotations={activeSegment.annotations}
                    segmentOutputOffsetSeconds={activeSegmentOutputOffset}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-4 pb-4 pt-14">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-accent">
                        Step {activeSegment.stepNumber}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                        {treatmentLabel[activeSegment.treatment]}
                      </span>
                      {activeSegment.generatedInsertPending ? (
                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                          Generated insert pending
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur">
                      <p className="text-lg font-semibold text-white">{activeSegment.title}</p>
                      <p className="mt-1 text-sm text-white/82">{activeSegment.subtitle}</p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void play()}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black transition hover:bg-accent/90"
              >
                {isPlaying ? "Resume sequence" : "Play sequence"}
              </button>
              <button
                type="button"
                onClick={() => pause()}
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void restart()}
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
              >
                Restart
              </button>
              {selectedSegment ? (
                <button
                  type="button"
                  onClick={() => void previewSegment(selectedSegment.id)}
                  className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
                >
                  Jump to selected step
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Current time</p>
                <p className="mt-2 text-sm text-white/78">{formatDuration(currentOutputTime)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Total duration</p>
                <p className="mt-2 text-sm text-white/78">{formatDuration(totalOutputDuration)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Active treatment</p>
                <p className="mt-2 text-sm text-white/78">
                  {activeSegment ? treatmentLabel[activeSegment.treatment] : "No segments"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Playback mode</p>
                <p className="mt-2 text-sm text-white/78">
                  {displayMode === "freeze" ? "Freeze frame" : "Source video"}
                </p>
              </div>
            </div>

            {playbackError || freezeFrameError ? (
              <div className="mt-4 space-y-2">
                {playbackError ? (
                  <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    {playbackError}
                  </p>
                ) : null}
                {freezeFrameError ? (
                  <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    {freezeFrameError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
              Segment controls
            </p>
            {selectedSegment ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-lg font-semibold text-white">{selectedSegment.title}</p>
                  <p className="mt-1 text-sm text-white/70">{selectedSegment.subtitle}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                  {treatmentDescription[selectedSegment.requestedTreatment]}
                </div>
                {selectedSegment.generatedInsertPending ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    Generated insert is planned for this step. GhostCrew is previewing the fallback treatment{" "}
                    <strong>{treatmentLabel[selectedSegment.treatment]}</strong> until generative media
                    is implemented.
                  </div>
                ) : null}

                {selectedSegment.treatment === "crop_close_up" ? (
                  <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {(["center", "left", "right", "top", "bottom"] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCropPreset(preset)}
                          className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/25 hover:text-white"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <label className="block space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-white/45">Horizontal crop</span>
                      <input
                        type="range"
                        min="0"
                        max={1 - (selectedSegment.crop?.width ?? 0.64)}
                        step="0.01"
                        value={selectedSegment.crop?.x ?? 0.18}
                        onChange={(event) => setCustomCropValue("x", Number(event.target.value))}
                        className="w-full"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-white/45">Vertical crop</span>
                      <input
                        type="range"
                        min="0"
                        max={1 - (selectedSegment.crop?.height ?? 0.64)}
                        step="0.01"
                        value={selectedSegment.crop?.y ?? 0.18}
                        onChange={(event) => setCustomCropValue("y", Number(event.target.value))}
                        className="w-full"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-white/45">Crop size</span>
                      <input
                        type="range"
                        min={RENDERING_LIMITS.minimumCropSize}
                        max={RENDERING_LIMITS.maximumCropSize}
                        step="0.01"
                        value={selectedSegment.crop?.width ?? 0.64}
                        onChange={(event) => setCustomCropValue("width", Number(event.target.value))}
                        className="w-full"
                      />
                    </label>
                  </div>
                ) : null}

                {selectedSegment.treatment === "slow_motion" ? (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Playback rate</p>
                    <div className="flex gap-2">
                      {RENDERING_LIMITS.slowMotionPlaybackRates.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => updateSlowMotionRate(rate)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            Math.abs(selectedSegment.playbackRate - rate) < 0.001
                              ? "border-accent/35 bg-accent/12 text-white"
                              : "border-white/12 text-white/75 hover:border-white/25 hover:text-white"
                          }`}
                        >
                          {formatPlaybackRate(rate)}
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-white/65">
                      Slow motion uses playback-rate slowdown from the original clip. No synthetic frames
                      are generated yet.
                    </p>
                  </div>
                ) : null}

                {selectedSegment.treatment === "freeze_frame" ? (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <label className="block space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-white/45">Freeze source</span>
                      <select
                        value={selectedSegment.freezeFrameSourceFrameId ?? "capture"}
                        onChange={(event) => updateFreezeFrameSource(event.target.value)}
                        className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40"
                      >
                        <option value="capture">Capture midpoint from video</option>
                        {selectedSegment.evidenceFrameIds.map((frameId) => (
                          <option key={frameId} value={frameId}>
                            {frameId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-white/45">Freeze duration</span>
                      <select
                        value={selectedSegment.freezeFrameDurationSeconds ?? 2}
                        onChange={(event) => updateFreezeFrameDuration(Number(event.target.value))}
                        className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40"
                      >
                        {[1.5, 2, 2.5, 3].map((durationSeconds) => (
                          <option key={durationSeconds} value={durationSeconds}>
                            {durationSeconds.toFixed(1)} seconds
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={annotationDraftType}
                      onChange={(event) => setAnnotationDraftType(event.target.value as AnnotationType)}
                      className="rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40"
                    >
                      <option value="label">Label</option>
                      <option value="box">Highlight box</option>
                      <option value="arrow">Arrow</option>
                    </select>
                    <span className="text-xs text-white/55">
                      Click the preview to place a new annotation on the selected segment.
                    </span>
                  </div>
                  {segmentAnnotations.length ? (
                    <div className="space-y-3">
                      {segmentAnnotations.map((annotation) => (
                        <div
                          key={annotation.id}
                          className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/45">
                              {annotation.type}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeAnnotation(annotation.id)}
                              className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/65 transition hover:border-red-400/25 hover:text-red-200"
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            value={annotation.text}
                            onChange={(event) =>
                              updateAnnotationText(annotation.id, event.target.value)
                            }
                            className="mt-3 w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40"
                            placeholder="Annotation label"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/60">
                      No annotations yet. Choose a type and click the preview to place one.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onResetStepOverride(selectedSegment.stepId)}
                  className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
                >
                  Reset segment adjustments
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">Analyze a source clip to build an enhanced preview.</p>
            )}
          </div>
        </div>
      </div>

      <TutorialTimeline
        renderPlan={renderPlan}
        activeSegmentId={activeSegment?.id ?? null}
        selectedSegmentId={selectedSegment?.id ?? null}
        onSelectSegment={(segmentId) => {
          setSelectedSegmentId(segmentId);
          void previewSegment(segmentId);
        }}
        onPreviewSegment={(segmentId) => {
          setSelectedSegmentId(segmentId);
          void previewSegment(segmentId);
        }}
        onChangeTreatment={onChangeTreatment}
      />
    </section>
  );
}
