import { NextResponse } from "next/server";
import { SUPPORTED_VIDEO_TYPES, VIDEO_DURATION_RANGE } from "@/lib/constants";
import { analysisRequestSchema } from "@/lib/analysis-contract";
import { generateDemoAnalysis } from "@/lib/demo-analysis";
import { tutorialAnalysisSchema } from "@/lib/tutorial-schema";

export async function POST(request: Request) {
  try {
    const payload = analysisRequestSchema.parse(await request.json());
    const { durationSeconds, mimeType } = payload.video;

    if (
      !SUPPORTED_VIDEO_TYPES.includes(
        mimeType as (typeof SUPPORTED_VIDEO_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        { error: "Only MP4 and WebM videos are supported in this MVP." },
        { status: 400 }
      );
    }

    if (
      durationSeconds < VIDEO_DURATION_RANGE.minSeconds ||
      durationSeconds > VIDEO_DURATION_RANGE.maxSeconds
    ) {
      return NextResponse.json(
        {
          error: `Video duration must be between ${VIDEO_DURATION_RANGE.minSeconds} and ${VIDEO_DURATION_RANGE.maxSeconds} seconds.`
        },
        { status: 400 }
      );
    }

    const analysis = tutorialAnalysisSchema.parse(generateDemoAnalysis(payload));

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Analysis request failed", error);

    return NextResponse.json(
      {
        error: "GhostCrew could not analyze this clip. Check the task title, file format, and duration, then try again."
      },
      { status: 400 }
    );
  }
}
