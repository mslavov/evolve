import { Database } from '../db/client.js';
import { PromptRepository } from '../repositories/prompt.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { AgentService } from './agent.service.js';
import type { Prompt, NewPrompt } from '../db/schema/prompts.js';

export interface PromptGenerationStrategy {
  type: 'dimension_emphasis' | 'reasoning_style' | 'verbosity' | 'few_shot' | 'custom';
  params?: Record<string, any>;
}

export interface PromptTestResult {
  version: string;
  mae: number;
  correlation: number;
  rmse: number;
  samplesEvaluated: number;
}

export class PromptService {
  public promptRepo: PromptRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private promptCache: Map<string, Prompt> = new Map();
  
  constructor(db: Database) {
    this.promptRepo = new PromptRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
  }
  
  /**
   * Get a prompt by version, with caching
   */
  async getPrompt(version: string): Promise<Prompt | null> {
    // Check cache first
    if (this.promptCache.has(version)) {
      return this.promptCache.get(version)!;
    }
    
    const prompt = await this.promptRepo.findByVersion(version);
    if (prompt) {
      this.promptCache.set(version, prompt);
    }
    
    return prompt;
  }
  
  /**
   * Format a prompt template with input
   */
  formatPrompt(template: string, input: string, variables?: Record<string, any>): string {
    let formatted = template;
    
    // Replace any variables in the template
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        formatted = formatted.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }
    
    // Add the input to process
    formatted += `\n\nInput:\n${input}`;
    
