"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NARRATION_LIMITS } from "@/lib/constants";
import { tutorialExportResponseSchema, type TutorialExportResponse } from "@/lib/export/tutorial-export";
import { formatDuration } from "@/lib/format";
import { buildProductionNarration } from "@/lib/narration/build-narration";
import type { ProductionPlanResponse } from "@/lib/production/production-plan-contract";
import type { ProductionNarration, SourceAudioMode } from "@/lib/production/production-plan";
import { StatusPill } from "@/components/status-pill";

type ProductionWorkspaceProps = {
  result: ProductionPlanResponse;
  sourceVideoFile: File;
  onRebuild: () => void;
  onUpdateResult: (nextResult: ProductionPlanResponse) => void;
};

type ExportStatus = "idle" | "submitting" | "ready" | "error";

function getSegmentById(result: ProductionPlanResponse, segmentId: string | null) {
  if (!segmentId) {
    return result.productionPlan.segments[0] ?? null;
  }

  return (
    result.productionPlan.segments.find((segment) => segment.id === segmentId) ??
    result.productionPlan.segments[0] ??
    null
  );
}

function getZoomScale(progress: number) {
  return 1 + Math.min(0.18, Math.max(0, progress) * 0.18);
}

function getAudioModeLabel(mode: SourceAudioMode) {
  switch (mode) {
    case "under_narration":
      return "Original audio low under narration";
    case "keep_source":
      return "Keep original audio";
    default:
      return "Mute original audio";
  }
}

function createNarrationDraft(result: ProductionPlanResponse) {
  return (
    result.productionPlan.narration ??
    buildProductionNarration(result.productionPlan, {
      voice: NARRATION_LIMITS.defaultVoice
    })
  );
}

