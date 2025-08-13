import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { PromptService } from './prompt.service.js';
import { providerFactory, type LLMMessage } from '../providers/index.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { Run, NewRun } from '../db/schema/runs.js';

export interface RunOptions {
  agentKey?: string; // Agent to use
  parentRunId?: string; // For tracking agent chains
}

export interface RunResult {
  output: any;
  metadata?: Record<string, any>;
  runId?: string;
}

export class AgentService {
  private runRepo: RunRepository;
  private agentRepo: AgentRepository;
  private promptService: PromptService;
  
  constructor(db: Database) {
    this.runRepo = new RunRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.promptService = new PromptService(db);
  }
  
  /**
   * Run the agent with given input
   */
  async run(
    input: string | Record<string, any>,
    options?: RunOptions
  ): Promise<RunResult> {
    // Agent key is now required
    const agentKey = options?.agentKey;
    if (!agentKey) {
      throw new Error('Agent key is required. Please specify an agent using --agent <key>');
    }
    
    // Load the specified agent
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent '${agentKey}' not found. Use 'pnpm cli agent list' to see available agents`);
    }
    
    const currentPrompt = await this.promptService.getPrompt(agent.promptId);
    const provider = providerFactory.createProvider(agent.model);
    
    if (!provider || !currentPrompt) {
      throw new Error(`Failed to initialize agent '${agentKey}'`);
    }
    
    // Format input
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    
    // Apply prompt template
    const promptText = currentPrompt.template.replace('{{input}}', inputStr);
    
    // Build messages for LLM
    const messages: LLMMessage[] = [];
    
    // Add system message with schema if structured output is expected
    if (agent.outputType === 'structured' && agent.outputSchema) {
      messages.push({
        role: 'system',
        content: `You must respond with valid JSON that matches this schema:\n${JSON.stringify(agent.outputSchema, null, 2)}\n\nDo not include any text before or after the JSON.`,
      });
    }
    
    messages.push({
      role: 'user',
      content: promptText,
    });
    
    // Run the LLM
    const startTime = Date.now();
    const result = await provider.generateText(messages, {
      temperature: agent.temperature,
      maxTokens: agent.maxTokens || undefined,
    });
    const executionTime = Date.now() - startTime;
    
    // Parse output based on output type
    let parsedOutput: any;
    if (agent.outputType === 'structured') {
      try {
        // Try to parse as JSON
        const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/) || 
                         result.content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? 
          (jsonMatch[1] || jsonMatch[0]) : 
          result.content;
        
        parsedOutput = JSON.parse(jsonStr);
        
        // outputSchema is passed to the LLM for structured output
        // No additional validation needed here as the LLM handles it
      } catch (error) {
        console.warn('Failed to parse structured output, using raw output:', error);
        parsedOutput = result.content;
      }
    } else {
      parsedOutput = result.content;
    }
    
    // Save the run
    const runData: NewRun = {
      agentId: agent.id,
      parentRunId: options?.parentRunId,
      input: inputStr,
      output: parsedOutput,
      rawOutput: result.content,
      configSnapshot: {
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        promptVersion: currentPrompt.version,
      },
      executionTimeMs: executionTime,
      tokenCount: result.usage?.totalTokens,
      modelUsed: agent.model,
      temperatureUsed: agent.temperature,
      metadata: {
        provider: provider.name,
      },
    };
    
    const run = await this.runRepo.create(runData);
    
    return {
      output: parsedOutput,
      metadata: {
        runId: run.id,
        executionTime,
        tokenCount: result.usage?.totalTokens,
      },
      runId: run.id,
    };
  }
  
  /**
   * Create or update an agent
   */
  async saveAgent(key: string, agent: Omit<NewAgent, 'key'>): Promise<Agent> {
    const existing = await this.agentRepo.findByKey(key);
    
    if (existing) {
      // Update existing agent
      return await this.agentRepo.update(existing.id, agent);
    }
    
    return await this.agentRepo.create({
      ...agent,
      key,
    });
  }
  
  /**
   * Create an agent with a prompt
   */
  async createAgent(
    key: string,
    name: string,
    promptTemplate: string,
    options?: {
      type?: Agent['type'];
      model?: string;
      temperature?: number;
      maxTokens?: number;
      outputType?: 'structured' | 'text';
      outputSchema?: Record<string, any>;
      description?: string;
      isDefault?: boolean;
    }
  ): Promise<Agent> {
    // Create a prompt for this agent
    const promptVersion = `${key}_prompt_v1`;
    const prompt = await this.promptService.createPrompt({
      version: promptVersion,
      name: `${name} Prompt`,
      template: promptTemplate,
      description: `Prompt for ${name}`,
    });
    
    // Create the agent
    return await this.agentRepo.create({
      key,
      name,
      type: options?.type || 'user',
      model: options?.model || 'gpt-4o-mini',
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
      promptId: prompt.version,
      outputType: options?.outputType || 'structured',
      outputSchema: options?.outputSchema,
      description: options?.description,
      isSystemAgent: false,
    });
  }
  
  
  /**
   * Get pending runs for assessment
   */
  async getPendingRuns(limit?: number): Promise<Run[]> {
    return await this.runRepo.findPending(limit);
  }
  
  /**
   * List all agents
   */
  async listAgents(options?: { includeSystem?: boolean }): Promise<Agent[]> {
    if (options?.includeSystem === false) {
      return await this.agentRepo.findMany({ isSystemAgent: false });
    }
    return await this.agentRepo.findAll();
  }
  
  /**
   * Get a specific agent
   */
  async getAgent(key: string): Promise<Agent | null> {
    return await this.agentRepo.findByKey(key);
  }
  
  
  /**
   * Delete an agent
   */
  async deleteAgent(key: string): Promise<void> {
    const agent = await this.agentRepo.findByKey(key);
    if (!agent) {
      throw new Error(`Agent '${key}' not found`);
    }
    
    if (agent.isSystemAgent) {
      throw new Error('Cannot delete system agents');
    }
    
    await this.agentRepo.deleteByKey(key);
  }
}