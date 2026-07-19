"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { formatDuration } from "@/lib/format";
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
  sourceVideo,
  sourceVideoUrl,
  onChangeAnalysis
}: TutorialPreviewProps) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("side_by_side");
  const [renderOverrides, setRenderOverrides] = useState<RenderPlanOverrides>({});
  const stepIds = useMemo(() => analysis.steps.map((step) => step.id), [analysis.steps]);

  useEffect(() => {
    setRenderOverrides((current) => syncRenderOverrides(current, stepIds));
  }, [stepIds]);

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
              onChangeTreatment={updateStepTreatment}
              onUpdateStepOverride={updateStepOverride}
              onResetStepOverride={resetStepOverride}
            />
          ) : null
        ) : null}
      </div>
    </section>
  );
}
