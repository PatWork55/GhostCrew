"use client";

import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import type { GeneratedInsertResult } from "@/lib/generation/generated-insert-schema";
import {
  canRegenerateGeneratedInsert,
  canStartGeneratedInsert,
  isGeneratedInsertBusy
} from "@/lib/generation/generated-insert-state";
import type { SourceVideoFrame } from "@/lib/source-video";
import type { RenderPlanSegment } from "@/lib/rendering/render-plan";

type GeneratedInsertPanelProps = {
  segment: RenderPlanSegment;
  evidenceFramesById: Record<string, SourceVideoFrame>;
  reviewResult: GeneratedInsertResult | null;
  sessionGenerationCount: number;
  acceptedInsertCount: number;
  maxAcceptedInsertsPerTutorial: number;
  onChangeIntent: (value: string) => void;
  onChangeSourceFrameId: (frameId: string) => void;
  onRequestGenerate: () => void;
  onConfirmGenerate: () => void;
  onCancelConfirmation: () => void;
  onAcceptReview: () => void;
  onRejectReview: () => void;
  onKeepFallback: () => void;
  onRegenerate: () => void;
};

function getStatusCopy(segment: RenderPlanSegment) {
  switch (segment.generatedInsert?.status) {
    case "awaiting_confirmation":
      return "This will consume one paid fal image-edit call.";
    case "uploading_reference":
      return "Preparing the selected reference frame for fal.";
    case "queued":
      return "fal accepted the request and queued the supplementary view.";
    case "generating_image":
      return "Generating the explanatory still image.";
    case "completed":
      return "Accepted AI-generated supplementary view is active in the preview.";
    case "rejected_by_user":
      return "The last generated result was rejected. The deterministic fallback remains active.";
    case "failed":
      return "Generation failed, so GhostCrew kept the deterministic fallback active.";
    case "fallback_active":
    default:
      return "GhostCrew will keep the fallback treatment until you explicitly request a generated supplementary view.";
  }
}

export function GeneratedInsertPanel({
  segment,
  evidenceFramesById,
  reviewResult,
  sessionGenerationCount,
  acceptedInsertCount,
  maxAcceptedInsertsPerTutorial,
  onChangeIntent,
  onChangeSourceFrameId,
  onRequestGenerate,
  onConfirmGenerate,
  onCancelConfirmation,
  onAcceptReview,
  onRejectReview,
  onKeepFallback,
  onRegenerate
}: GeneratedInsertPanelProps) {
  const generatedInsert = segment.generatedInsert;
  const activeSourceFrame =
    (generatedInsert?.sourceFrameId
      ? evidenceFramesById[generatedInsert.sourceFrameId]
      : null) ?? evidenceFramesById[segment.evidenceFrameIds[0] ?? ""];
  const isBusy = isGeneratedInsertBusy(generatedInsert?.status);
  const regenerateDisabled = !canRegenerateGeneratedInsert({
    status: generatedInsert?.status,
    attemptCount: generatedInsert?.attemptCount ?? 0
  });
  const generateDisabled = !canStartGeneratedInsert({
    status: generatedInsert?.status,
    acceptedInsertCount,
    maxAcceptedInsertsPerTutorial,
    sessionGenerationCount
  });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
          AI-generated supplementary view
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
          1K image edit
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
          Approx. $0.08
        </span>
      </div>

      <p className="text-sm text-white/72">{getStatusCopy(segment)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-white/45">Session calls</p>
          <p className="mt-2 text-sm text-white/78">
            {sessionGenerationCount} / {GENERATED_INSERT_LIMITS.maxGenerationRequestsPerTutorial}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-white/45">Accepted inserts</p>
          <p className="mt-2 text-sm text-white/78">
            {acceptedInsertCount} / {maxAcceptedInsertsPerTutorial}
          </p>
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-[0.22em] text-white/45">Generation intent</span>
        <textarea
          rows={3}
          value={generatedInsert?.intent ?? ""}
          maxLength={GENERATED_INSERT_LIMITS.maxIntentLength}
          onChange={(event) => onChangeIntent(event.target.value)}
          disabled={isBusy}
          className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Source evidence frame</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {segment.evidenceFrameIds.map((frameId) => {
            const frame = evidenceFramesById[frameId];

            if (!frame) {
              return null;
            }

            const isSelected = frame.id === generatedInsert?.sourceFrameId;

            return (
              <button
                key={frame.id}
                type="button"
                disabled={isBusy}
                onClick={() => onChangeSourceFrameId(frame.id)}
                className={`overflow-hidden rounded-2xl border text-left transition ${
                  isSelected
                    ? "border-accent/35 bg-accent/12"
                    : "border-white/10 bg-black/25 hover:border-white/25"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frame.imageDataUrl}
                  alt={`${frame.id} evidence`}
                  className="aspect-video w-full object-cover"
                />
                <div className="px-3 py-2 text-xs text-white/70">
                  {frame.id} at {frame.timestampSeconds.toFixed(2)}s
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {generatedInsert?.warnings.length ? (
        <div className="space-y-2">
          {generatedInsert.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {generatedInsert?.status === "awaiting_confirmation" ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirmGenerate}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent/90"
          >
            Confirm generation
          </button>
          <button
            type="button"
            onClick={onCancelConfirmation}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {reviewResult ? (
        <div className="space-y-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Source evidence</p>
              {activeSourceFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeSourceFrame.imageDataUrl}
                  alt="Selected evidence frame"
                  className="mt-2 aspect-video w-full rounded-2xl border border-white/10 object-cover"
                />
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Generated result</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={reviewResult.mediaUrl}
                alt="Generated supplementary view"
                className="mt-2 aspect-video w-full rounded-2xl border border-white/10 object-cover"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78">
            {reviewResult.generationPromptSummary}
          </div>

          {reviewResult.warnings.length ? (
            <div className="space-y-2">
              {reviewResult.warnings.map((warning) => (
                <p
                  key={warning}
                  className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onAcceptReview}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent/90"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onRejectReview}
              className="rounded-full border border-red-400/25 px-4 py-2 text-sm text-red-100 transition hover:border-red-300/40"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
            >
              Regenerate once
            </button>
            <button
              type="button"
              onClick={onKeepFallback}
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
            >
              Keep fallback
            </button>
          </div>
        </div>
      ) : generatedInsert?.status === "completed" && generatedInsert.mediaUrl ? (
        <div className="space-y-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">
            Active accepted result
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={generatedInsert.mediaUrl}
            alt="Accepted generated supplementary view"
            className="aspect-video w-full rounded-2xl border border-white/10 object-cover"
          />
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78">
            {generatedInsert.generationPromptSummary ?? "Accepted supplementary view"}
          </div>
          <button
            type="button"
            onClick={onKeepFallback}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
          >
            Use fallback instead
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRequestGenerate}
            disabled={generateDisabled}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45"
          >
            {isBusy ? "Generating supplementary shot..." : "Generate supplementary shot"}
          </button>
          <button
            type="button"
            onClick={onKeepFallback}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
          >
            Keep fallback
          </button>
        </div>
      )}
    </div>
  );
}
