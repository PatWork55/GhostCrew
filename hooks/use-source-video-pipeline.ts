"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  extractSourceVideoFrames,
  readSourceVideoMetadata
} from "@/lib/browser-video-processing";
import {
  getSelectedFramesForAnalysis,
  validateSourceVideoMetadata,
  validateSourceVideoUpload,
  type SourceVideo
} from "@/lib/source-video";
import type { SourceVideoStatus } from "@/types/tutorial";

export function useSourceVideoPipeline() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [status, setStatus] = useState<SourceVideoStatus>("idle");
  const [error, setError] = useState("");
  const activeRunId = useRef(0);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      setSourceVideo(null);
      setStatus("idle");
      setError("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function processVideo(nextFile: File, objectUrl: string) {
    const uploadError = validateSourceVideoUpload(nextFile);

    if (uploadError) {
      setSourceVideo(null);
      setStatus("error");
      setError(uploadError);
      return;
    }

    const runId = activeRunId.current + 1;
    activeRunId.current = runId;
    setError("");
    setStatus("loading_video");

    try {
      setStatus("extracting_metadata");
      const metadata = await readSourceVideoMetadata({
        file: nextFile,
        objectUrl
      });

      if (activeRunId.current !== runId) {
        return;
      }

      const metadataError = validateSourceVideoMetadata(metadata);

      if (metadataError) {
        setSourceVideo({
          metadata,
          frames: []
        });
        setStatus("error");
        setError(metadataError);
        return;
      }

      setSourceVideo({
        metadata,
        frames: []
      });
      setStatus("extracting_frames");
      const frames = await extractSourceVideoFrames({
        objectUrl,
        metadata
      });

      if (activeRunId.current !== runId) {
        return;
      }

      setSourceVideo({
        metadata,
        frames
      });
      setStatus("ready_for_analysis");
    } catch (processingError) {
      if (activeRunId.current !== runId) {
        return;
      }

      setStatus("error");
      setError(
        processingError instanceof Error
          ? processingError.message
          : "GhostCrew could not preprocess this video."
      );
    }
  }

  useEffect(() => {
    if (!file || !previewUrl) {
      return;
    }

    void processVideo(file, previewUrl);
  }, [file, previewUrl]);

  const selectedFrames = useMemo(
    () => (sourceVideo ? getSelectedFramesForAnalysis(sourceVideo.frames) : []),
    [sourceVideo]
  );

  return {
    file,
    previewUrl,
    sourceVideo,
    status,
    error,
    selectedFrames,
    selectFile(nextFile: File | null) {
      activeRunId.current += 1;
      setFile(nextFile);
      setSourceVideo(null);
      setStatus(nextFile ? "loading_video" : "idle");
      setError("");
    },
    async reExtractFrames() {
      if (!file || !previewUrl || !sourceVideo?.metadata) {
        return;
      }

      const runId = activeRunId.current + 1;
      activeRunId.current = runId;
      setError("");
      setStatus("extracting_frames");

      try {
        const frames = await extractSourceVideoFrames({
          objectUrl: previewUrl,
          metadata: sourceVideo.metadata
        });

        if (activeRunId.current !== runId) {
          return;
        }

        setSourceVideo({
          metadata: sourceVideo.metadata,
          frames
        });
        setStatus("ready_for_analysis");
      } catch (processingError) {
        if (activeRunId.current !== runId) {
          return;
        }

        setStatus("error");
        setError(
          processingError instanceof Error
            ? processingError.message
            : "Frame extraction failed."
        );
      }
    },
    toggleFrameSelection(frameId: string) {
      setSourceVideo((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          frames: current.frames.map((frame) =>
            frame.id === frameId ? { ...frame, isSelected: !frame.isSelected } : frame
          )
        };
      });
    },
    removeFrame(frameId: string) {
      setSourceVideo((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          frames: current.frames.filter((frame) => frame.id !== frameId)
        };
      });
    }
  };
}
