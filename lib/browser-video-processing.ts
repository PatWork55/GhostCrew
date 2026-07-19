import { FRAME_EXTRACTION_LIMITS } from "@/lib/constants";
import {
  generateFrameCaptureTimestamps,
  normalizeSourceVideoMetadata,
  type SourceVideoFrame,
  type SourceVideoMetadata
} from "@/lib/source-video";

type VideoFileInput = {
  file: File;
  objectUrl: string;
};

function disposeVideoElement(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function createVideoElement(objectUrl: string) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  return video;
}

async function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata"
) {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("The uploaded video could not be decoded by this browser."));
    };

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.load();
  });
}

function getScaledDimensions(width: number, height: number) {
  const longestSide = Math.max(width, height);

  if (longestSide <= FRAME_EXTRACTION_LIMITS.maxDimension) {
    return { width, height };
  }

  const scale = FRAME_EXTRACTION_LIMITS.maxDimension / longestSide;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: "image/webp" | "image/jpeg") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Canvas export failed for ${mimeType}.`));
          return;
        }

        resolve(blob);
      },
      mimeType,
      FRAME_EXTRACTION_LIMITS.quality
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Extracted frame could not be serialized."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Extracted frame could not be read back into memory."));
    };

    reader.readAsDataURL(blob);
  });
}

async function waitForRenderedSeek(video: HTMLVideoElement, timestampSeconds: number) {
  if (Math.abs(video.currentTime - timestampSeconds) < 0.01) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const handleSeeked = () => {
      cleanup();
      requestAnimationFrame(() => resolve());
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Seeking failed near ${timestampSeconds.toFixed(2)} seconds.`));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = timestampSeconds;
  });
}

async function exportCanvasFrame(canvas: HTMLCanvasElement) {
  try {
    const webpBlob = await canvasToBlob(canvas, "image/webp");

    return {
      blob: webpBlob,
      mimeType: "image/webp" as const
    };
  } catch {
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg");

    return {
      blob: jpegBlob,
      mimeType: "image/jpeg" as const
    };
  }
}

async function captureCanvasFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is unavailable in this browser.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);

  const { blob, mimeType } = await exportCanvasFrame(canvas);
  const imageDataUrl = await blobToDataUrl(blob);

  return {
    imageDataUrl,
    mimeType,
    byteSize: blob.size,
    width,
    height
  };
}

export async function readSourceVideoMetadata({
  file,
  objectUrl
}: VideoFileInput): Promise<SourceVideoMetadata> {
  const video = createVideoElement(objectUrl);

  try {
    await waitForVideoEvent(video, "loadedmetadata");

    if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
      throw new Error("Video metadata is incomplete. Try another file or browser.");
    }

    return normalizeSourceVideoMetadata({
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      durationSeconds: video.duration,
      width: video.videoWidth,
      height: video.videoHeight
    });
  } finally {
    disposeVideoElement(video);
  }
}

export async function extractSourceVideoFrames({
  objectUrl,
  metadata
}: {
  objectUrl: string;
  metadata: SourceVideoMetadata;
}): Promise<SourceVideoFrame[]> {
  const video = createVideoElement(objectUrl);
  const canvas = document.createElement("canvas");

  try {
    await waitForVideoEvent(video, "loadeddata");

    const { width, height } = getScaledDimensions(metadata.width, metadata.height);

    const timestamps = generateFrameCaptureTimestamps(metadata.durationSeconds);
    const frames: SourceVideoFrame[] = [];

    for (const [index, targetTimestamp] of timestamps.entries()) {
      await waitForRenderedSeek(video, targetTimestamp);
      const capturedFrame = await captureCanvasFrame(video, canvas, width, height);

      frames.push({
        id: `frame-${index + 1}`,
        timestampSeconds: Number(video.currentTime.toFixed(3)),
        imageDataUrl: capturedFrame.imageDataUrl,
        mimeType: capturedFrame.mimeType,
        width: capturedFrame.width,
        height: capturedFrame.height,
        byteSize: capturedFrame.byteSize,
        isSelected: true
      });
    }

    return frames;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    disposeVideoElement(video);
  }
}

export async function captureSourceVideoFrameAtTimestamp({
  objectUrl,
  metadata,
  timestampSeconds
}: {
  objectUrl: string;
  metadata: SourceVideoMetadata;
  timestampSeconds: number;
}) {
  const video = createVideoElement(objectUrl);
  const canvas = document.createElement("canvas");

  try {
    await waitForVideoEvent(video, "loadeddata");
    await waitForRenderedSeek(video, timestampSeconds);
    const { width, height } = getScaledDimensions(metadata.width, metadata.height);

    return {
      timestampSeconds: Number(video.currentTime.toFixed(3)),
      ...(await captureCanvasFrame(video, canvas, width, height))
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    disposeVideoElement(video);
  }
}
