import "server-only";
import { z } from "zod";

const envSchema = z.object({
  FAL_KEY: z.string().trim().optional(),
  FAL_VISION_ENDPOINT_ID: z.string().trim().default("openrouter/router/vision"),
  FAL_VISION_MODEL: z.string().trim().default("google/gemini-2.5-flash"),
  FAL_IMAGE_EDIT_ENDPOINT_ID: z.string().trim().default("fal-ai/nano-banana-2/edit"),
  FAL_IMAGE_EDIT_MODEL: z.string().trim().default("fal-ai/nano-banana-2/edit"),
  DEMO_FALLBACK_ENABLED: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("true"),
  NEXT_PUBLIC_GENERATED_INSERT_MAX_PER_TUTORIAL: z.enum(["1", "2"]).default("1")
});

const parsed = envSchema.parse({
  FAL_KEY: process.env.FAL_KEY,
  FAL_VISION_ENDPOINT_ID: process.env.FAL_VISION_ENDPOINT_ID,
  FAL_VISION_MODEL: process.env.FAL_VISION_MODEL,
  FAL_IMAGE_EDIT_ENDPOINT_ID: process.env.FAL_IMAGE_EDIT_ENDPOINT_ID,
  FAL_IMAGE_EDIT_MODEL: process.env.FAL_IMAGE_EDIT_MODEL,
  DEMO_FALLBACK_ENABLED: process.env.DEMO_FALLBACK_ENABLED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_GENERATED_INSERT_MAX_PER_TUTORIAL:
    process.env.NEXT_PUBLIC_GENERATED_INSERT_MAX_PER_TUTORIAL
});

export const serverEnv = {
  falKey: parsed.FAL_KEY,
  falVisionEndpointId: parsed.FAL_VISION_ENDPOINT_ID,
  falVisionModel: parsed.FAL_VISION_MODEL,
  falImageEditEndpointId: parsed.FAL_IMAGE_EDIT_ENDPOINT_ID,
  falImageEditModel: parsed.FAL_IMAGE_EDIT_MODEL,
  appUrl: parsed.NEXT_PUBLIC_APP_URL,
  demoMode: parsed.NEXT_PUBLIC_DEMO_MODE === "true",
  generatedInsertMaxPerTutorial: Number(parsed.NEXT_PUBLIC_GENERATED_INSERT_MAX_PER_TUTORIAL),
  demoFallbackEnabled:
    (parsed.DEMO_FALLBACK_ENABLED ?? parsed.NEXT_PUBLIC_DEMO_MODE) === "true"
} as const;
