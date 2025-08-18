import { Database } from '../db/client.js';
import { AgentService } from '../services/agent.service.js';

/**
 * Base abstract class for all AI agents in the system
 * Provides a consistent interface for agent execution
 */
export abstract class BaseAgent<TInput = any, TOutput = any> {
  protected agentService: AgentService;
  
  /**
   * Unique key identifying this agent in the database
   */
  abstract readonly key: string;
  
  constructor(protected db: Database) {
    this.agentService = new AgentService(db);
  }
  
  /**
   * Execute the agent with the given input
   * @param input The typed input for this agent
   * @returns Promise resolving to the typed output
   */
  abstract execute(input: TInput): Promise<TOutput>;
  
  /**
   * Helper method to run the agent via AgentService
   * @param input The input to send to the agent
   * @returns The parsed output from the agent
   */
  protected async runAgent(input: any): Promise<any> {
    const result = await this.agentService.run(
      typeof input === 'string' ? input : JSON.stringify(input, null, 2),
      { agentKey: this.key }
    );
    
    return result.output;
  }
}