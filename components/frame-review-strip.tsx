"use client";

import { formatDuration, formatFileSize } from "@/lib/format";
import type { SourceVideoFrame } from "@/lib/source-video";
import type { SourceVideoStatus } from "@/types/tutorial";

type FrameReviewStripProps = {
  frames: SourceVideoFrame[];
  selectedCount: number;
  status: SourceVideoStatus;
  error: string;
  onToggleSelected: (frameId: string) => void;
  onRemove: (frameId: string) => void;
  onReExtract: () => void;
};

export function FrameReviewStrip({
  frames,
  selectedCount,
  status,
  error,
  onToggleSelected,
  onRemove,
  onReExtract
}: FrameReviewStripProps) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Frame review
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Browser-extracted film strip</h2>
          <p className="mt-3 max-w-2xl text-sm text-white/64">
            Select the frames that should be sent to the future analysis model. Remove irrelevant
            images before storyboarding.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/72">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={onReExtract}
            disabled={status === "extracting_frames" || status === "extracting_metadata"}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/78 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "extracting_frames" ? "Extracting..." : "Extract again"}
          </button>
        </div>
      </div>

      {error && status === "error" ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {status === "extracting_frames" ? (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`frame-skeleton-${index + 1}`}
              className="w-44 shrink-0 animate-pulse rounded-[26px] border border-white/10 bg-black/20 p-3"
            >
              <div className="aspect-video rounded-2xl bg-white/6" />
              <div className="mt-3 h-4 w-16 rounded-full bg-white/6" />
              <div className="mt-2 h-3 w-24 rounded-full bg-white/6" />
            </div>
          ))}
        </div>
      ) : null}

      {frames.length ? (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {frames.map((frame) => (
            <article
              key={frame.id}
              className={`w-44 shrink-0 rounded-[26px] border p-3 transition ${
                frame.isSelected
                  ? "border-accent/30 bg-accent/8 shadow-glow"
                  : "border-white/10 bg-black/20 opacity-80"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleSelected(frame.id)}
                className="block w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frame.imageDataUrl}
                  alt={`Extracted frame at ${formatDuration(frame.timestampSeconds)}`}
                  className="aspect-video w-full rounded-2xl border border-white/10 object-cover"
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">
                    {formatDuration(frame.timestampSeconds)}
                  </p>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      frame.isSelected
                        ? "bg-accent/14 text-accent"
                        : "bg-white/8 text-white/55"
                    }`}
                  >
                    {frame.isSelected ? "Selected" : "Skipped"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/52">
                  {frame.width}×{frame.height} • {formatFileSize(frame.byteSize)}
                </p>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onToggleSelected(frame.id)}
                  className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/24 hover:text-white"
                >
                  {frame.isSelected ? "Unselect" : "Select"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(frame.id)}
                  className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/60 transition hover:border-red-400/25 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!frames.length && status !== "extracting_frames" ? (
        <div className="mt-5 rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-8 text-sm text-white/55">
          Extracted frames will appear here after metadata is loaded and the clip is processed.
        </div>
      ) : null}
    </section>
  );
}
