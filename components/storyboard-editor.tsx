"use client";

import { formatDuration } from "@/lib/format";
import type { Treatment, TutorialAnalysis, TutorialStep } from "@/lib/tutorial-schema";
import { treatmentLabel } from "@/lib/treatment-copy";

type StoryboardEditorProps = {
  analysis: TutorialAnalysis;
  onChange: (analysis: TutorialAnalysis) => void;
};

const TREATMENT_OPTIONS: Treatment[] = [
  "keep_original",
  "crop_close_up",
  "slow_motion",
  "freeze_frame",
  "annotation",
  "generated_insert"
];

export function StoryboardEditor({ analysis, onChange }: StoryboardEditorProps) {
  function updateStep(stepId: string, updater: (step: TutorialStep) => TutorialStep) {
    const next = {
      ...analysis,
      steps: analysis.steps.map((step) => (step.id === stepId ? updater(step) : step))
    };

    onChange(next);
  }

  function removeStep(stepId: string) {
    onChange({
      ...analysis,
      steps: analysis.steps.filter((step) => step.id !== stepId)
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Storyboard review
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Detected tutorial steps</h2>
        </div>
        <p className="max-w-sm text-sm text-white/60">
          Edit the step titles, instructions, or treatment choice before final enhancement.
        </p>
      </div>
      <div className="grid gap-4">
        {analysis.steps.map((step, index) => (
          <article
            key={step.id}
            className="grid gap-5 rounded-[28px] border border-white/10 bg-white/5 p-5 lg:grid-cols-[0.17fr_1fr]"
          >
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-accent">Step {index + 1}</p>
              <p className="mt-4 text-3xl font-semibold text-white">{index + 1}</p>
              <p className="mt-4 text-sm text-white/65">
                {formatDuration(step.startTime)} to {formatDuration(step.endTime)}
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Title</span>
                  <input
                    value={step.title}
                    onChange={(event) =>
                      updateStep(step.id, (current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Treatment</span>
                  <select
                    value={step.treatment}
                    onChange={(event) =>
                      updateStep(step.id, (current) => ({
                        ...current,
                        treatment: event.target.value as Treatment
                      }))
                    }
                    className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                  >
                    {TREATMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {treatmentLabel[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm text-white/70">Instruction</span>
                <textarea
                  rows={3}
                  value={step.instruction}
                  onChange={(event) =>
                    updateStep(step.id, (current) => ({
                      ...current,
                      instruction: event.target.value
                    }))
                  }
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">Visibility</p>
                  <p className="mt-2 text-sm text-white">{step.visibility}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">Viewer risk</p>
                  <p className="mt-2 text-sm text-white/75">{step.viewerRisk}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="rounded-2xl border border-white/12 bg-transparent px-4 py-3 text-sm text-white/70 transition hover:border-red-400/30 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
