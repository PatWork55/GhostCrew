"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatFileSize } from "@/lib/format";
import { PROJECT, SUPPORTED_VIDEO_TYPES, VIDEO_DURATION_RANGE } from "@/lib/constants";
import { StoryboardEditor } from "@/components/storyboard-editor";
import { StatusPill } from "@/components/status-pill";
import { TutorialPreview } from "@/components/tutorial-preview";
import type { TutorialAnalysis } from "@/lib/tutorial-schema";
import type { TutorialStatus } from "@/types/tutorial";

type VideoMetadata = {
  durationSeconds: number;
};

const DEFAULT_LANGUAGE = "English";

export function CreateTutorialForm() {
  const [taskTitle, setTaskTitle] = useState("Assemble a phone stand");
  const [description, setDescription] = useState(
    "A quick one-angle phone video showing how to unfold and lock a small desk phone stand."
  );
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<TutorialStatus>("idle");
  const [analysis, setAnalysis] = useState<TutorialAnalysis | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoFile) {
      setPreviewUrl("");
      setMetadata(null);
      return;
    }

    const objectUrl = URL.createObjectURL(videoFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  const fileValidation = useMemo(() => {
    if (!videoFile) {
      return { ok: false, message: "Upload a short MP4 or WebM source clip to begin." };
    }

    if (!SUPPORTED_VIDEO_TYPES.includes(videoFile.type as (typeof SUPPORTED_VIDEO_TYPES)[number])) {
      return { ok: false, message: "Only MP4 and WebM are supported in this MVP." };
    }

    if (!metadata) {
      return { ok: false, message: "Reading source-video metadata..." };
    }

    if (metadata.durationSeconds < VIDEO_DURATION_RANGE.minSeconds) {
      return {
        ok: false,
        message: `Video is too short. Use at least ${VIDEO_DURATION_RANGE.minSeconds} seconds.`
      };
    }

    if (metadata.durationSeconds > VIDEO_DURATION_RANGE.maxSeconds) {
      return {
        ok: false,
        message: `Video is too long. Keep it under ${VIDEO_DURATION_RANGE.maxSeconds} seconds.`
      };
    }

    return { ok: true, message: "Source clip is valid and ready for analysis." };
  }, [metadata, videoFile]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!videoFile || !metadata) {
      setStatus("error");
      setError("Select a video and wait for metadata before starting analysis.");
      return;
    }

    if (!fileValidation.ok) {
      setStatus("error");
      setError(fileValidation.message);
      return;
    }

    setStatus("analyzing");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          taskTitle,
          description,
          language,
          video: {
            name: videoFile.name,
            size: videoFile.size,
            type: videoFile.type,
            durationSeconds: metadata.durationSeconds
          }
        })
      });

      const payload = (await response.json()) as {
        analysis?: TutorialAnalysis;
        error?: string;
      };

      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error ?? "Analysis failed");
      }

      setAnalysis(payload.analysis);
      setStatus("ready");
    } catch (requestError) {
      setStatus("error");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The analysis request failed. Try again with a different clip."
      );
    }
  }

  function handleVideoMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    const element = event.currentTarget;
    const durationSeconds = Number.isFinite(element.duration) ? element.duration : 0;

    if (!durationSeconds) {
      return;
    }

    setMetadata({ durationSeconds });
  }

  function handleRegenerate() {
    if (!videoFile || !metadata) {
      return;
    }

    void fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        taskTitle,
        description,
        language,
        video: {
          name: videoFile.name,
          size: videoFile.size,
          type: videoFile.type,
          durationSeconds: metadata.durationSeconds
        }
      })
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          analysis?: TutorialAnalysis;
          error?: string;
        };

        if (!response.ok || !payload.analysis) {
          throw new Error(payload.error ?? "Analysis failed");
        }

        setAnalysis(payload.analysis);
        setStatus("ready");
      })
      .catch((requestError) => {
        setStatus("error");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not regenerate the demo analysis."
        );
      });
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
                Upload a rough 10 to 45 second source clip, describe the task, and let GhostCrew
                turn it into an instructional storyboard.
              </p>
            </div>
            <StatusPill
              label={status === "ready" ? "analysis ready" : "demo analysis"}
              tone={status === "ready" ? "success" : "neutral"}
            />
          </div>

          <div className="mt-8 grid gap-5">
            <label className="space-y-2">
              <span className="text-sm text-white/70">Task name</span>
              <input
                required
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
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
                className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-accent/40"
                placeholder="Optional context for the tutorial"
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-white/70">Tutorial language</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
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
                    setVideoFile(nextFile);
                    setAnalysis(null);
                    setStatus("validating");
                    setError("");
                  }}
                  className="block w-full rounded-2xl border border-dashed border-white/18 bg-black/25 px-4 py-[0.82rem] text-sm text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
              <p className="text-white">{fileValidation.message}</p>
              <p className="mt-2 text-white/58">
                Supported formats: MP4 and WebM. Recommended demo task: a rough phone-stand
                assembly clip with one quick motion and one small detail.
              </p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!fileValidation.ok || status === "analyzing"}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
              >
                {status === "analyzing" ? "Analyzing..." : "Start analysis"}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={!analysis}
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/78 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Regenerate analysis
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-black/35">
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
                Source preview
              </p>
            </div>
            <div className="p-5">
              {previewUrl ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
                    <video
                      ref={previewRef}
                      src={previewUrl}
                      controls
                      preload="metadata"
                      onLoadedMetadata={handleVideoMetadata}
                      className="aspect-video w-full bg-black object-contain"
                    />
                  </div>
                  {videoFile ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Format</p>
                        <p className="mt-2 text-sm text-white/76">{videoFile.type || "unknown"}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">Duration</p>
                        <p className="mt-2 text-sm text-white/76">
                          {metadata ? formatDuration(metadata.durationSeconds) : "Inspecting..."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/40">File size</p>
                        <p className="mt-2 text-sm text-white/76">{formatFileSize(videoFile.size)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-3xl border border-dashed border-white/12 bg-black/25 px-6 text-center text-sm text-white/52">
                  Drop in a rough phone recording to inspect its metadata and start the storyboard analysis.
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

      {analysis ? (
        <div className="space-y-8">
          <StoryboardEditor analysis={analysis} onChange={setAnalysis} />
          <TutorialPreview analysis={analysis} sourceVideoUrl={previewUrl} />
        </div>
      ) : null}
    </div>
  );
}
