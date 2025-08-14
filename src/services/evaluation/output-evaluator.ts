import type { AgentService } from '../agent.service.js';
import type { Agent } from '../../db/schema/agents.js';

export interface OutputComparison {
  similarity: number; // 0-1 normalized score
  reasoning?: string; // For LLM judge explanations
}

export class OutputEvaluator {
  constructor(
    private agentService: AgentService,
    private llmJudgeKey: string = 'system_llm_judge'
  ) {}
  
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
    
    if (isNaN(actualNum) || isNaN(expectedNum)) {
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
    
    return { 
      similarity: Math.max(0, Math.min(1, similarity))
    };
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
    try {
      // Prepare input for LLM judge
      const input = JSON.stringify({ 
        actual: actual, 
        expected: expected 
      });
      
      // Use system agent with DB-stored prompt
      const result = await this.agentService.run(
        input,
        { agentKey: this.llmJudgeKey }
      );
      
      // Extract similarity and reasoning from the output
      if (result.output && typeof result.output === 'object') {
        const similarity = Number(result.output.similarity);
        const reasoning = result.output.reasoning || undefined;
        
        // Ensure similarity is in valid range
        if (!isNaN(similarity) && similarity >= 0 && similarity <= 1) {
          return { similarity, reasoning };
        }
      }
      
      // Fallback if LLM judge output is invalid
      console.warn('Invalid LLM judge output:', result.output);
      return { 
        similarity: 0, 
        reasoning: 'LLM judge returned invalid output format' 
      };
      
    } catch (error) {
      console.error('Error in LLM judge evaluation:', error);
      // Fallback to simple equality check
      const similarity = JSON.stringify(actual) === JSON.stringify(expected) ? 1.0 : 0.0;
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