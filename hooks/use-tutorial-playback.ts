"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RenderPlan } from "@/lib/rendering/render-plan";

type DisplayMode = "video" | "freeze" | "generated_image";

type JumpOptions = {
  autoplay?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function usesAcceptedGeneratedImage(segment: RenderPlan["segments"][number] | null | undefined) {
  return Boolean(
    segment?.generatedInsert?.status === "completed" &&
      segment.generatedInsert.mediaType === "image" &&
      segment.generatedInsert.mediaUrl
  );
}

async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };

    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("The source video could not be decoded by this browser."));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, timestampSeconds: number) {
  await waitForVideoMetadata(video);

  if (Math.abs(video.currentTime - timestampSeconds) < 0.03) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`GhostCrew could not seek the source clip near ${timestampSeconds.toFixed(2)}s.`));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = timestampSeconds;
  });
}

export function useTutorialPlayback(renderPlan: RenderPlan, sourceVideoUrl: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const freezeStartedAtMs = useRef<number | null>(null);
  const freezeElapsedSeconds = useRef(0);
  const activeSegmentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [currentOutputTime, setCurrentOutputTime] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("video");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const goToSegmentRef = useRef<
    ((segmentIndex: number, options?: JumpOptions) => Promise<void>) | null
  >(null);

  const activeSegment = renderPlan.segments[activeSegmentIndex] ?? null;
  const totalOutputDuration = renderPlan.durationSeconds;
  const activeSegmentOutputOffset = useMemo(() => {
    if (!activeSegment) {
      return 0;
    }

    return clamp(
      currentOutputTime - activeSegment.outputStartTime,
      0,
      activeSegment.outputDurationSeconds
    );
  }, [activeSegment, currentOutputTime]);

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    const currentSegment = renderPlan.segments[activeSegmentIndexRef.current];

    stopAnimationLoop();
    isPlayingRef.current = false;
    setIsPlaying(false);

    if (!currentSegment) {
      return;
    }

    if (currentSegment.treatment === "freeze_frame" || usesAcceptedGeneratedImage(currentSegment)) {
      if (freezeStartedAtMs.current !== null) {
        freezeElapsedSeconds.current = clamp(
          (performance.now() - freezeStartedAtMs.current) / 1000,
          0,
          currentSegment.outputDurationSeconds
        );
      }

      freezeStartedAtMs.current = null;
      return;
    }

    videoRef.current?.pause();
  }, [renderPlan.segments, stopAnimationLoop]);

  const goToSegment = useCallback(
    async (segmentIndex: number, options?: JumpOptions) => {
      const nextSegment = renderPlan.segments[segmentIndex];

      if (!nextSegment) {
        pause();
        const lastSegment = renderPlan.segments.at(-1);
        setActiveSegmentIndex(Math.max(0, renderPlan.segments.length - 1));
        activeSegmentIndexRef.current = Math.max(0, renderPlan.segments.length - 1);
        setCurrentOutputTime(lastSegment?.outputEndTime ?? 0);
        return;
      }

      stopAnimationLoop();
      setPlaybackError("");
      activeSegmentIndexRef.current = segmentIndex;
      setActiveSegmentIndex(segmentIndex);
      setCurrentOutputTime(nextSegment.outputStartTime);
      freezeElapsedSeconds.current = 0;
      freezeStartedAtMs.current = null;

      if (usesAcceptedGeneratedImage(nextSegment)) {
        setDisplayMode("generated_image");

        if (options?.autoplay) {
          isPlayingRef.current = true;
          setIsPlaying(true);
          freezeStartedAtMs.current = performance.now();
        } else {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }

        return;
      }

      if (nextSegment.treatment === "freeze_frame") {
        setDisplayMode("freeze");

        if (options?.autoplay) {
          isPlayingRef.current = true;
          setIsPlaying(true);
          freezeStartedAtMs.current = performance.now();
        } else {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }

        return;
      }

      setDisplayMode("video");
      isPlayingRef.current = false;
      setIsPlaying(false);

      const video = videoRef.current;

      if (!video) {
        setPlaybackError("The enhanced tutorial player is unavailable.");
        return;
      }

      try {
        video.pause();
        video.playbackRate = nextSegment.playbackRate;
        await seekVideo(video, nextSegment.sourceStartTime);
        setCurrentOutputTime(nextSegment.outputStartTime);

        if (options?.autoplay) {
          await video.play();
          isPlayingRef.current = true;
          setIsPlaying(true);
        }
      } catch (error) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        setPlaybackError(
          error instanceof Error
            ? error.message
            : "GhostCrew could not load this source segment."
        );
      }
    },
    [pause, renderPlan.segments, stopAnimationLoop]
  );

  const restart = useCallback(async () => {
    await goToSegment(0, { autoplay: false });
    setCurrentOutputTime(0);
  }, [goToSegment]);

  const runPlaybackLoop = useCallback(() => {
    stopAnimationLoop();

    const tick = () => {
      const currentSegment = renderPlan.segments[activeSegmentIndexRef.current];

      if (!currentSegment || !isPlayingRef.current) {
        return;
      }

      if (currentSegment.treatment === "freeze_frame" || usesAcceptedGeneratedImage(currentSegment)) {
        const segmentStartMs =
          freezeStartedAtMs.current ?? performance.now() - freezeElapsedSeconds.current * 1000;
        const elapsedSeconds = clamp(
          (performance.now() - segmentStartMs) / 1000,
          0,
          currentSegment.outputDurationSeconds
        );

        setCurrentOutputTime(currentSegment.outputStartTime + elapsedSeconds);

        if (elapsedSeconds >= currentSegment.outputDurationSeconds - 0.01) {
          freezeElapsedSeconds.current = 0;
          freezeStartedAtMs.current = null;
          void goToSegment(activeSegmentIndexRef.current + 1, { autoplay: true });
          return;
        }
      } else {
        const video = videoRef.current;

        if (!video) {
          setPlaybackError("The source video element is unavailable.");
          pause();
          return;
        }

        const localSourceProgress = clamp(
          video.currentTime - currentSegment.sourceStartTime,
          0,
          currentSegment.sourceDurationSeconds
        );
        const outputProgress = clamp(
          localSourceProgress / currentSegment.playbackRate,
          0,
          currentSegment.outputDurationSeconds
        );

        setCurrentOutputTime(currentSegment.outputStartTime + outputProgress);

        if (video.currentTime >= currentSegment.sourceEndTime - 0.04) {
          void goToSegment(activeSegmentIndexRef.current + 1, { autoplay: true });
          return;
        }
      }

      animationFrameId.current = requestAnimationFrame(tick);
    };

    animationFrameId.current = requestAnimationFrame(tick);
  }, [goToSegment, pause, renderPlan.segments, stopAnimationLoop]);

  const play = useCallback(async () => {
    const currentSegment = renderPlan.segments[activeSegmentIndexRef.current];

    if (!currentSegment) {
      return;
    }

    setPlaybackError("");

    if (currentSegment.treatment === "freeze_frame" || usesAcceptedGeneratedImage(currentSegment)) {
      freezeStartedAtMs.current =
        performance.now() - freezeElapsedSeconds.current * 1000;
      isPlayingRef.current = true;
      setIsPlaying(true);
      runPlaybackLoop();
      return;
    }

    const video = videoRef.current;

    if (!video) {
      setPlaybackError("The source video element is unavailable.");
      return;
    }

    try {
      video.playbackRate = currentSegment.playbackRate;

      if (video.currentTime < currentSegment.sourceStartTime || video.currentTime > currentSegment.sourceEndTime) {
        await seekVideo(video, currentSegment.sourceStartTime);
      }

      await video.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
      runPlaybackLoop();
    } catch (error) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setPlaybackError(
        error instanceof Error
          ? error.message
          : "GhostCrew could not start source-video playback."
      );
    }
  }, [renderPlan.segments, runPlaybackLoop]);

  const jumpToSegment = useCallback(
    async (segmentId: string, options?: JumpOptions) => {
      const segmentIndex = renderPlan.segments.findIndex((segment) => segment.id === segmentId);

      if (segmentIndex === -1) {
        setPlaybackError("That storyboard segment is no longer available.");
        return;
      }

      await goToSegment(segmentIndex, options);
    },
    [goToSegment, renderPlan.segments]
  );

  useEffect(() => {
    goToSegmentRef.current = goToSegment;
  }, [goToSegment]);

  useEffect(() => {
    const currentSegmentId = renderPlan.segments[activeSegmentIndexRef.current]?.id;

    if (!currentSegmentId) {
      activeSegmentIndexRef.current = 0;
      setActiveSegmentIndex(0);
      setCurrentOutputTime(0);
      return;
    }

    const nextIndex = renderPlan.segments.findIndex((segment) => segment.id === currentSegmentId);

    if (nextIndex === -1) {
      activeSegmentIndexRef.current = 0;
      setActiveSegmentIndex(0);
      setCurrentOutputTime(0);
      return;
    }

    activeSegmentIndexRef.current = nextIndex;
    setActiveSegmentIndex(nextIndex);
  }, [renderPlan.segments]);

  useEffect(() => {
    const videoElement = videoRef.current;
    void goToSegmentRef.current?.(0, { autoplay: false });

    return () => {
      stopAnimationLoop();
      videoElement?.pause();
    };
  }, [sourceVideoUrl, stopAnimationLoop]);

  useEffect(() => {
    if (!isPlayingRef.current) {
      return;
    }

    runPlaybackLoop();
  }, [activeSegmentIndex, isPlaying, runPlaybackLoop]);

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    const handleVideoError = () => {
      setPlaybackError("The browser could not play this source video.");
      pause();
    };

    const handlePause = () => {
      if (!isPlayingRef.current) {
        return;
      }

      isPlayingRef.current = false;
      setIsPlaying(false);
      stopAnimationLoop();
    };

    videoElement.addEventListener("error", handleVideoError);
    videoElement.addEventListener("pause", handlePause);

    return () => {
      videoElement.removeEventListener("error", handleVideoError);
      videoElement.removeEventListener("pause", handlePause);
    };
  }, [pause, stopAnimationLoop]);

  return {
    activeSegment,
    activeSegmentIndex,
    activeSegmentOutputOffset,
    currentOutputTime,
    displayMode,
    isPlaying,
    pause,
    playbackError,
    play,
    restart,
    totalOutputDuration,
    jumpToSegment,
    previewSegment: jumpToSegment,
    videoRef
  };
}
