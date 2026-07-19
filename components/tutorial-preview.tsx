"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import {
  generatedInsertResultSchema,
  generatedInsertRenderStateSchema,
  type GeneratedInsertResult
} from "@/lib/generation/generated-insert-schema";
import type { SourceVideo } from "@/lib/source-video";
import { buildRenderPlan } from "@/lib/rendering/build-render-plan";
import {
  renderPlanOverridesSchema,
  type RenderPlanOverrides,
  type RenderStepOverride
} from "@/lib/rendering/render-plan";
import type { TutorialAnalysis, Treatment } from "@/lib/tutorial-schema";
import { EnhancedTutorialPlayer } from "@/components/enhanced-tutorial-player";
import { StatusPill } from "@/components/status-pill";

type TutorialPreviewProps = {
  analysis: TutorialAnalysis;
  taskDescription: string;
  sourceVideo: SourceVideo;
  sourceVideoUrl: string;
  onChangeAnalysis: (analysis: TutorialAnalysis) => void;
};

type ComparisonMode = "side_by_side" | "before" | "after";

function syncRenderOverrides(
  current: RenderPlanOverrides,
  stepIds: string[]
): RenderPlanOverrides {
  const nextEntries = Object.entries(current).filter(([stepId]) => stepIds.includes(stepId));

  return renderPlanOverridesSchema.parse(Object.fromEntries(nextEntries));
}

function parseRenderPlanError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "GhostCrew could not build a valid render plan.";
  }

  return error instanceof Error
    ? error.message
    : "GhostCrew could not build a valid render plan.";
}

