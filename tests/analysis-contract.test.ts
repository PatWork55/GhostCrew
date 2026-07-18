import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisRequestSchema,
  buildAnalysisRequest
} from "@/lib/analysis-contract";

test("buildAnalysisRequest trims fields and sends only selected frames", () => {
  const request = buildAnalysisRequest({
    taskTitle: "  Assemble a phone stand  ",
    description: "  Show the hinge and final angle.  ",
    language: "  English  ",
    sourceVideo: {
      metadata: {
        fileName: "phone-stand.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 5_200_000,
        durationSeconds: 24.2,
        width: 1920,
        height: 1080,
        aspectRatio: 1.7778,
        aspectRatioLabel: "16:9"
      },
      frames: [
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
          timestampSeconds: 18.6,
          imageDataUrl: "data:image/webp;base64,BBBB",
          mimeType: "image/webp",
          width: 640,
          height: 360,
          byteSize: 31_000,
          isSelected: false
        }
      ]
    }
  });

  assert.equal(request.taskTitle, "Assemble a phone stand");
  assert.equal(request.description, "Show the hinge and final angle.");
  assert.equal(request.language, "English");
  assert.equal(request.selectedFrames.length, 1);
  assert.equal(request.selectedFrames[0]?.id, "frame-1");
});

test("analysisRequestSchema rejects requests without selected frames", () => {
  assert.throws(() =>
    analysisRequestSchema.parse({
      taskTitle: "Assemble a phone stand",
      description: "Context",
      language: "English",
      video: {
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 4_000_000,
        durationSeconds: 20,
        width: 1280,
        height: 720,
        aspectRatio: 1.7778,
        aspectRatioLabel: "16:9"
      },
      selectedFrames: []
    })
  );
});
