import { Database } from '../../db/client.js';
import { AgentService } from '../agent.service.js';

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
export class PromptResearchAgent {
  private agentService: AgentService;
  private readonly AGENT_KEY = 'prompt_researcher';
  
  constructor(db: Database) {
    this.agentService = new AgentService(db);
  }
  
  /**
   * Research improvement strategies for a prompt
   */
  async research(input: PromptResearchInput): Promise<PromptResearchOutput> {
    const result = await this.agentService.run(
      JSON.stringify(input, null, 2),
      { agentKey: this.AGENT_KEY }
    );
    
    // Trust the LLM to return properly formatted JSON
    return JSON.parse(result.output);
  }
}