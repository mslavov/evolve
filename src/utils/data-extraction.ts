import { z } from 'zod';
import type { Run } from '../db/schema/runs.js';
import type { Assessment } from '../db/schema/assessments.js';

/**
 * Schema for run output that may contain a score
 */
export const RunOutputSchema = z.object({
  score: z.number().optional(),
  result: z.any().optional(),
  metadata: z.record(z.any()).optional(),
}).passthrough();

export type RunOutput = z.infer<typeof RunOutputSchema>;

/**
 * Schema for dataset metadata
 */
export const DatasetMetadataSchema = z.object({
  source: z.enum(['assessment', 'human', 'consensus', 'synthetic']).optional(),
  quality: z.enum(['high', 'medium', 'low']).optional(),
  split: z.enum(['train', 'validation', 'test']).optional(),
  version: z.string().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  agentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type DatasetMetadata = z.infer<typeof DatasetMetadataSchema>;

/**
 * Safely extract score from run output
 */
export function extractScoreFromOutput(output: any): number | undefined {
  try {
    // If output is a string, try to parse it
    if (typeof output === 'string') {
      try {
        output = JSON.parse(output);
      } catch {
        // Not JSON, return undefined
        return undefined;
      }
    }
    
    // Validate with schema
    const parsed = RunOutputSchema.safeParse(output);
    if (parsed.success) {
      return parsed.data.score;
    }
    
    // Fallback: check for common score field names
    if (typeof output === 'object' && output !== null) {
      // Check various common field names
      const scoreFields = ['score', 'rating', 'confidence', 'value', 'result'];
      for (const field of scoreFields) {
        if (field in output && typeof output[field] === 'number') {
          return output[field];
        }
      }
    }
    
    return undefined;
  } catch (error) {
    console.error('Error extracting score from output:', error);
    return undefined;
  }
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T = any>(
  json: string | any,
  fallback: T | null = null
): T | null {
  if (typeof json !== 'string') {
    return json as T;
  }
  
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Format output for dataset storage
 */
export function formatOutputForDataset(output: any): string {
  if (typeof output === 'string') {
    return output;
  }
  
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/**
 * Determine expected output from run data
 */
export function determineExpectedOutput(run: Run): string {
  // If there's an explicit expected output, use it
  if (run.expectedOutput) {
    return formatOutputForDataset(run.expectedOutput);
  }
  
  // Otherwise, use the actual output as expected (for successful runs)
  return formatOutputForDataset(run.output);
}

/**
 * Generate a unique dataset version string
 */
export function generateDatasetVersion(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  
  if (prefix) {
    return `${prefix}-${timestamp}-${random}`;
  }
  
  return `v${timestamp}-${random}`;
}

/**
 * Determine dataset split based on configured ratios
 */
export function determineDatasetSplit(ratios: {
  train?: number;
  validation?: number;
  test?: number;
} | {
  train: number;
  validation: number;
  test: number;
}): 'train' | 'validation' | 'test' {
  const rand = Math.random();
  const trainThreshold = ratios.train || 0.7;
  const validationThreshold = trainThreshold + (ratios.validation || 0.15);
  
  if (rand < trainThreshold) {
    return 'train';
  } else if (rand < validationThreshold) {
    return 'validation';
  } else {
    return 'test';
  }
}

/**
 * Determine quality level based on confidence score
 */
export function determineQuality(
  confidence: number | undefined,
  thresholds: { high?: number; medium?: number } | { high: number; medium: number }
): 'high' | 'medium' | 'low' {
  if (!confidence) {
    return 'medium';
  }
  
  const highThreshold = thresholds.high || 0.9;
  const mediumThreshold = thresholds.medium || 0.7;
  
  if (confidence >= highThreshold) {
    return 'high';
  } else if (confidence >= mediumThreshold) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Validate and clean dataset metadata
 */
export function validateDatasetMetadata(metadata: any): DatasetMetadata {
  const result = DatasetMetadataSchema.safeParse(metadata);
  
  if (result.success) {
    return result.data;
  }
  
  // Return empty object if validation fails
  console.warn('Invalid dataset metadata:', result.error);
  return {};
}

/**
 * Generate tags for a dataset record
 */
export function generateDatasetTags(
  run: Run,
  assessment: Assessment
): string[] {
  const tags: string[] = [];
  
  // Add model tag if available
  if (run.modelUsed) {
    tags.push(`model:${run.modelUsed}`);
  }
  
  // Add verdict tag
  tags.push(`verdict:${assessment.verdict}`);
  
  // Add assessor tag
  tags.push(`assessor:${assessment.assessedBy}`);
  
  // Add run type tag
  if (run.runType) {
    tags.push(`type:${run.runType}`);
  }
  
  // Add score range tag (extract from expectedOutput if available)
  let score: number | undefined;
  if (assessment.expectedOutput) {
    try {
      const expected = typeof assessment.expectedOutput === 'string' 
        ? JSON.parse(assessment.expectedOutput) 
        : assessment.expectedOutput;
      score = typeof expected === 'number' ? expected : expected?.score;
    } catch {
      // Fallback to extracting from run output
      score = extractScoreFromOutput(run.output);
    }
  } else {
    score = extractScoreFromOutput(run.output);
  }
  
  if (score !== undefined) {
    if (score >= 0.8) {
      tags.push('high-score');
    } else if (score >= 0.5) {
      tags.push('medium-score');
    } else {
      tags.push('low-score');
    }
  }
  
  // Add any existing tags from run metadata
  if (run.tags && Array.isArray(run.tags)) {
    tags.push(...run.tags);
  }
  
  // Remove duplicates
  return [...new Set(tags)];
}