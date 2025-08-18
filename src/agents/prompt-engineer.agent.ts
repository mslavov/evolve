import { BaseAgent } from './base.agent.js';

/**
 * Input for prompt engineering agent
 */
export interface PromptEngineeringInput {
  currentPrompt: string;
  evaluationScore: number;
  feedback: string;
  researchFindings: {
    issues: string[];
    recommendations: Array<{
      technique: string;
      rationale: string;
      priority: 'high' | 'medium' | 'low';
    }>;
    implementationStrategy: string;
  };
}

/**
 * Output from prompt engineering agent
 */
export interface PromptEngineeringOutput {
  improvedPrompt: string;
  appliedTechniques: string[];
  changesSummary: string;
  expectedImprovement: number;
}

/**
 * AI agent that engineers improved prompts
 */
export class PromptEngineerAgent extends BaseAgent<PromptEngineeringInput, PromptEngineeringOutput> {
  readonly key = 'prompt_engineer';
  
  /**
   * Engineer an improved prompt
   */
  async execute(input: PromptEngineeringInput): Promise<PromptEngineeringOutput> {
    const result = await this.runAgent(input);
    
    // Trust the LLM to return properly formatted JSON
    return typeof result === 'string' ? JSON.parse(result) : result;
  }
  
  /**
   * Alias for execute to maintain backward compatibility
   */
  async improvePrompt(input: PromptEngineeringInput): Promise<PromptEngineeringOutput> {
    return this.execute(input);
  }
}