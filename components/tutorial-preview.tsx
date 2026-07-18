"use client";

import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { TutorialAnalysis } from "@/lib/tutorial-schema";
import { treatmentDescription, treatmentLabel } from "@/lib/treatment-copy";

type TutorialPreviewProps = {
  analysis: TutorialAnalysis;
  sourceVideoUrl: string;
};

export function TutorialPreview({ analysis, sourceVideoUrl }: TutorialPreviewProps) {
  const [selectedStepId, setSelectedStepId] = useState(analysis.steps[0]?.id ?? "");

  const selectedStep =
    analysis.steps.find((step) => step.id === selectedStepId) ?? analysis.steps[0];

  const subtitles = useMemo(
    () =>
      analysis.steps.map((step) => ({
        id: step.id,
        subtitle: `${step.title}: ${step.instruction}`
      })),
    [analysis.steps]
  );

  return (
    <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Enhanced preview
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{analysis.taskTitle}</h3>
        </div>
        <div className="p-5">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/50">
            <video
              key={sourceVideoUrl}
              src={sourceVideoUrl}
              controls
              className="aspect-video w-full bg-black object-contain"
              preload="metadata"
            />
            {selectedStep ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-4 pb-4 pt-10">
                <div className="max-w-3xl rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.25em] text-accent">
                    {treatmentLabel[selectedStep.treatment]}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedStep.title}</p>
                  <p className="mt-1 text-sm text-white/78">{selectedStep.instruction}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Playback notes
          </p>
          {selectedStep ? (
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <p className="text-white">{selectedStep.viewerRisk}</p>
              <p>{treatmentDescription[selectedStep.treatment]}</p>
              <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white/78">
                Time range: {formatDuration(selectedStep.startTime)} to {formatDuration(selectedStep.endTime)}
              </p>
            </div>
          ) : null}
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Subtitle plan
          </p>
          <div className="mt-4 space-y-3">
            {subtitles.map((subtitle) => (
              <button
                key={subtitle.id}
                type="button"
                onClick={() => setSelectedStepId(subtitle.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  subtitle.id === selectedStep?.id
                    ? "border-accent/25 bg-accent/10 text-white"
                    : "border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:text-white"
                }`}
              >
                {subtitle.subtitle}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