export function TutorialPreview({
  analysis,
  taskDescription,
  sourceVideo,
  sourceVideoUrl,
  onChangeAnalysis
}: TutorialPreviewProps) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("side_by_side");
  const [renderOverrides, setRenderOverrides] = useState<RenderPlanOverrides>({});
  const [generatedInsertReviews, setGeneratedInsertReviews] = useState<
    Record<string, GeneratedInsertResult>
  >({});
  const [sessionGenerationCount, setSessionGenerationCount] = useState(0);
  const stepIds = useMemo(() => analysis.steps.map((step) => step.id), [analysis.steps]);

  useEffect(() => {
    setRenderOverrides((current) => syncRenderOverrides(current, stepIds));
    setGeneratedInsertReviews((current) =>
      Object.fromEntries(Object.entries(current).filter(([stepId]) => stepIds.includes(stepId)))
    );
  }, [stepIds]);

  useEffect(() => {
    setRenderOverrides({});
    setGeneratedInsertReviews({});
    setSessionGenerationCount(0);
  }, [sourceVideo.metadata.durationSeconds, sourceVideo.metadata.fileName, sourceVideoUrl]);

  const renderPlanState = useMemo(() => {
    try {
      return {
        renderPlan: buildRenderPlan({
          analysis,
          sourceVideoMetadata: sourceVideo.metadata,
          sourceFrames: sourceVideo.frames,
          overrides: renderOverrides
        }),
        error: ""
      };
    } catch (error) {
      return {
        renderPlan: null,
        error: parseRenderPlanError(error)
      };
    }
  }, [analysis, renderOverrides, sourceVideo.frames, sourceVideo.metadata]);

  const segmentsByStepId = useMemo(
    () =>
      Object.fromEntries(
        (renderPlanState.renderPlan?.segments ?? []).map((segment) => [segment.stepId, segment])
      ),
    [renderPlanState.renderPlan]
  );
  const acceptedInsertCount = useMemo(
    () =>
      (renderPlanState.renderPlan?.segments ?? []).filter(
        (segment) => segment.generatedInsert?.status === "completed"
      ).length,
    [renderPlanState.renderPlan]
  );

  function updateGeneratedInsertState(
    stepId: string,
    updater: (
      current: z.infer<typeof generatedInsertRenderStateSchema>
    ) => z.infer<typeof generatedInsertRenderStateSchema>
  ) {
    const currentSegment = segmentsByStepId[stepId];

    if (!currentSegment?.generatedInsert) {
      return;
    }

    const baseGeneratedInsert = currentSegment.generatedInsert;

    updateStepOverride(stepId, (current) => ({
      ...current,
      generatedInsert: generatedInsertRenderStateSchema.parse(
        updater(current.generatedInsert ?? baseGeneratedInsert)
      )
    }));
  }

  function resolveGeneratedInsertAspectRatio() {
    if (sourceVideo.metadata.width === sourceVideo.metadata.height) {
      return "1:1" as const;
    }

    return sourceVideo.metadata.width > sourceVideo.metadata.height ? ("16:9" as const) : ("9:16" as const);
  }

  function updateStepTreatment(stepId: string, treatment: Treatment) {
    onChangeAnalysis({
      ...analysis,
      steps: analysis.steps.map((step) =>
        step.id === stepId ? { ...step, treatment } : step
      )
    });
  }

  function updateStepOverride(
    stepId: string,
    updater: (current: RenderStepOverride) => RenderStepOverride
  ) {
    setRenderOverrides((current) =>
      renderPlanOverridesSchema.parse({
        ...current,
        [stepId]: updater(current[stepId] ?? {})
      })
    );
  }

  function resetStepOverride(stepId: string) {
    setRenderOverrides((current) => {
      const next = { ...current };
      delete next[stepId];
      return renderPlanOverridesSchema.parse(next);
    });
  }

  function clearGeneratedInsertReview(stepId: string) {
    setGeneratedInsertReviews((current) => {
      const next = { ...current };
      delete next[stepId];
      return next;
    });
  }

  function requestGeneratedInsert(stepId: string) {
    clearGeneratedInsertReview(stepId);
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "awaiting_confirmation",
      warnings: current.warnings.filter(
        (warning) => !warning.toLowerCase().includes("generated media")
      )
    }));
  }

  function cancelGeneratedInsertConfirmation(stepId: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "fallback_active"
    }));
  }

  async function confirmGeneratedInsert(stepId: string) {
    const segment = segmentsByStepId[stepId];
    const step = analysis.steps.find((candidate) => candidate.id === stepId);

    if (!segment?.generatedInsert || !step) {
      return;
    }

    const sourceFrameId = segment.generatedInsert.sourceFrameId ?? step.evidenceFrameIds[0] ?? "";
    const sourceFrame = sourceVideo.frames.find((frame) => frame.id === sourceFrameId);

    if (!sourceFrame) {
      updateGeneratedInsertState(stepId, (current) => ({
        ...current,
        status: "failed",
        warnings: ["GhostCrew could not find the selected evidence frame."]
      }));
      return;
    }

    const nextAttemptCount = (segment.generatedInsert.attemptCount ?? 0) + 1;
    setSessionGenerationCount((current) => current + 1);
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "uploading_reference",
      sourceFrameId,
      attemptCount: nextAttemptCount,
      warnings: []
    }));

    let progressTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      updateGeneratedInsertState(stepId, (current) => ({
        ...current,
        status: "queued",
        sourceFrameId,
        attemptCount: nextAttemptCount
      }));

      progressTimer = setTimeout(() => {
        updateGeneratedInsertState(stepId, (current) => ({
          ...current,
          status: "generating_image",
          sourceFrameId,
          attemptCount: nextAttemptCount
        }));
      }, 600);

      const response = await fetch("/api/generate-insert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stepId: step.id,
          taskTitle: analysis.taskTitle,
          taskDescription: taskDescription.trim() || undefined,
          sourceVideoDurationSeconds: sourceVideo.metadata.durationSeconds,
          stepTitle: step.title,
          instruction: step.instruction,
          viewerRisk: step.viewerRisk,
          evidenceFrameIds: step.evidenceFrameIds,
          intent: segment.generatedInsert.intent,
          modelSuggestedPrompt: step.generationPrompt,
          sourceFrame: {
            id: sourceFrame.id,
            timestampSeconds: sourceFrame.timestampSeconds,
            imageDataUrl: sourceFrame.imageDataUrl,
            mimeType: sourceFrame.mimeType,
            width: sourceFrame.width,
            height: sourceFrame.height,
            byteSize: sourceFrame.byteSize
          },
          outputType: "image",
          aspectRatio: resolveGeneratedInsertAspectRatio(),
          tutorialGenerationCount: sessionGenerationCount,
          acceptedInsertCount
        })
      });
      const rawPayload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(rawPayload.error ?? "Generated insert failed.");
      }

      const parsedPayload = generatedInsertResultSchema.parse(rawPayload);

      if (progressTimer) {
        clearTimeout(progressTimer);
      }

      setGeneratedInsertReviews((current) => ({
        ...current,
        [stepId]: parsedPayload
      }));
      updateGeneratedInsertState(stepId, (current) => ({
        ...current,
        status: "fallback_active",
        sourceFrameId,
        attemptCount: nextAttemptCount,
        warnings: parsedPayload.warnings
      }));
    } catch (error) {
      if (progressTimer) {
        clearTimeout(progressTimer);
      }

      updateGeneratedInsertState(stepId, (current) => ({
        ...current,
        status: "failed",
        sourceFrameId,
        attemptCount: nextAttemptCount,
        warnings: [
          error instanceof Error
            ? error.message
            : "GhostCrew could not generate the supplementary view."
        ]
      }));
    }
  }

  function acceptGeneratedInsert(stepId: string) {
    const reviewResult = generatedInsertReviews[stepId];

    if (!reviewResult) {
      return;
    }

    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "completed",
      mediaType: reviewResult.resultType,
      mediaUrl: reviewResult.mediaUrl,
      thumbnailUrl: reviewResult.thumbnailUrl,
      durationSeconds: reviewResult.durationSeconds,
      provider: reviewResult.provider,
      model: reviewResult.imageModel,
      warnings: reviewResult.warnings,
      generationPromptSummary: reviewResult.generationPromptSummary
    }));
    clearGeneratedInsertReview(stepId);
  }

  function rejectGeneratedInsert(stepId: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "rejected_by_user",
      mediaType: null,
      mediaUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      provider: null,
      model: null
    }));
    clearGeneratedInsertReview(stepId);
  }

  function keepGeneratedInsertFallback(stepId: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "fallback_active",
      mediaType: null,
      mediaUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      provider: null,
      model: null
    }));
    clearGeneratedInsertReview(stepId);
  }

  function regenerateGeneratedInsert(stepId: string) {
    requestGeneratedInsert(stepId);
  }

  function updateGeneratedInsertIntent(stepId: string, intent: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      intent
    }));
  }

  function updateGeneratedInsertSourceFrame(stepId: string, sourceFrameId: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      sourceFrameId
    }));
  }

  function handleGeneratedInsertPlaybackFailure(stepId: string, warning: string) {
    updateGeneratedInsertState(stepId, (current) => ({
      ...current,
      status: "failed",
      mediaType: null,
      mediaUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      provider: null,
      model: null,
      warnings: [warning]
    }));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Before / after
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Original source clip versus GhostCrew’s enhanced tutorial
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65">
            The original upload remains the source of truth. GhostCrew rebuilds the same task as a
            deterministic sequence of cuts, crops, slow motion, freeze frames, and annotations.
          </p>
        </div>
        <div className="flex gap-2">
          {([
            ["side_by_side", "Side by side"],
            ["before", "Before"],
            ["after", "After"]
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setComparisonMode(value)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                comparisonMode === value
                  ? "border-accent/35 bg-accent/12 text-white"
                  : "border-white/12 text-white/72 hover:border-white/25 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {renderPlanState.error ? (
        <div className="rounded-[28px] border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-100">
          {renderPlanState.error}
        </div>
      ) : null}

      <div
        className={`grid gap-6 ${
          comparisonMode === "side_by_side" ? "xl:grid-cols-[0.92fr_1.08fr]" : "grid-cols-1"
        }`}
      >
        {comparisonMode !== "after" ? (
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                    Before
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Original uploaded video</h3>
                </div>
                <StatusPill label="Source truth" tone="neutral" />
              </div>
            </div>
            <div className="p-5">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
                <video
                  key={sourceVideoUrl}
                  src={sourceVideoUrl}
                  controls
                  preload="metadata"
                  className="w-full bg-black object-contain"
                  style={{
                    aspectRatio: `${sourceVideo.metadata.width} / ${sourceVideo.metadata.height}`
                  }}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Duration</p>
                  <p className="mt-2 text-sm text-white/78">
                    {formatDuration(sourceVideo.metadata.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Resolution</p>
                  <p className="mt-2 text-sm text-white/78">
                    {sourceVideo.metadata.width} × {sourceVideo.metadata.height}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Frames sampled</p>
                  <p className="mt-2 text-sm text-white/78">{sourceVideo.frames.length}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {comparisonMode !== "before" ? (
          renderPlanState.renderPlan ? (
            <EnhancedTutorialPlayer
              renderPlan={renderPlanState.renderPlan}
              sourceVideoUrl={sourceVideoUrl}
              sourceVideo={sourceVideo}
              generatedInsertReviews={generatedInsertReviews}
              sessionGenerationCount={sessionGenerationCount}
              acceptedInsertCount={acceptedInsertCount}
              maxAcceptedInsertsPerTutorial={GENERATED_INSERT_LIMITS.maxAcceptedInsertsPerTutorial}
              onChangeTreatment={updateStepTreatment}
              onUpdateStepOverride={updateStepOverride}
              onResetStepOverride={resetStepOverride}
              onUpdateGeneratedInsertIntent={updateGeneratedInsertIntent}
              onUpdateGeneratedInsertSourceFrame={updateGeneratedInsertSourceFrame}
              onRequestGeneratedInsert={requestGeneratedInsert}
              onConfirmGeneratedInsert={confirmGeneratedInsert}
              onCancelGeneratedInsertConfirmation={cancelGeneratedInsertConfirmation}
              onAcceptGeneratedInsert={acceptGeneratedInsert}
              onRejectGeneratedInsert={rejectGeneratedInsert}
              onKeepGeneratedInsertFallback={keepGeneratedInsertFallback}
              onRegenerateGeneratedInsert={regenerateGeneratedInsert}
              onGeneratedInsertPlaybackFailure={handleGeneratedInsertPlaybackFailure}
            />
          ) : null
        ) : null}
      </div>
    </section>
  );
}
