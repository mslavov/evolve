import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { ConfigRepository } from '../repositories/config.repository.js';
import { PromptService } from './prompt.service.js';
import { scoringSchema } from '../types/index.js';
import { providerFactory, type LLMProvider, type LLMMessage } from '../providers/index.js';
import { schemaRegistry } from './schema-registry.service.js';
import { z } from 'zod';
import type { Config, NewConfig } from '../db/schema/configs.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import type { Prompt } from '../db/schema/prompts.js';

export interface RunOptions {
  configKey?: string;
}

export interface RunResult {
  output: any;
  metadata?: Record<string, any>;
  runId?: string;
}

export class AgentService {
  private runRepo: RunRepository;
  private configRepo: ConfigRepository;
  private promptService: PromptService;
  private currentConfig: Config | null = null;
  private currentPrompt: Prompt | null = null;
  private provider: LLMProvider | null = null;
  
  constructor(db: Database) {
    this.runRepo = new RunRepository(db);
    this.configRepo = new ConfigRepository(db);
    this.promptService = new PromptService(db);
  }
  
  /**
   * Initialize the agent service
   */
  async initialize(): Promise<void> {
    // Load default configuration
    this.currentConfig = await this.configRepo.findDefault();
    
    if (!this.currentConfig) {
      // Try to find any existing config first
      const configs = await this.configRepo.findMany({ isActive: true });
      if (configs.length > 0) {
        this.currentConfig = configs[0];
      } else {
        // Get the production prompt or default to v1
        const prodPrompt = await this.promptService.getBestPrompt();
        const promptId = prodPrompt?.id || 'v1';
        
        // Create a default configuration if none exists
        this.currentConfig = await this.configRepo.create({
          key: 'default',
          model: 'gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 500,
          promptId: promptId,
          isDefault: true,
        });
      }
    }
    
    // Load the prompt
    this.currentPrompt = await this.promptService.getPrompt(this.currentConfig.promptId);
    
    // Initialize provider based on model
    this.provider = providerFactory.createProvider(this.currentConfig.model);
  }
  
  /**
   * Run the agent with given input
   */
  async run(
    input: string | Record<string, any>,
    options?: RunOptions
  ): Promise<RunResult> {
    // Ensure we're initialized
    if (!this.provider || !this.currentConfig) {
      await this.initialize();
    }
    
    if (!this.provider || !this.currentConfig) {
      throw new Error('Failed to initialize agent service');
    }
    
    // Load specific config if requested
    if (options?.configKey && options.configKey !== this.currentConfig.key) {
      const config = await this.configRepo.findByKey(options.configKey);
      if (config) {
        this.currentConfig = config;
        this.currentPrompt = await this.promptService.getPrompt(config.promptId);
        this.provider = providerFactory.createProvider(config.model);
      }
    }
    
    const startTime = Date.now();
    
    // Get the prompt
    if (!this.currentPrompt) {
      this.currentPrompt = await this.promptService.getPrompt(this.currentConfig.promptId);
    }
    
    if (!this.currentPrompt) {
      throw new Error('Prompt not found for config');
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
    
    if (this.currentConfig.outputSchema) {
      // Use custom schema from config
      try {
        outputSchema = schemaRegistry.createFromJSON(this.currentConfig.outputSchema);
      } catch (error) {
        console.warn('Failed to parse custom schema, falling back to default:', error);
        outputSchema = scoringSchema;
      }
    } else if (this.currentConfig.schemaVersion) {
      // Try to get predefined schema by name/version
      const schemaDef = schemaRegistry.get(this.currentConfig.schemaVersion);
      if (schemaDef) {
        outputSchema = schemaDef.schema;
      }
    }
    
    // Call provider based on output type
    if (this.currentConfig.outputType === 'text') {
      // Use text generation for unstructured output
      const response = await this.provider.generateText(
        messages,
        {
          model: this.currentConfig.model,
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens || 500,
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
          model: this.currentConfig.model,
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens || 500,
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
      configModel: this.currentConfig.model,
      configTemperature: this.currentConfig.temperature,
      configPromptVersion: this.currentPrompt!.version,
      configMaxTokens: this.currentConfig.maxTokens || undefined,
      telemetryDuration: endTime - startTime,
      assessmentStatus: 'skipped',
    };
    
    const run = await this.runRepo.create(runData);
    
    return {
      output: result,
      metadata: {
        duration: endTime - startTime,
        model: this.currentConfig.model,
        promptVersion: this.currentPrompt!.version,
      },
      runId: run.id,
    };
  }
  
  /**
   * Save a configuration
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
    const config = await this.configRepo.findByKey(key);
    
    if (!config) {
      throw new Error(`Configuration '${key}' not found`);
    }
    
    this.currentConfig = config;
    this.currentPrompt = await this.promptService.getPrompt(config.promptId);
    this.provider = providerFactory.createProvider(config.model);
  }
  
  /**
   * Get current configuration
   */
  getCurrentConfig(): Config | null {
    return this.currentConfig;
  }
  
  /**
   * Get pending runs for assessment
   */
  async getPendingRuns(limit?: number): Promise<Run[]> {
    return await this.runRepo.findPending(limit);
  }
  
  /**
   * List all configurations
   */
  async listConfigs(): Promise<Config[]> {
    return await this.configRepo.findAll();
  }
  
  /**
   * Set a configuration as default
   */
  async setDefaultConfig(key: string): Promise<Config> {
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
   * Generate a prompt variation
   */
  async generatePromptVariation(basePrompt: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a prompt engineer. Create a variation of the given prompt that maintains the same intent but uses different wording and structure.',
      },
      {
        role: 'user',
        content: `Create a variation of this prompt:\n\n${basePrompt}`,
      },
    ];
    
    const provider = this.provider || providerFactory.createProvider('gpt-4o-mini');
    const response = await provider.generateText(messages, {
      model: 'gpt-4o-mini',
      temperature: 0.8,
      maxTokens: 1000,
    });
    
    return response.content;
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