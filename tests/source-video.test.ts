import assert from "node:assert/strict";
import test from "node:test";
import {
  generateFrameCaptureTimestamps,
  getSelectedFramesForAnalysis,
  normalizeSourceVideoMetadata
} from "@/lib/source-video";

test("generateFrameCaptureTimestamps distributes frames across the clip", () => {
  const timestamps = generateFrameCaptureTimestamps(24);

  assert.equal(timestamps.length, 5);
  assert.equal(timestamps[0], 0.35);
  assert.equal(timestamps.at(-1), 23.65);

  for (const [index, timestamp] of timestamps.entries()) {
    if (index === 0) {
      continue;
    }

    assert.ok(timestamp > timestamps[index - 1]);
  }
});

test("normalizeSourceVideoMetadata computes aspect ratio fields", () => {
  const metadata = normalizeSourceVideoMetadata({
    fileName: "demo.mp4",
    mimeType: "video/mp4",
    fileSizeBytes: 4_250_123.4,
    durationSeconds: 12.34567,
    width: 1920,
    height: 1080
  });

  assert.equal(metadata.fileSizeBytes, 4_250_123);
  assert.equal(metadata.durationSeconds, 12.346);
  assert.equal(metadata.aspectRatio, 1.7778);
  assert.equal(metadata.aspectRatioLabel, "16:9");
});

test("getSelectedFramesForAnalysis filters out unselected frames", () => {
  const selectedFrames = getSelectedFramesForAnalysis([
    {
      id: "frame-1",
      timestampSeconds: 0.35,
      imageDataUrl: "data:image/webp;base64,AAAA",
      mimeType: "image/webp",
      width: 640,
      height: 360,
      byteSize: 32_000,
      isSelected: true
    },
    {
      id: "frame-2",
      timestampSeconds: 4.1,
      imageDataUrl: "data:image/webp;base64,BBBB",
      mimeType: "image/webp",
      width: 640,
      height: 360,
      byteSize: 34_000,
      isSelected: false
    }
  ]);

  assert.equal(selectedFrames.length, 1);
  assert.equal(selectedFrames[0]?.id, "frame-1");
  assert.ok(!("isSelected" in selectedFrames[0]!));
});
