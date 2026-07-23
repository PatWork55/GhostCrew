import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/production-plan": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*"
    ],
    "/api/export": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*"
    ],
    "/api/exports/[exportId]": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*"
    ],
    "/api/exports/[exportId]/report": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*"
    ]
  }
};

export default nextConfig;
