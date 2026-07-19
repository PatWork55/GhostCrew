import "server-only";
import { z } from "zod";

const envSchema = z.object({
  FAL_KEY: z.string().trim().optional(),
  FAL_VISION_ENDPOINT_ID: z.string().trim().default("openrouter/router/vision"),
  FAL_VISION_MODEL: z.string().trim().default("google/gemini-2.5-flash"),
  DEMO_FALLBACK_ENABLED: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("true")
});

const parsed = envSchema.parse({
  FAL_KEY: process.env.FAL_KEY,
  FAL_VISION_ENDPOINT_ID: process.env.FAL_VISION_ENDPOINT_ID,
  FAL_VISION_MODEL: process.env.FAL_VISION_MODEL,
  DEMO_FALLBACK_ENABLED: process.env.DEMO_FALLBACK_ENABLED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE
});

export const serverEnv = {
  falKey: parsed.FAL_KEY,
  falVisionEndpointId: parsed.FAL_VISION_ENDPOINT_ID,
  falVisionModel: parsed.FAL_VISION_MODEL,
  appUrl: parsed.NEXT_PUBLIC_APP_URL,
  demoMode: parsed.NEXT_PUBLIC_DEMO_MODE === "true",
  demoFallbackEnabled:
    (parsed.DEMO_FALLBACK_ENABLED ?? parsed.NEXT_PUBLIC_DEMO_MODE) === "true"
} as const;
