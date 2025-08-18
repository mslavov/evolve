import { Database } from '../../db/client.js';
import { AgentService } from '../agent.service.js';

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
export class PromptEngineerAgent {
  private agentService: AgentService;
  private readonly AGENT_KEY = 'prompt_engineer';
  
  constructor(db: Database) {
    this.agentService = new AgentService(db);
  }
  
  /**
   * Engineer an improved prompt
   */
  async improvePrompt(input: PromptEngineeringInput): Promise<PromptEngineeringOutput> {
    const result = await this.agentService.run(
      JSON.stringify(input, null, 2),
      { agentKey: this.AGENT_KEY }
    );
    
    // Trust the LLM to return properly formatted JSON
    return JSON.parse(result.output);
  }
}