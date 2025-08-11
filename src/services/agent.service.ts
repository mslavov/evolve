import { Agent } from '@mastra/core';
import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { ConfigRepository } from '../repositories/config.repository.js';
import { PromptService } from './prompt.service.js';
import { scoringSchema } from '../types/index.js';
import type { Config, NewConfig } from '../db/schema/configs.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import type { Prompt } from '../db/schema/prompts.js';

export interface ScoringOptions {
  configKey?: string;
  collectRun?: boolean;
  includeTelemetry?: boolean;
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  dimensions?: {
    clarity?: number;
    relevance?: number;
    completeness?: number;
    actionability?: number;
    accuracy?: number;
  };
  runId?: string;
}

export class AgentService {
  private runRepo: RunRepository;
  private configRepo: ConfigRepository;
  private promptService: PromptService;
  private currentConfig: Config | null = null;
  private currentPrompt: Prompt | null = null;
  private agent: Agent | null = null;
  
  constructor(private readonly db: Database) {
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
    
    // Load the prompt
    this.currentPrompt = await this.promptService.getPrompt(this.currentConfig.promptId);
    this.agent = this.createAgent(this.currentConfig);
  }
  
  /**
   * Score content using the AI agent
   */
  async scoreContent(
    content: string,
    options?: ScoringOptions
  ): Promise<ScoringResult> {
    // Ensure we're initialized
    if (!this.agent || !this.currentConfig) {
      await this.initialize();
    }
    
    if (!this.agent || !this.currentConfig) {
      throw new Error('Failed to initialize agent service');
    }
    
    // Load specific config if requested
    if (options?.configKey && options.configKey !== this.currentConfig!.key) {
      const config = await this.configRepo.findByKey(options.configKey);
      if (config) {
        this.currentConfig = config;
        this.currentPrompt = await this.promptService.getPrompt(config.promptId);
        this.agent = this.createAgent(config);
      }
    }
    
    const startTime = Date.now();
    
    // Get the prompt
    if (!this.currentPrompt) {
      this.currentPrompt = await this.promptService.getPrompt(this.currentConfig!.promptId);
    }
    
    if (!this.currentPrompt) {
      throw new Error('Prompt not found for config');
    }
    
    const prompt = this.promptService.formatPrompt(
      this.currentPrompt.template,
      content
    );
    
    // Call the agent
    const response = await this.agent!.generate(prompt, {
      output: scoringSchema,
      maxTokens: this.currentConfig!.maxTokens || 500,
    });
    
    const endTime = Date.now();
    const result = (response as any).object || response;
    
    // Always record the run (since we removed separate scoring records)
    const runData: NewRun = {
      inputContent: content,
      inputLength: content.length,
      inputType: this.detectContentType(content),
      outputScore: result.score,
      outputReasoning: result.reasoning,
      outputDimensions: result.dimensions,
      configModel: this.currentConfig!.model,
      configTemperature: this.currentConfig!.temperature,
      configPromptId: this.currentConfig!.promptId,
      configMaxTokens: this.currentConfig!.maxTokens || undefined,
      telemetryDuration: options?.includeTelemetry ? endTime - startTime : undefined,
      assessmentStatus: options?.collectRun ? 'pending' : 'skipped',
    };
    
    const run = await this.runRepo.create(runData);
    
    return {
      ...result,
      runId: run.id,
    };
  }
  
  /**
   * Get runs pending assessment
   */
  async getPendingRuns(limit?: number): Promise<Run[]> {
    return this.runRepo.findPendingAssessment(limit);
  }
  
  /**
   * Score content with a specific prompt template (for testing)
   */
  async scoreContentWithPrompt(
    content: string,
    promptTemplate: string
  ): Promise<{ score: number; reasoning: string }> {
    if (!this.agent) {
      await this.initialize();
    }
    
    const prompt = this.promptService.formatPrompt(promptTemplate, content);
    
    const response = await this.agent!.generate(prompt, {
      output: scoringSchema,
      maxTokens: 500,
    });
    
    return (response as any).object || response;
  }
  
  /**
   * Generate a prompt variation using AI
   */
  async generatePromptVariation(
    variationPrompt: string
  ): Promise<{ template: string }> {
    if (!this.agent) {
      await this.initialize();
    }
    
    const response = await this.agent!.generate(variationPrompt, {
      maxTokens: 1000,
    });
    
    // Extract the template from the response
    const text = (response as any).text || response;
    return { template: text };
  }
  
  /**
   * Create or update a configuration
   */
  async saveConfig(key: string, config: Partial<NewConfig>): Promise<Config> {
    const existing = await this.configRepo.findByKey(key);
    
    if (existing) {
      return (await this.configRepo.updateByKey(key, config))!;
    } else {
      // Get default prompt if not specified
      let promptId = config.promptId;
      if (!promptId) {
        const defaultPrompt = await this.promptService.getBestPrompt();
        promptId = defaultPrompt?.id || 'v1';
      }
      
      return await this.configRepo.create({
        ...config,
        key,
        model: config.model || 'gpt-4o-mini',
        temperature: config.temperature ?? 0.3,
        promptId: promptId,
      });
    }
  }
  
  /**
   * List all configurations
   */
  async listConfigs() {
    return this.configRepo.findMany();
  }
  
  /**
   * Set a configuration as default
   */
  async setDefaultConfig(key: string): Promise<void> {
    await this.configRepo.setDefault(key);
    
    // Reload the default config
    this.currentConfig = await this.configRepo.findByKey(key);
    if (this.currentConfig) {
      this.currentPrompt = await this.promptService.getPrompt(this.currentConfig.promptId);
      this.agent = this.createAgent(this.currentConfig);
    }
  }
  
  /**
   * Create an agent instance from configuration
   */
  private createAgent(config: Config): Agent {
    const provider = config.model.startsWith('gpt') ? 'OPEN_AI' : 'ANTHROPIC';
    
    return new Agent({
      name: 'usefulness-scorer',
      instructions: 'Scores content usefulness',
      model: {
        provider,
        name: config.model as any,
        toolChoice: 'auto',
      } as any,
    } as any);
  }
  
  /**
   * Detect the type of content
   */
  private detectContentType(content: string): string {
    if (content.includes('```') || content.includes('function') || content.includes('class')) {
      return 'code';
    }
    if (content.startsWith('http://') || content.startsWith('https://')) {
      return 'url';
    }
    if (content.includes('\n\n') && content.length > 500) {
      return 'article';
    }
    return 'text';
  }
}