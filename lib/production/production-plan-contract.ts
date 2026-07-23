import { z } from "zod";
import { analysisRequestSchema, analysisResponseSchema } from "@/lib/analysis-contract";
import { directVideoUnderstandingSchema } from "@/lib/production/direct-video-understanding";
import { productionPlanSchema } from "@/lib/production/production-plan";

export const productionPlanRequestSchema = analysisRequestSchema;

export const productionPlanResponseSchema = z.object({
  productionPlan: productionPlanSchema,
  storyboard: analysisResponseSchema,
  directVideo: z.object({
    provider: z.enum(["fal", "fallback"]),
    model: z.string().min(1),
    fallbackUsed: z.boolean(),
    warnings: z.array(z.string()),
    understanding: directVideoUnderstandingSchema,
    usage: z
      .object({
        costUsd: z.number().nonnegative().optional(),
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        totalTokens: z.number().int().nonnegative().optional()
      })
      .optional()
  }),
  warnings: z.array(z.string())
});

export type ProductionPlanResponse = z.infer<typeof productionPlanResponseSchema>;