    return formatted;
  }
  
  /**
   * Generate a new prompt variation using AI
   */
  async generateVariation(
    baseVersion: string,
    strategy: PromptGenerationStrategy,
    agentService: AgentService
  ): Promise<Prompt> {
    const basePrompt = await this.getPrompt(baseVersion);
    if (!basePrompt) {
      throw new Error(`Base prompt version ${baseVersion} not found`);
    }
    
    // Generate variation based on strategy
    const variationPrompt = this.createVariationPrompt(basePrompt.template, strategy);
    
    // Use the prompt generator agent to create a new prompt
    const result = await agentService.run(variationPrompt, {
      agentKey: 'prompt_generator'
    });
    const response = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
    
    // Create unique version name
    const timestamp = Date.now();
    const strategyPrefix = strategy.type.split('_').map(w => w[0]).join('');
    const newVersion = `${baseVersion}_${strategyPrefix}_${timestamp}`;
    
    // Save the new prompt
    const newPrompt = await this.promptRepo.createVariation(baseVersion, {
      version: newVersion,
      name: `${basePrompt.name} - ${strategy.type} variation`,
      description: `AI-generated variation using ${strategy.type} strategy`,
      template: response,
      generationStrategy: strategy.type,
      metadata: {
        strategy: strategy,
        basePrompt: baseVersion,
        generatedAt: new Date().toISOString(),
      },
    });
    
    return newPrompt;
  }
  
  /**
   * Test a prompt against evaluation dataset
   */
  async testPrompt(
    version: string,
    agentService: AgentService,
    testDataFilters?: { split?: 'validation' | 'test'; limit?: number }
  ): Promise<PromptTestResult> {
    const prompt = await this.getPrompt(version);
    if (!prompt) {
      throw new Error(`Prompt version ${version} not found`);
    }
    
    // Get test data
    const testData = await this.evalDatasetRepo.findMany({
      split: testDataFilters?.split || 'test',
      limit: testDataFilters?.limit || 100,
    });
    
    if (testData.length === 0) {
      throw new Error('No test data available');
    }
    
    // Test the prompt
    let totalError = 0;
    let totalSquaredError = 0;
    let predictions: number[] = [];
    let actuals: number[] = [];
    
    for (const data of testData) {
      // Use the agent's run method
      const formattedPrompt = this.formatPrompt(prompt.template, data.input);
      const result = await agentService.run(formattedPrompt);
      
      // Extract score from output
      const score = typeof result.output === 'object' && result.output.score !== undefined 
        ? result.output.score 
        : 0;
      
      const error = Math.abs(score - data.correctedScore);
      totalError += error;
      totalSquaredError += error * error;
      
      predictions.push(score);
      actuals.push(data.correctedScore);
    }
    
    const mae = totalError / testData.length;
    const rmse = Math.sqrt(totalSquaredError / testData.length);
    const correlation = this.calculateCorrelation(predictions, actuals);
    
    // Update prompt performance metrics
    await this.promptRepo.updatePerformance(version, {
      mae,
      correlation,
      rmse,
      incrementEvalCount: true,
    });
    
    return {
      version,
      mae,
      correlation,
      rmse,
      samplesEvaluated: testData.length,
    };
  }
  
  /**
   * Get the best performing prompt
   */
  async getBestPrompt(): Promise<Prompt | null> {
    return this.promptRepo.findBest();
  }
  
  /**
   * Get all active prompts
   */
  async listActivePrompts(): Promise<Prompt[]> {
    return this.promptRepo.findMany({ isActive: true });
  }
  
  /**
   * Promote a prompt to production
   */
  async promoteToProduction(version: string): Promise<void> {
    await this.promptRepo.setProduction(version, true);
    // Clear cache to ensure fresh data
    this.promptCache.delete(version);
  }
  
  /**
   * Get prompt statistics
   */
  async getStats() {
    return this.promptRepo.getStats();
  }
  
  /**
   * Create a new prompt manually
   */
  async createPrompt(data: NewPrompt): Promise<Prompt> {
    return this.promptRepo.create(data);
  }
  
  /**
   * Compare two prompts
   */
  async comparePrompts(
    version1: string,
    version2: string,
    agentService: AgentService
  ): Promise<{
    prompt1: PromptTestResult;
    prompt2: PromptTestResult;
    winner: string;
    improvement: number;
  }> {
    const [result1, result2] = await Promise.all([
      this.testPrompt(version1, agentService),
      this.testPrompt(version2, agentService),
    ]);
    
    const winner = result1.mae < result2.mae ? version1 : version2;
    const improvement = Math.abs(result1.mae - result2.mae);
    
    return {
      prompt1: result1,
      prompt2: result2,
      winner,
      improvement,
    };
  }
  
  /**
   * Create variation prompt based on strategy
   */
  private createVariationPrompt(baseTemplate: string, strategy: PromptGenerationStrategy): string {
    switch (strategy.type) {
      case 'dimension_emphasis':
        return `Generate a variation of this scoring prompt that emphasizes ${strategy.params?.dimension || 'accuracy'} more:
        
Original prompt:
${baseTemplate}

Requirements:
- Keep the same scoring scale (0-1)
- Emphasize the ${strategy.params?.dimension || 'accuracy'} dimension
- Maintain clarity and structure
- Provide clear scoring criteria`;

      case 'reasoning_style':
        return `Generate a variation of this scoring prompt using ${strategy.params?.style || 'analytical'} reasoning:
        
Original prompt:
${baseTemplate}

Requirements:
- Use ${strategy.params?.style || 'analytical'} reasoning approach
- Keep the same scoring scale (0-1)
- Maintain scoring dimensions
- Be clear and actionable`;

      case 'verbosity':
        return `Generate a ${strategy.params?.level || 'concise'} version of this scoring prompt:
        
Original prompt:
${baseTemplate}

Requirements:
- Make it ${strategy.params?.level || 'concise'}
- Keep the same scoring scale (0-1)
- Preserve all key evaluation criteria
- Maintain clarity`;

      case 'few_shot':
        return `Generate a variation of this scoring prompt with ${strategy.params?.examples || 3} concrete examples:
        
Original prompt:
${baseTemplate}

Requirements:
- Include ${strategy.params?.examples || 3} diverse, realistic examples
- Show different score ranges
- Keep the same scoring scale (0-1)
- Make examples instructive`;

      default:
        return `Generate an improved version of this scoring prompt:
        
Original prompt:
${baseTemplate}

Requirements:
- Keep the same scoring scale (0-1)
- Improve clarity and effectiveness
- Maintain all dimensions
- ${strategy.params?.instruction || 'Make it better for consistent scoring'}`;
    }
  }
  
  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
}