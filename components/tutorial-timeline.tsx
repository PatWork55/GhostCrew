"use client";

import { formatDuration } from "@/lib/format";
import type { RenderPlan } from "@/lib/rendering/render-plan";
import type { Treatment } from "@/lib/tutorial-schema";
import { treatmentLabel } from "@/lib/treatment-copy";

type TutorialTimelineProps = {
  renderPlan: RenderPlan;
  activeSegmentId: string | null;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  onPreviewSegment: (segmentId: string) => void;
  onChangeTreatment: (stepId: string, treatment: Treatment) => void;
};

const TREATMENT_OPTIONS: Treatment[] = [
  "keep_original",
  "crop_close_up",
  "slow_motion",
  "freeze_frame",
  "annotation",
  "generated_insert"
];

export function TutorialTimeline({
  renderPlan,
  activeSegmentId,
  selectedSegmentId,
  onSelectSegment,
  onPreviewSegment,
  onChangeTreatment
}: TutorialTimelineProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Tutorial timeline
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Segment-by-segment render plan</h3>
        </div>
        <p className="max-w-xl text-sm text-white/62">
          Select a segment to jump the enhanced preview, adjust its treatment, and inspect source
          versus output timing.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        {renderPlan.segments.map((segment) => {
          const isActive = segment.id === activeSegmentId;
          const isSelected = segment.id === selectedSegmentId;
          const generatedInsertStatus = segment.generatedInsert?.status;
          const generatedInsertBadge =
            generatedInsertStatus === "completed"
              ? "AI view accepted"
              : generatedInsertStatus === "failed"
                ? "Fallback after failure"
                : generatedInsertStatus === "rejected_by_user"
                  ? "Fallback after rejection"
                  : segment.generatedInsertPending
                    ? "Generated insert pending"
                    : null;

          return (
            <article
              key={segment.id}
              className={`rounded-[26px] border p-4 transition ${
                isActive
                  ? "border-accent/35 bg-accent/10 shadow-glow"
                  : isSelected
                    ? "border-white/18 bg-white/8"
                    : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => onSelectSegment(segment.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.22em] text-accent">
                      Step {segment.stepNumber}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                      {treatmentLabel[segment.requestedTreatment]}
                    </span>
                    {generatedInsertBadge ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs ${
                          generatedInsertStatus === "completed"
                            ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                            : generatedInsertStatus === "failed" ||
                                generatedInsertStatus === "rejected_by_user"
                              ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
                              : "border-amber-400/25 bg-amber-400/10 text-amber-100"
                        }`}
                      >
                        {generatedInsertBadge}
                      </span>
                    ) : null}
                    {isActive ? (
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                        Playing
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">{segment.title}</p>
                  <p className="mt-1 text-sm text-white/68">{segment.subtitle}</p>
                </button>
                <div className="flex flex-col items-stretch gap-3 sm:min-w-64">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-white/45">Treatment</span>
                    <select
                      value={segment.requestedTreatment}
                      onChange={(event) =>
                        onChangeTreatment(segment.stepId, event.target.value as Treatment)
                      }
                      className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/40"
                    >
                      {TREATMENT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {treatmentLabel[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => onPreviewSegment(segment.id)}
                    className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white"
                  >
                    Preview this segment
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Source range</p>
                  <p className="mt-2 text-sm text-white/78">
                    {formatDuration(segment.sourceStartTime)} to {formatDuration(segment.sourceEndTime)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Source duration</p>
                  <p className="mt-2 text-sm text-white/78">
                    {formatDuration(segment.sourceDurationSeconds)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Output duration</p>
                  <p className="mt-2 text-sm text-white/78">
                    {formatDuration(segment.outputDurationSeconds)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">Confidence</p>
                  <p className="mt-2 text-sm text-white/78">
                    {Math.round(segment.confidence * 100)}%
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
