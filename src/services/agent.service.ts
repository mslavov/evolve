import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { PromptService } from './prompt.service.js';
import { scoringSchema } from '../types/index.js';
import { providerFactory, type LLMProvider, type LLMMessage } from '../providers/index.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import type { Prompt } from '../db/schema/prompts.js';

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
  private currentAgent: Agent | null = null;
  private currentPrompt: Prompt | null = null;
  private provider: LLMProvider | null = null;
  private initialized: Promise<void> | null = null;
  
  constructor(db: Database) {
    this.runRepo = new RunRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.promptService = new PromptService(db);
  }
  
  /**
   * Ensure the service is initialized (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.doInitialize();
    }
    await this.initialized;
  }
  
  /**
   * Perform actual initialization
   */
  private async doInitialize(): Promise<void> {
    // Try to load default agent first
    this.currentAgent = await this.agentRepo.findDefault();
    
    if (!this.currentAgent) {
      // Try to find any active user agent (not system)
      const agents = await this.agentRepo.findMany({ 
        isActive: true, 
        isSystemAgent: false 
      });
      if (agents.length > 0) {
        this.currentAgent = agents[0];
      }
    }
    
    // Load the prompt if we have an agent
    if (this.currentAgent) {
      this.currentPrompt = await this.promptService.getPrompt(this.currentAgent.promptId);
      // Initialize provider based on model
      this.provider = providerFactory.createProvider(this.currentAgent.model);
    }
  }
  
  /**
   * Run the agent with given input
   */
  async run(
    input: string | Record<string, any>,
    options?: RunOptions
  ): Promise<RunResult> {
    // Ensure we're initialized
    await this.ensureInitialized();
    
    // Determine which agent to use
    const agentKey = options?.agentKey;
    
    // Load specific agent if requested
    if (agentKey) {
      const agent = await this.agentRepo.findByKey(agentKey);
      if (!agent) {
        throw new Error(`Agent '${agentKey}' not found`);
      }
      this.currentAgent = agent;
      this.currentPrompt = await this.promptService.getPrompt(agent.promptId);
      this.provider = providerFactory.createProvider(agent.model);
    }
    
    if (!this.provider || !this.currentAgent || !this.currentPrompt) {
      throw new Error('No agent available. Please create an agent first using: pnpm cli agent set <key>');
    }
    
    // Format input
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    
    // Apply prompt template
    const promptText = this.currentPrompt.template.replace('{{input}}', inputStr);
    
    // Build messages for LLM
    const messages: LLMMessage[] = [];
    
    // Add system message with schema if structured output is expected
    if (this.currentAgent.outputType === 'structured' && this.currentAgent.outputSchema) {
      messages.push({
        role: 'system',
        content: `You must respond with valid JSON that matches this schema:\n${JSON.stringify(this.currentAgent.outputSchema, null, 2)}\n\nDo not include any text before or after the JSON.`,
      });
    }
    
    messages.push({
      role: 'user',
      content: promptText,
    });
    
    // Run the LLM
    const startTime = Date.now();
    const result = await this.provider.generateText(messages, {
      temperature: this.currentAgent.temperature,
      maxTokens: this.currentAgent.maxTokens || undefined,
    });
    const executionTime = Date.now() - startTime;
    
    // Parse output based on output type
    let parsedOutput: any;
    if (this.currentAgent.outputType === 'structured') {
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
      agentId: this.currentAgent.id,
      parentRunId: options?.parentRunId,
      input: inputStr,
      output: parsedOutput,
      rawOutput: result.content,
      configSnapshot: {
        model: this.currentAgent.model,
        temperature: this.currentAgent.temperature,
        maxTokens: this.currentAgent.maxTokens,
        promptVersion: this.currentPrompt.version,
      },
      executionTimeMs: executionTime,
      tokenCount: result.usage?.totalTokens,
      modelUsed: this.currentAgent.model,
      temperatureUsed: this.currentAgent.temperature,
      metadata: {
        provider: this.provider.name,
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
      isDefault: options?.isDefault ?? false,
      isSystemAgent: false,
    });
  }
  
  /**
   * Load a specific agent
   */
  async loadAgent(key: string): Promise<void> {
    await this.ensureInitialized();
    const agent = await this.agentRepo.findByKey(key);
    
    if (!agent) {
      throw new Error(`Agent '${key}' not found`);
    }
    
    this.currentAgent = agent;
    this.currentPrompt = await this.promptService.getPrompt(agent.promptId);
    this.provider = providerFactory.createProvider(agent.model);
  }
  
  /**
   * Get current agent
   */
  async getCurrentAgent(): Promise<Agent | null> {
    await this.ensureInitialized();
    return this.currentAgent;
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
   * Set an agent as default
   */
  async setDefaultAgent(key: string): Promise<Agent> {
    await this.ensureInitialized();
    const agent = await this.agentRepo.findByKey(key);
    if (!agent) {
      throw new Error(`Agent '${key}' not found`);
    }
    
    // Use repository method to set default
    await this.agentRepo.setDefault(key);
    
    // Return the updated agent
    const updated = await this.agentRepo.findByKey(key);
    return updated!;
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