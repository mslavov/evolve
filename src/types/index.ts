import { z } from 'zod';

// Generic response schema - can be used for any type of structured output
export const genericResponseSchema = z.object({
  result: z.any().describe("The main result of the operation"),
  metadata: z.record(z.any()).optional().describe("Additional metadata about the result"),
  confidence: z.number().min(0).max(1).optional().describe("Confidence level of the result"),
});

// Text generation schema
export const textGenerationSchema = z.object({
  text: z.string().describe("Generated text content"),
  tokens: z.number().optional().describe("Number of tokens used"),
});

// Classification schema
export const classificationSchema = z.object({
  category: z.string().describe("Predicted category"),
  confidence: z.number().min(0).max(1).describe("Confidence score"),
  probabilities: z.record(z.number()).optional().describe("Probability distribution across categories"),
});

// Extraction schema
export const extractionSchema = z.object({
  entities: z.array(z.object({
    text: z.string(),
    type: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })).describe("Extracted entities"),
  relationships: z.array(z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
  })).optional().describe("Extracted relationships"),
});

// Scoring schema for structured output (kept for backward compatibility)
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

// Evaluator configuration for specifying how to compare outputs
export interface EvaluatorConfig {
  // Primary field to evaluate (e.g., "score", "result.value")
  // Uses simple dot notation for nested fields
  primaryTarget?: string;
  
  // Strategy for comparison
  // - 'numeric': Direct numeric comparison
  // - 'exact': Exact match comparison
  // - 'llm': Use LLM as judge
  // - 'auto': Automatically determine based on type (default)
  strategy?: 'numeric' | 'exact' | 'llm' | 'auto';
  
  // Optional metadata for future extensions
  metadata?: {
    tolerance?: number;  // For numeric comparison (e.g., 0.01 for 1% tolerance)
    rubric?: string;     // Custom rubric for LLM evaluation
  };
}