import "server-only";
import { z } from "zod";
import { GENERATED_INSERT_LIMITS } from "@/lib/constants";

const envSchema = z.object({
  FAL_KEY: z.string().trim().optional(),
  FAL_VISION_ENDPOINT_ID: z.string().trim().default("openrouter/router/vision"),
  FAL_VISION_MODEL: z.string().trim().default("google/gemini-2.5-flash"),
  FAL_IMAGE_EDIT_ENDPOINT_ID: z.string().trim().default("fal-ai/nano-banana-2/edit"),
  FAL_IMAGE_EDIT_MODEL: z.string().trim().default("fal-ai/nano-banana-2/edit"),
  ANALYSIS_FALLBACK_ENABLED: z.enum(["true", "false"]).optional(),
  GENERATED_INSERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  GENERATED_INSERT_MAX_PER_TUTORIAL: z.enum(["1", "2"]).default("1"),
  GENERATION_RATE_LIMIT_PER_HOUR: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(GENERATED_INSERT_LIMITS.defaultRateLimitPerHour),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("true"),
  DEMO_FALLBACK_ENABLED: z.enum(["true", "false"]).optional()
});

const parsed = envSchema.parse({
  FAL_KEY: process.env.FAL_KEY,
  FAL_VISION_ENDPOINT_ID: process.env.FAL_VISION_ENDPOINT_ID,
  FAL_VISION_MODEL: process.env.FAL_VISION_MODEL,
  FAL_IMAGE_EDIT_ENDPOINT_ID: process.env.FAL_IMAGE_EDIT_ENDPOINT_ID,
  FAL_IMAGE_EDIT_MODEL: process.env.FAL_IMAGE_EDIT_MODEL,
  ANALYSIS_FALLBACK_ENABLED: process.env.ANALYSIS_FALLBACK_ENABLED,
  GENERATED_INSERTS_ENABLED: process.env.GENERATED_INSERTS_ENABLED,
  GENERATED_INSERT_MAX_PER_TUTORIAL: process.env.GENERATED_INSERT_MAX_PER_TUTORIAL,
  GENERATION_RATE_LIMIT_PER_HOUR: process.env.GENERATION_RATE_LIMIT_PER_HOUR,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  DEMO_FALLBACK_ENABLED: process.env.DEMO_FALLBACK_ENABLED
});

export const serverEnv = {
  falKey: parsed.FAL_KEY,
  falVisionEndpointId: parsed.FAL_VISION_ENDPOINT_ID,
  falVisionModel: parsed.FAL_VISION_MODEL,
  falImageEditEndpointId: parsed.FAL_IMAGE_EDIT_ENDPOINT_ID,
  falImageEditModel: parsed.FAL_IMAGE_EDIT_MODEL,
  demoMode: parsed.NEXT_PUBLIC_DEMO_MODE === "true",
  analysisFallbackEnabled:
    (parsed.ANALYSIS_FALLBACK_ENABLED ??
      parsed.DEMO_FALLBACK_ENABLED ??
      parsed.NEXT_PUBLIC_DEMO_MODE) === "true",
  generatedInsertsEnabled: parsed.GENERATED_INSERTS_ENABLED === "true",
  generatedInsertMaxPerTutorial: Number(parsed.GENERATED_INSERT_MAX_PER_TUTORIAL),
  generationRateLimitPerHour: parsed.GENERATION_RATE_LIMIT_PER_HOUR
} as const;
