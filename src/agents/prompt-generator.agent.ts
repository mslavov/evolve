import { BaseAgent } from './base.agent.js';

/**
 * Input for prompt generator agent
 */
export interface PromptGeneratorInput {
  basePrompt: string;
  strategy: string;
  requirements?: string;
}

/**
 * Output from prompt generator agent
 */
export type PromptGeneratorOutput = string;

/**
 * AI agent that generates prompt variations
 */
export class PromptGeneratorAgent extends BaseAgent<PromptGeneratorInput, PromptGeneratorOutput> {
  readonly key = 'prompt_generator';
  
  /**
   * Generate a prompt variation
   */
  async execute(input: PromptGeneratorInput): Promise<PromptGeneratorOutput> {
    // Format the input for the agent
    const agentInput = typeof input === 'string' 
      ? input 
      : `Base Prompt: ${input.basePrompt}\n\nStrategy: ${input.strategy}\n\nRequirements: ${input.requirements || 'None'}`;
    
    const result = await this.runAgent(agentInput);
    
    // Return the generated prompt as a string
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
}