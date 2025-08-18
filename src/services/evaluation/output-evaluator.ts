import type { Agent } from '../../db/schema/agents.js';
import { Database } from '../../db/client.js';
import { LLMJudgeAgent } from '../../agents/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('OutputEvaluator') as any;

export interface OutputComparison {
  similarity: number; // 0-1 normalized score
  reasoning?: string; // For LLM judge explanations
}

export class OutputEvaluator {
  private llmJudgeAgent: LLMJudgeAgent;
  
  constructor(db: Database) {
    this.llmJudgeAgent = new LLMJudgeAgent(db);
  }
  
  /**
   * Compare actual output with expected output
   * @param actual The actual output from the agent
   * @param expected The expected output
   * @param outputType The inferred output type ('number' or 'other')
   * @returns Normalized similarity score (0-1) and optional reasoning
   */
  async compare(
    actual: any, 
    expected: any, 
    outputType: 'number' | 'other'
  ): Promise<OutputComparison> {
    logger.debug('🔬 Starting output comparison', {
      outputType,
      actualType: typeof actual,
      expectedType: typeof expected,
      actualValue: actual,
      expectedValue: expected,
    });
    
    if (outputType === 'number') {
      return this.compareNumeric(actual, expected);
    }
    return this.compareWithLLMJudge(actual, expected);
  }
  
  /**
   * Compare numeric outputs
   * @param actual The actual numeric output
   * @param expected The expected numeric output
   * @returns Similarity score based on normalized difference
   */
  private compareNumeric(actual: any, expected: any): OutputComparison {
    // Handle various numeric representations
    const actualNum = this.parseNumber(actual);
    const expectedNum = this.parseNumber(expected);
    
    logger.debug('🔢 NUMERIC COMPARISON', {
      actualNumber: actualNum,
      expectedNumber: expectedNum,
      actualRaw: actual,
      expectedRaw: expected,
      isExactMatch: actualNum === expectedNum,
    });
    
    if (isNaN(actualNum) || isNaN(expectedNum)) {
      logger.warn('Failed to parse numeric values', {
        actualNum,
        expectedNum,
        actual,
        expected,
      });
      return { similarity: 0, reasoning: 'One or both values could not be parsed as numbers' };
    }
    
    // Handle exact match
    if (actualNum === expectedNum) {
      return { similarity: 1.0 };
    }
    
    // Calculate normalized difference
    // Use relative difference for non-zero values
    const maxAbsValue = Math.max(Math.abs(actualNum), Math.abs(expectedNum));
    
    if (maxAbsValue === 0) {
      // Both are zero (handled above) or very close to zero
      return { similarity: 1.0 };
    }
    
    const diff = Math.abs(actualNum - expectedNum);
    const relativeDiff = diff / maxAbsValue;
    
    // Convert to similarity score (0-1)
    // Use exponential decay for smoother scoring
    const similarity = Math.exp(-2 * relativeDiff);
    
    const result = { 
      similarity: Math.max(0, Math.min(1, similarity))
    };
    
    logger.debug('📊 NUMERIC COMPARISON RESULT', {
      actualNum,
      expectedNum,
      absoluteDiff: diff,
      relativeDiff: relativeDiff.toFixed(4),
      similarity: result.similarity.toFixed(4),
      grade: result.similarity >= 0.9 ? '🏆 EXCELLENT' : result.similarity >= 0.7 ? '✅ GOOD' : result.similarity >= 0.5 ? '⚠️ FAIR' : '❌ POOR',
    });
    
    return result;
  }
  
  /**
   * Parse a value as a number, handling various formats
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    
    if (typeof value === 'object' && value !== null) {
      // Try to extract a numeric value from an object
      if ('score' in value) return this.parseNumber(value.score);
      if ('value' in value) return this.parseNumber(value.value);
      if ('result' in value) return this.parseNumber(value.result);
    }
    
    return NaN;
  }
  
  /**
   * Compare outputs using LLM judge
   * @param actual The actual output
   * @param expected The expected output
   * @returns Similarity score and reasoning from LLM
   */
  private async compareWithLLMJudge(actual: any, expected: any): Promise<OutputComparison> {
    logger.debug('🤖 USING LLM JUDGE FOR COMPARISON');
    
    try {
      logger.debug('📨 LLM JUDGE INPUT', {
        actual,
        expected,
      });
      
      // Use LLM Judge agent
      const result = await this.llmJudgeAgent.execute({
        actual,
        expected
      });
      
      // Ensure similarity is in valid range
      if (!isNaN(result.similarity) && result.similarity >= 0 && result.similarity <= 1) {
        logger.debug('✅ LLM JUDGE RESULT', {
          similarity: result.similarity.toFixed(4),
          reasoning: result.reasoning || 'No reasoning provided',
          grade: result.similarity >= 0.9 ? '🏆 EXCELLENT' : result.similarity >= 0.7 ? '✅ GOOD' : result.similarity >= 0.5 ? '⚠️ FAIR' : '❌ POOR',
        });
        return { similarity: result.similarity, reasoning: result.reasoning };
      }
      
      // Fallback if LLM judge output is invalid
      logger.warn('⚠️ INVALID LLM JUDGE OUTPUT', {
        output: result,
        expected: 'Object with similarity (0-1) and reasoning fields',
      });
      return { 
        similarity: 0, 
        reasoning: 'LLM judge returned invalid output format' 
      };
      
    } catch (error) {
      logger.error('❌ ERROR IN LLM JUDGE EVALUATION', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        actual,
        expected,
      });
      // Fallback to simple equality check
      const similarity = JSON.stringify(actual) === JSON.stringify(expected) ? 1.0 : 0.0;
      logger.debug('🔄 USING EQUALITY CHECK FALLBACK', { 
        similarity,
        isExactMatch: similarity === 1.0,
      });
      return { 
        similarity, 
        reasoning: 'LLM judge failed, used equality check fallback' 
      };
    }
  }
  
  /**
   * Infer output type from agent's output schema
   * @param agent The agent to check
   * @returns 'number' if the schema indicates numeric output, 'other' otherwise
   */
  static inferOutputType(agent: Partial<Agent>): 'number' | 'other' {
    if (!agent.outputSchema) {
      return 'other';
    }
    
    try {
      const schema = typeof agent.outputSchema === 'string' 
        ? JSON.parse(agent.outputSchema)
        : agent.outputSchema;
      
      // Check if the root type is numeric
      if (schema.type === 'number' || schema.type === 'integer') {
        return 'number';
      }
      
      // Check if it's an object with a single numeric property (common pattern)
      if (schema.type === 'object' && schema.properties) {
        const props = Object.keys(schema.properties);
        if (props.length === 1) {
          const prop = schema.properties[props[0]];
          if (prop.type === 'number' || prop.type === 'integer') {
            return 'number';
          }
        }
        
        // Check specifically for 'score' property
        if (schema.properties.score && 
            (schema.properties.score.type === 'number' || 
             schema.properties.score.type === 'integer')) {
          return 'number';
        }
      }
      
      return 'other';
    } catch {
      return 'other';
    }
  }
}