export function ProductionWorkspace({
  result,
  sourceVideoFile,
  onRebuild,
  onUpdateResult
}: ProductionWorkspaceProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState(
    result.productionPlan.segments[0]?.id ?? ""
  );
  const [zoomProgress, setZoomProgress] = useState(0);
  const defaultNarrationDraft = useMemo(() => createNarrationDraft(result), [result]);
  const [narrationDraft, setNarrationDraft] = useState<ProductionNarration>(() =>
    defaultNarrationDraft
  );
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportError, setExportError] = useState("");
  const [exportResult, setExportResult] = useState<TutorialExportResponse | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selectedSegment = getSegmentById(result, selectedSegmentId);

  useEffect(() => {
    setSelectedSegmentId((current) => current || result.productionPlan.segments[0]?.id || "");
  }, [result.productionPlan.segments]);

  useEffect(() => {
    setNarrationDraft(defaultNarrationDraft);
    setExportStatus("idle");
    setExportError("");
    setExportResult(null);
  }, [defaultNarrationDraft]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !selectedSegment) {
      return;
    }

    const currentVideo = video;
    const durationSeconds =
      selectedSegment.acceptedAsset?.durationSeconds ||
      selectedSegment.outputEndTime - selectedSegment.outputStartTime;

    function handleTimeUpdate() {
      const nextProgress =
        durationSeconds > 0
          ? Math.min(1, Math.max(0, currentVideo.currentTime / durationSeconds))
          : 0;
      setZoomProgress(nextProgress);
    }

    currentVideo.playbackRate = selectedSegment.playbackRate;
    handleTimeUpdate();
    currentVideo.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      currentVideo.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [selectedSegment]);

  const selectedTimelineItem = useMemo(() => {
    if (!selectedSegment) {
      return null;
    }

    return (
      result.productionPlan.finalTimeline.find((item) => item.segmentId === selectedSegment.id) ??
      null
    );
  }, [result.productionPlan.finalTimeline, selectedSegment]);

  const selectedNarrationSegment = useMemo(() => {
    if (!selectedTimelineItem) {
      return null;
    }

    return (
      narrationDraft.segments.find((segment) => segment.timelineItemId === selectedTimelineItem.id) ??
      null
    );
  }, [narrationDraft.segments, selectedTimelineItem]);

  const previewScale =
    selectedSegment?.selectedStrategy === "tracked_zoom" ? getZoomScale(zoomProgress) : 1;

  function updateNarrationSegmentText(timelineItemId: string, nextText: string) {
    setNarrationDraft((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.timelineItemId === timelineItemId
          ? {
              ...segment,
              text: nextText.slice(0, NARRATION_LIMITS.maximumSegmentTextLength)
            }
          : segment
      )
    }));
  }

  function persistNarrationDraft(nextDraft: ProductionNarration) {
    onUpdateResult({
      ...result,
      productionPlan: {
        ...result.productionPlan,
        narration: nextDraft
      }
    });
  }

  async function handleExport() {
    if (exportStatus === "submitting") {
      return;
    }

    try {
      setExportStatus("submitting");
      setExportError("");
      const productionPlan = {
        ...result.productionPlan,
        narration: narrationDraft
      };
      const formData = new FormData();
      formData.set("video", sourceVideoFile);
      formData.set("productionPlan", JSON.stringify(productionPlan));

      const response = await fetch("/api/export", {
        method: "POST",
        body: formData
      });
      const rawPayload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(rawPayload.error ?? "GhostCrew could not render the final MP4.");
      }

      const parsedPayload = tutorialExportResponseSchema.parse(rawPayload);
      setExportResult(parsedPayload);
      setExportStatus("ready");
      setNarrationDraft(parsedPayload.narration);
      onUpdateResult({
        ...result,
        productionPlan: parsedPayload.productionPlan,
        warnings: Array.from(new Set([...result.warnings, ...parsedPayload.warnings]))
      });
    } catch (error) {
      setExportStatus("error");
      setExportError(
        error instanceof Error
          ? error.message
          : "GhostCrew could not render the final MP4."
      );
    }
  }

  return (
    <section className="space-y-6 rounded-[32px] border border-cyan-400/15 bg-cyan-400/5 p-6 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-100/70">
            Production workspace
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Narrated timeline and final export
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-white/68">
            This Phase B slice turns the validated production plan into a concise narration draft,
            synchronized subtitles, optional mixed source audio, and a deterministic downloadable
            MP4. The browser timeline remains available if export fails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={result.directVideo.fallbackUsed ? "Direct video fallback" : "Direct video AI"}
            tone={result.directVideo.fallbackUsed ? "warning" : "success"}
          />
          <button
            type="button"
            onClick={onRebuild}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
          >
            Rebuild production plan
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Direct model</p>
          <p className="mt-2 text-sm text-white/78">{result.directVideo.model}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Objects detected</p>
          <p className="mt-2 text-sm text-white/78">{result.productionPlan.objects.length}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Timeline duration</p>
          <p className="mt-2 text-sm text-white/78">
            {formatDuration(
              result.productionPlan.finalTimeline.at(-1)?.outputEndTime ??
                result.productionPlan.segments.at(-1)?.outputEndTime ??
                0
            )}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Narration voice</p>
          <p className="mt-2 text-sm text-white/78">{narrationDraft.voice}</p>
        </div>
      </div>

      {result.directVideo.warnings.length ? (
        <div className="space-y-2">
          {result.directVideo.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/40">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                    Visual timeline preview
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    Selected segment: {selectedSegment?.title ?? "None"}
                  </p>
                </div>
                {selectedTimelineItem ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    {selectedTimelineItem.classification}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="p-5">
              {selectedSegment?.acceptedAsset?.mediaUrl ? (
                <div className="space-y-4">
                  <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black">
                    <div
                      className="absolute inset-0 origin-center transition-transform"
                      style={{
                        transform: `scale(${previewScale})`
                      }}
                    >
                      <video
                        key={selectedSegment.acceptedAsset.mediaUrl}
                        ref={videoRef}
                        src={selectedSegment.acceptedAsset.mediaUrl}
                        controls
                        preload="metadata"
                        className="h-full w-full bg-black object-contain"
                      />
                    </div>
                    <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/12 bg-black/55 px-3 py-1 text-xs text-white/80">
                        {selectedSegment.selectedStrategy}
                      </span>
                      {selectedSegment.selectedStrategy === "tracked_zoom" ? (
                        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                          Deterministic moving zoom
                        </span>
                      ) : null}
                      {selectedNarrationSegment ? (
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                          Narration ready
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                        Source range
                      </p>
                      <p className="mt-2 text-sm text-white/78">
                        {formatDuration(selectedSegment.sourceStartTime)} to{" "}
                        {formatDuration(selectedSegment.sourceEndTime)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                        Output range
                      </p>
                      <p className="mt-2 text-sm text-white/78">
                        {formatDuration(selectedSegment.outputStartTime)} to{" "}
                        {formatDuration(selectedSegment.outputEndTime)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                        Playback rate
                      </p>
                      <p className="mt-2 text-sm text-white/78">{selectedSegment.playbackRate}x</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                        Source audio
                      </p>
                      <p className="mt-2 text-sm text-white/78">
                        {getAudioModeLabel(narrationDraft.sourceAudioMode)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-3xl border border-dashed border-white/12 bg-black/25 px-6 text-center text-sm text-white/52">
                  GhostCrew could not materialize the selected segment clip yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                  Narration draft
                </p>
                <p className="mt-2 max-w-2xl text-sm text-white/64">
                  GhostCrew drafts narration from timeline-safe visual facts only. Edit any line
                  before rendering the final MP4.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const nextDraft = buildProductionNarration(result.productionPlan, {
                      voice: narrationDraft.voice,
                      sourceAudioMode: narrationDraft.sourceAudioMode
                    });
                    setNarrationDraft(nextDraft);
                  }}
                  className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
                >
                  Redraft narration
                </button>
                <button
                  type="button"
                  onClick={() => persistNarrationDraft(narrationDraft)}
                  className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-400/35 hover:bg-emerald-400/15"
                >
                  Save narration
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-white/70">Voice</span>
                <select
                  value={narrationDraft.voice}
                  onChange={(event) =>
                    setNarrationDraft((current) => ({
                      ...current,
                      voice: event.target.value
                    }))
                  }
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                >
                  {NARRATION_LIMITS.supportedVoices.map((voice) => (
                    <option key={voice}>{voice}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-white/70">Original source audio</span>
                <select
                  value={narrationDraft.sourceAudioMode}
                  onChange={(event) =>
                    setNarrationDraft((current) => ({
                      ...current,
                      sourceAudioMode: event.target.value as SourceAudioMode
                    }))
                  }
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                >
                  <option value="mute_source">Mute original audio</option>
                  <option value="under_narration">Keep original audio low</option>
                  <option value="keep_source">Keep original audio full</option>
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-4">
              {narrationDraft.segments.map((segment, index) => (
                <label
                  key={segment.timelineItemId}
                  className="block rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-accent">
                      Segment {index + 1}
                    </span>
                    <span className="text-xs text-white/45">
                      {formatDuration(segment.targetStartTime)} to{" "}
                      {formatDuration(segment.targetEndTime)}
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={segment.text}
                    onChange={(event) =>
                      updateNarrationSegmentText(segment.timelineItemId, event.target.value)
                    }
                    className="mt-3 w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                  />
                  <p className="mt-2 text-xs text-white/45">
                    Allowed facts: {segment.allowedVisualFactIds.join(", ")}
                  </p>
                </label>
              ))}
            </div>
          </div>

          {exportError ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {exportError}
            </div>
          ) : null}

          {exportResult ? (
            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/8 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-emerald-100/75">
                    Final export ready
                  </p>
                  <p className="mt-2 text-sm text-emerald-100/70">
                    {formatDuration(exportResult.output.durationSeconds)} MP4 with narration and
                    synchronized subtitles.
                  </p>
                </div>
                <StatusPill label="MP4 ready" tone="success" />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={exportResult.output.downloadUrl}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black transition hover:bg-accent/90"
                >
                  Download MP4
                </a>
                <a
                  href={exportResult.output.reportUrl}
                  className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
                >
                  Download process report
                </a>
              </div>
              {exportResult.warnings.length ? (
                <div className="mt-4 space-y-2">
                  {exportResult.warnings.map((warning) => (
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
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
              Final timeline
            </p>
            <div className="mt-4 space-y-3">
              {result.productionPlan.segments.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  onClick={() => setSelectedSegmentId(segment.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedSegment?.id === segment.id
                      ? "border-cyan-400/30 bg-cyan-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-accent">
                      Step {segment.stepNumber}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                      {segment.selectedStrategy}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-white">{segment.title}</p>
                  <p className="mt-1 text-sm text-white/68">{segment.pedagogicalGoal}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/45">
                    <span>
                      {formatDuration(segment.outputStartTime)} to{" "}
                      {formatDuration(segment.outputEndTime)}
                    </span>
                    <span>{segment.acceptedAsset?.fileName ?? "No clip"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                  Final MP4 export
                </p>
                <p className="mt-2 text-sm text-white/64">
                  This triggers TTS only now. If voice rendering fails, GhostCrew keeps the visual
                  timeline and can still fall back to subtitles-only export.
                </p>
              </div>
              <StatusPill
                label={
                  exportStatus === "submitting"
                    ? "Rendering"
                    : exportStatus === "ready"
                      ? "Download ready"
                      : "Not rendered"
                }
                tone={
                  exportStatus === "ready"
                    ? "success"
                    : exportStatus === "error"
                      ? "warning"
                      : "neutral"
                }
              />
            </div>
            <div className="mt-5 grid gap-3 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                Source video: {sourceVideoFile.name}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                Voice: {narrationDraft.voice}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                Audio mode: {getAudioModeLabel(narrationDraft.sourceAudioMode)}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => persistNarrationDraft(narrationDraft)}
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
              >
                Save draft to plan
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exportStatus === "submitting"}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
              >
                {exportStatus === "submitting" ? "Rendering final MP4..." : "Render final MP4"}
              </button>
            </div>
          </div>

          {selectedSegment ? (
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                Segment documentation
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/72">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                    Factual action
                  </p>
                  <p className="mt-2">{selectedSegment.factualAction}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                    Viewer difficulty
                  </p>
                  <p className="mt-2">{selectedSegment.viewerDifficulty}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                    Narration-safe facts
                  </p>
                  <div className="mt-2 space-y-2">
                    {selectedSegment.visualFactsForNarration.map((fact) => (
                      <p key={fact.id}>{fact.text}</p>
                    ))}
                  </div>
                </div>
                {selectedNarrationSegment ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                      Narration line
                    </p>
                    <p className="mt-2">{selectedNarrationSegment.text}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                    Reasoning summary
                  </p>
                  <p className="mt-2">{selectedSegment.reasoningSummary}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
