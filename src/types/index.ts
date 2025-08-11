import { z } from 'zod';

// Scoring schema for structured output
export const scoringSchema = z.object({
  score: z.number().min(0).max(1).describe("Usefulness score from 0 to 1"),
  reasoning: z.string().describe("Brief explanation of the score"),
  dimensions: z.object({
    relevance: z.number().min(0).max(1).optional(),
    accuracy: z.number().min(0).max(1).optional(),
    completeness: z.number().min(0).max(1).optional(),
    clarity: z.number().min(0).max(1).optional(),
    actionability: z.number().min(0).max(1).optional()
  }).optional()
});