import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getTutorialExport } from "@/lib/export/export-registry";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ exportId: string }> }
) {
  const { exportId } = await context.params;
  const exportRecord = getTutorialExport(exportId);

  if (!exportRecord) {
    return NextResponse.json(
      { error: "The requested tutorial export is no longer available in this runtime." },
      { status: 404 }
    );
  }

  const bytes = await readFile(exportRecord.videoPath);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${exportRecord.fileName}"`
    }
  });
}
