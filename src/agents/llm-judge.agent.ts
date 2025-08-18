import { BaseAgent } from './base.agent.js';

/**
 * Input for LLM judge agent
 */
export interface LLMJudgeInput {
  actual: any;
  expected: any;
}

/**
 * Output from LLM judge agent
 */
export interface LLMJudgeOutput {
  similarity: number;
  reasoning: string;
}

/**
 * AI agent that judges similarity between outputs
 */
export class LLMJudgeAgent extends BaseAgent<LLMJudgeInput, LLMJudgeOutput> {
  readonly key = 'system_llm_judge';
  
  /**
   * Judge similarity between actual and expected outputs
   */
  async execute(input: LLMJudgeInput): Promise<LLMJudgeOutput> {
    const result = await this.runAgent(input);
    
    // Parse the result if it's a string
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        // Fallback if parsing fails
        return {
          similarity: 0,
          reasoning: 'Failed to parse LLM judge output'
        };
      }
    }
    
    // Ensure the output has the correct structure
    if (result && typeof result === 'object' && 'similarity' in result) {
      return {
        similarity: Number(result.similarity),
        reasoning: result.reasoning || 'No reasoning provided'
      };
    }
    
    // Fallback for invalid output
    return {
      similarity: 0,
      reasoning: 'Invalid output format from LLM judge'
    };
  }
}