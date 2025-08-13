import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { ConfigRepository } from '../repositories/config.repository.js';
import { PromptService } from './prompt.service.js';
import { scoringSchema } from '../types/index.js';
import { providerFactory, type LLMProvider, type LLMMessage } from '../providers/index.js';
import { schemaRegistry } from './schema-registry.service.js';
import { z } from 'zod';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { Config, NewConfig } from '../db/schema/configs.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import type { Prompt } from '../db/schema/prompts.js';

export interface RunOptions {
  configKey?: string; // Backward compatibility
  agentKey?: string; // New preferred option
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
  private configRepo: ConfigRepository; // Keep for backward compatibility
  private promptService: PromptService;
  private currentAgent: Agent | null = null;
  private currentPrompt: Prompt | null = null;
  private provider: LLMProvider | null = null;
  private initialized: Promise<void> | null = null;
  
  constructor(db: Database) {
    this.runRepo = new RunRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.configRepo = new ConfigRepository(db);
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
      // Try to find any active agent
      const agents = await this.agentRepo.findActive();
      if (agents.length > 0) {
        this.currentAgent = agents[0];
      } else {
        // Fallback: try to migrate from configs if no agents exist
        const defaultConfig = await this.configRepo.findDefault();
        if (defaultConfig) {
          // Create agent from config
          this.currentAgent = await this.agentRepo.create({
            key: defaultConfig.key,
            name: defaultConfig.description || `Agent: ${defaultConfig.key}`,
            type: 'scorer',
            model: defaultConfig.model,
            temperature: defaultConfig.temperature,
            maxTokens: defaultConfig.maxTokens || undefined,
            promptId: defaultConfig.promptId,
            outputType: defaultConfig.outputType || 'structured',
            outputSchema: defaultConfig.outputSchema,
            schemaVersion: defaultConfig.schemaVersion || undefined,
            isDefault: defaultConfig.isDefault,
            isActive: defaultConfig.isActive,
            isSystemAgent: false,
          });
        } else {
          // Create a default scorer agent if nothing exists
          const prodPrompt = await this.promptService.getBestPrompt();
          const promptId = prodPrompt?.id || 'v1';
          
          this.currentAgent = await this.agentRepo.create({
            key: 'default_scorer',
            name: 'Default Scorer Agent',
            type: 'scorer',
            model: 'gpt-4o-mini',
            temperature: 0.3,
            maxTokens: 500,
            promptId: promptId,
            isDefault: true,
            isSystemAgent: false,
          });
        }
      }
    }
    
    // Load the prompt
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
    // Ensure we're initialized (lazy initialization)
    await this.ensureInitialized();
    
    if (!this.provider || !this.currentAgent) {
      throw new Error('Failed to initialize agent service');
    }
    
    // Determine which agent to use
    const agentKey = options?.agentKey || options?.configKey; // Support both for backward compatibility
    
    // Load specific agent if requested
    if (agentKey && agentKey !== this.currentAgent.key) {
      // Try to load as agent first
      let agent = await this.agentRepo.findByKey(agentKey);
      
      // Fallback: try to load as config and convert to agent
      if (!agent) {
        const config = await this.configRepo.findByKey(agentKey);
        if (config) {
          // Create or find agent from config
          agent = await this.agentRepo.findByKey(config.key);
          if (!agent) {
            // Create agent from config on the fly
            agent = await this.agentRepo.create({
              key: config.key,
              name: config.description || `Agent: ${config.key}`,
              type: 'scorer',
              model: config.model,
              temperature: config.temperature,
              maxTokens: config.maxTokens || undefined,
              promptId: config.promptId,
              outputType: config.outputType || 'structured',
              outputSchema: config.outputSchema,
              schemaVersion: config.schemaVersion || undefined,
              isDefault: config.isDefault,
              isActive: config.isActive,
              isSystemAgent: false,
            });
          }
        }
      }
      
      if (agent) {
        this.currentAgent = agent;
        this.currentPrompt = await this.promptService.getPrompt(agent.promptId);
        this.provider = providerFactory.createProvider(agent.model);
      }
    }
    
    const startTime = Date.now();
    
    // Get the prompt
    if (!this.currentPrompt) {
      this.currentPrompt = await this.promptService.getPrompt(this.currentAgent.promptId);
    }
    
    if (!this.currentPrompt) {
      throw new Error('Prompt not found for agent');
    }
    
    // Handle input formatting
    const inputContent = typeof input === 'string' ? input : JSON.stringify(input);
    
