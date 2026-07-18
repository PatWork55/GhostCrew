import "server-only";
import { z } from "zod";

const envSchema = z.object({
  FAL_KEY: z.string().trim().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("true")
});

const parsed = envSchema.parse({
  FAL_KEY: process.env.FAL_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE
});

export const serverEnv = {
  falKey: parsed.FAL_KEY,
  appUrl: parsed.NEXT_PUBLIC_APP_URL,
  demoMode: parsed.NEXT_PUBLIC_DEMO_MODE === "true"
} as const;
