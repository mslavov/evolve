import { BaseAgent } from './base.agent.js';

/**
 * Input for prompt research agent
 */
export interface PromptResearchInput {
  currentPrompt: string;
  evaluationScore: number;
  feedback: string;
}

/**
 * Output from prompt research agent
 */
export interface PromptResearchOutput {
  issues: string[];
  rootCauses: string[];
  recommendations: Array<{
    technique: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  implementationStrategy: string;
}

/**
 * AI agent that researches prompt improvement strategies
 */
export class PromptResearchAgent extends BaseAgent<PromptResearchInput, PromptResearchOutput> {
  readonly key = 'prompt_researcher';
  
  /**
   * Research improvement strategies for a prompt
   */
  async execute(input: PromptResearchInput): Promise<PromptResearchOutput> {
    const result = await this.runAgent(input);
    
    // Trust the LLM to return properly formatted JSON
    return typeof result === 'string' ? JSON.parse(result) : result;
  }
  
  /**
   * Alias for execute to maintain backward compatibility
   */
  async research(input: PromptResearchInput): Promise<PromptResearchOutput> {
    return this.execute(input);
  }
}