    const promptText = this.promptService.formatPrompt(
      this.currentPrompt.template,
      inputContent
    );
    
    // Prepare messages - system prompt comes from the prompt template
    const messages: LLMMessage[] = [];
    
    // Check if prompt template includes a system message directive
    if (this.currentPrompt.metadata?.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.currentPrompt.metadata.systemPrompt as string,
      });
    }
    
    messages.push({
      role: 'user',
      content: promptText,
    });
    
    // Determine the output schema to use
    let outputSchema: z.ZodSchema<any> = scoringSchema; // Default
    let result: any;
    let refusal: string | null | undefined = null;
    
    if (this.currentAgent.outputSchema) {
      // Use custom schema from agent
      try {
        outputSchema = schemaRegistry.createFromJSON(this.currentAgent.outputSchema);
      } catch (error) {
        console.warn('Failed to parse custom schema, falling back to default:', error);
        outputSchema = scoringSchema;
      }
    } else if (this.currentAgent.schemaVersion) {
      // Try to get predefined schema by name/version
      const schemaDef = schemaRegistry.get(this.currentAgent.schemaVersion);
      if (schemaDef) {
        outputSchema = schemaDef.schema;
      }
    }
    
    // Call provider based on output type
    if (this.currentAgent.outputType === 'text') {
      // Use text generation for unstructured output
      const response = await this.provider.generateText(
        messages,
        {
          model: this.currentAgent.model,
          temperature: this.currentAgent.temperature,
          maxTokens: this.currentAgent.maxTokens || 500,
        }
      );
      
      refusal = response.refusal;
      result = response.content;
    } else {
      // Use structured generation (default)
      const response = await this.provider.generateStructured(
        messages,
        outputSchema,
        {
          model: this.currentAgent.model,
          temperature: this.currentAgent.temperature,
          maxTokens: this.currentAgent.maxTokens || 500,
        }
      );
      
      refusal = response.refusal;
      result = response.content;
    }
    
    const endTime = Date.now();
    
    // Handle refusal
    if (refusal) {
      throw new Error(`Model refused to process input: ${refusal}`);
    }
    
    // Record the run
    const runData: NewRun = {
      inputContent: inputContent,
      inputLength: inputContent.length,
      inputType: this.detectContentType(inputContent),
      outputScore: typeof result === 'object' && result.score !== undefined ? result.score : 0,
      outputReasoning: typeof result === 'object' ? JSON.stringify(result) : String(result),
      outputDimensions: typeof result === 'object' ? result.dimensions || result.metadata : undefined,
      agentId: this.currentAgent.id,
      parentRunId: options?.parentRunId || undefined,
      configModel: this.currentAgent.model,
      configTemperature: this.currentAgent.temperature,
      configPromptVersion: this.currentPrompt!.version,
      configMaxTokens: this.currentAgent.maxTokens || undefined,
      telemetryDuration: endTime - startTime,
      assessmentStatus: 'skipped',
    };
    
    const run = await this.runRepo.create(runData);
    
    return {
      output: result,
      metadata: {
        duration: endTime - startTime,
        model: this.currentAgent.model,
        promptVersion: this.currentPrompt!.version,
        agentKey: this.currentAgent.key,
        agentType: this.currentAgent.type,
      },
      runId: run.id,
    };
  }
  
  /**
   * Save an agent (new primary method)
   */
  async saveAgent(key: string, agent: Partial<Omit<NewAgent, 'key' | 'id'>>): Promise<Agent> {
    const existing = await this.agentRepo.findByKey(key);
    
    if (existing) {
      // Update existing agent
      return await this.agentRepo.update(existing.id, agent);
    }
    
    // Create new agent with defaults
    return await this.agentRepo.create({
      key,
      name: agent.name || `Agent: ${key}`,
      type: agent.type || 'scorer',
      model: agent.model || 'gpt-4o-mini',
      temperature: agent.temperature ?? 0.3,
      maxTokens: agent.maxTokens,
      promptId: agent.promptId || 'v1',
      outputType: agent.outputType || 'structured',
      outputSchema: agent.outputSchema,
      schemaVersion: agent.schemaVersion,
      description: agent.description,
      tags: agent.tags,
      metadata: agent.metadata,
      isDefault: agent.isDefault ?? false,
      isActive: agent.isActive ?? true,
      isSystemAgent: agent.isSystemAgent ?? false,
    });
  }
  
  /**
   * Save a configuration (backward compatibility)
   */
  async saveConfig(key: string, config: Omit<NewConfig, 'key'>): Promise<Config> {
    const existing = await this.configRepo.findByKey(key);
    
    if (existing) {
      // Update existing config
      return await this.configRepo.update(existing.id, config);
    }
    
    return await this.configRepo.create({
      ...config,
      key,
    });
  }
  
  /**
   * Load a configuration
   */
  async loadConfig(key: string): Promise<void> {
    await this.ensureInitialized();
    const config = await this.configRepo.findByKey(key);
    
    if (!config) {
      throw new Error(`Configuration '${key}' not found`);
    }
    
    this.currentAgent = await this.agentRepo.findByKey(key) || await this.agentRepo.create({
      key: config.key,
      name: config.description || `Agent: ${config.key}`,
      type: 'scorer',
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens || undefined,
      promptId: config.promptId,
      outputType: config.outputType || 'structured',
      outputSchema: config.outputSchema,
      schemaVersion: config.schemaVersion || undefined,
      isDefault: config.isDefault,
      isActive: config.isActive,
      isSystemAgent: false,
    });
    this.currentPrompt = await this.promptService.getPrompt(config.promptId);
    this.provider = providerFactory.createProvider(config.model);
  }
  
  /**
   * Get current agent
   */
  async getCurrentAgent(): Promise<Agent | null> {
    await this.ensureInitialized();
    return this.currentAgent;
  }
  
  /**
   * Get current configuration (backward compatibility)
   */
  getCurrentConfig(): Config | null {
    // Convert agent to config-like structure for backward compatibility
    if (!this.currentAgent) return null;
    
    return {
      id: this.currentAgent.id,
      key: this.currentAgent.key,
      model: this.currentAgent.model,
      temperature: this.currentAgent.temperature,
      maxTokens: this.currentAgent.maxTokens || null,
      promptId: this.currentAgent.promptId,
      outputType: this.currentAgent.outputType || 'structured',
      outputSchema: this.currentAgent.outputSchema,
      schemaVersion: this.currentAgent.schemaVersion || null,
      averageScore: this.currentAgent.averageScore,
      evaluationCount: this.currentAgent.evaluationCount || 0,
      lastEvaluatedAt: this.currentAgent.lastEvaluatedAt || null,
      description: this.currentAgent.description || null,
      tags: this.currentAgent.tags || null,
      metadata: this.currentAgent.metadata || null,
      isDefault: this.currentAgent.isDefault,
      isActive: this.currentAgent.isActive,
      createdAt: this.currentAgent.createdAt,
      updatedAt: this.currentAgent.updatedAt,
    } as Config;
  }
  
  /**
   * Get pending runs for assessment
   */
  async getPendingRuns(limit?: number): Promise<Run[]> {
    return await this.runRepo.findPending(limit);
  }
  
  /**
   * List all agents (new primary method)
   */
  async listAgents(): Promise<Agent[]> {
    return await this.agentRepo.findAll();
  }
  
  /**
   * List all configurations (backward compatibility)
   */
  async listConfigs(): Promise<Config[]> {
    return await this.configRepo.findAll();
  }
  
  /**
   * Get a specific agent
   */
  async getAgent(key: string): Promise<Agent | null> {
    return await this.agentRepo.findByKey(key);
  }
  
  /**
   * Set an agent as default (new primary method)
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
   * Set a configuration as default (backward compatibility)
   */
  async setDefaultConfig(key: string): Promise<Config> {
    await this.ensureInitialized();
    const config = await this.configRepo.findByKey(key);
    if (!config) {
      throw new Error(`Configuration '${key}' not found`);
    }
    
    // Use repository method to set default
    await this.configRepo.setDefault(key);
    
    // Return the updated config
    const updated = await this.configRepo.findByKey(key);
    return updated!;
  }
  
  
  
  /**
   * List available schemas
   */
  listSchemas(): Array<{ name: string; version: string; description?: string }> {
    return schemaRegistry.getAll().map(s => ({
      name: s.name,
      version: s.version,
      description: s.description,
    }));
  }
  
  /**
   * Detect the type of content
   */
  private detectContentType(content: string): string {
    // Check for code patterns
    if (content.includes('function') || content.includes('class') || content.includes('const')) {
      return 'code';
    }
    
    // Check for Markdown patterns
    if (content.includes('#') || content.includes('```') || content.includes('**')) {
      return 'markdown';
    }
    
    // Check for HTML patterns
    if (content.includes('<') && content.includes('>')) {
      return 'html';
    }
    
    // Default to plain text
    return 'text';
  }
}