import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getProductionAsset } from "@/lib/production/asset-registry";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const params = await context.params;
  const asset = getProductionAsset(params.projectId, params.assetId);

  if (!asset) {
    return NextResponse.json({ error: "Production asset not found." }, { status: 404 });
  }

  const buffer = await readFile(asset.path);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `inline; filename="${asset.fileName}"`
    }
  });
}
