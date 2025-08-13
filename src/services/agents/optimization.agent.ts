import type { Config } from '../../db/schema/configs.js';
import type { 
  DetailedEvaluation, 
  ResearchInsight,
  DetailedFeedback 
} from '../evaluation/types.js';
import { PromptService, type PromptGenerationStrategy } from '../prompt.service.js';
import { AgentService } from '../agent.service.js';
import { Database } from '../../db/client.js';

export interface OptimizationStrategy {
  type: 'prompt' | 'parameter' | 'model' | 'hybrid';
  name: string;
  apply: (config: Config, insights: ResearchInsight[]) => Promise<Config>;
}

export interface ConfigVariation {
  config: Config;
  strategy: string;
  changes: string[];
  expectedImprovement: number;
}

export class OptimizationAgent {
  private promptService: PromptService;
  private agentService: AgentService;
  private strategies: Map<string, OptimizationStrategy> = new Map();
  
  constructor(db: Database) {
    this.promptService = new PromptService(db);
    this.agentService = new AgentService(db);
    this.initializeStrategies();
  }
  
  
  /**
   * Optimize configuration based on evaluation and research
   */
  async optimize(
    current: Config,
    evaluation: DetailedEvaluation,
    research: ResearchInsight[]
  ): Promise<Config> {
    // Apply research-driven strategies
    const strategies = this.selectStrategies(research, evaluation);
    
    // Generate sophisticated variations
    const variations = await this.generateVariations(current, strategies, research);
    
    // Test and select best variation
    return await this.selectBestVariation(variations);
  }
  
  /**
   * Initialize optimization strategies
   */
  private initializeStrategies(): void {
    // Prompt optimization strategy
    this.strategies.set('prompt-optimization', {
      type: 'prompt',
      name: 'prompt-optimization',
      apply: async (config, insights) => {
        return this.optimizePrompt(config, insights);
      },
    });
    
    // Parameter tuning strategy
    this.strategies.set('parameter-tuning', {
      type: 'parameter',
      name: 'parameter-tuning',
      apply: async (config, insights) => {
        return this.tuneParameters(config, insights);
      },
    });
    
    // Model selection strategy
    this.strategies.set('model-selection', {
      type: 'model',
      name: 'model-selection',
      apply: async (config, insights) => {
        return this.selectModel(config, insights);
      },
    });
    
    // Hybrid optimization strategy
    this.strategies.set('hybrid-optimization', {
      type: 'hybrid',
      name: 'hybrid-optimization',
      apply: async (config, insights) => {
        return this.hybridOptimization(config, insights);
      },
    });
  }
  
  /**
   * Select optimization strategies based on research
   */
  private selectStrategies(
    research: ResearchInsight[],
    evaluation: DetailedEvaluation
  ): OptimizationStrategy[] {
    const selected: OptimizationStrategy[] = [];
    const feedback = evaluation.feedback;
    
    // Analyze which strategies to apply
    const needsPromptWork = this.needsPromptOptimization(feedback, research);
    const needsParameterTuning = this.needsParameterTuning(feedback, research);
    const needsModelChange = this.needsModelChange(evaluation.score, research);
    
    if (needsPromptWork) {
      selected.push(this.strategies.get('prompt-optimization')!);
    }
    
    if (needsParameterTuning) {
      selected.push(this.strategies.get('parameter-tuning')!);
    }
    
    if (needsModelChange) {
      selected.push(this.strategies.get('model-selection')!);
    }
    
    // Use hybrid if multiple needs identified
    if (selected.length > 1) {
      selected.length = 0;
      selected.push(this.strategies.get('hybrid-optimization')!);
    }
    
    // Default to prompt optimization if nothing selected
    if (selected.length === 0) {
      selected.push(this.strategies.get('prompt-optimization')!);
    }
    
    return selected;
  }
  
  /**
   * Generate configuration variations
   */
  private async generateVariations(
    current: Config,
    strategies: OptimizationStrategy[],
    research: ResearchInsight[]
  ): Promise<ConfigVariation[]> {
    const variations: ConfigVariation[] = [];
    
    for (const strategy of strategies) {
      // Apply strategy to generate variations
      const optimized = await strategy.apply(current, research);
      
      // Calculate expected improvement based on research confidence
      const expectedImprovement = this.calculateExpectedImprovement(
        strategy,
        research
      );
      
      // Document changes made
      const changes = this.documentChanges(current, optimized);
      
      variations.push({
        config: optimized,
        strategy: strategy.name,
        changes,
        expectedImprovement,
      });
      
      // Generate additional variations with different parameters
      if (strategy.type === 'parameter') {
        const paramVariations = await this.generateParameterVariations(current, research);
        variations.push(...paramVariations);
      }
    }
    
    return variations;
  }
  
  /**
   * Select best variation through testing
   */
  private async selectBestVariation(variations: ConfigVariation[]): Promise<Config> {
    // Sort by expected improvement
    variations.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
    
    // For now, return the top variation
    // In a full implementation, this would test each variation
    return variations[0].config;
  }
  
  /**
   * Optimize prompt based on insights
   */
  private async optimizePrompt(config: Config, insights: ResearchInsight[]): Promise<Config> {
    const newConfig = { ...config };
    
    // Extract prompt improvement strategies from insights
    const promptInsights = insights.filter(i => i.implementation?.includes('prompt'));
    
    // Generate improved prompt using the first applicable strategy
    if (promptInsights.length > 0 && config.promptId) {
      const strategyType = this.insightToPromptStrategy(promptInsights[0]);
      const strategy: PromptGenerationStrategy = {
        type: strategyType as any,
        params: {
          insights: promptInsights.map(i => i.strategy),
        },
      };
      
      try {
        const improvedPrompt = await this.promptService.generateVariation(
          config.promptId,
          strategy,
          this.agentService
        );
        
        if (improvedPrompt) {
          newConfig.promptId = improvedPrompt.id;
        }
      } catch (error) {
        console.warn('Failed to generate prompt variation:', error);
      }
    }
    
    return newConfig;
  }
  
  /**
   * Tune parameters based on insights
   */
  private async tuneParameters(config: Config, insights: ResearchInsight[]): Promise<Config> {
    const newConfig = { ...config };
    
    // Extract parameter recommendations
    for (const insight of insights) {
      if (insight.implementation?.includes('temperature')) {
        // Adjust temperature based on recommendation
        if (insight.strategy.includes('lower') || insight.strategy.includes('reduce')) {
          newConfig.temperature = Math.max(0.1, (config.temperature || 0.7) - 0.2);
        } else if (insight.strategy.includes('higher') || insight.strategy.includes('increase')) {
          newConfig.temperature = Math.min(1.0, (config.temperature || 0.7) + 0.2);
        }
      }
      
      if (insight.implementation?.includes('max_tokens')) {
        // Adjust max tokens if mentioned
        newConfig.maxTokens = 1000; // Reasonable default
      }
    }
    
    return newConfig;
  }
  
  /**
   * Select optimal model based on insights
   */
  private async selectModel(config: Config, insights: ResearchInsight[]): Promise<Config> {
    const newConfig = { ...config };
    
    // Check if more powerful model is recommended
    const needsPowerfulModel = insights.some(i => 
      i.strategy.includes('powerful') || 
      i.strategy.includes('advanced') ||
      i.strategy.includes('gpt-4')
    );
    
    if (needsPowerfulModel) {
      // Upgrade to more powerful model
      if (config.model === 'gpt-4o-mini') {
        newConfig.model = 'gpt-4o';
      } else if (config.model === 'claude-3-haiku') {
        newConfig.model = 'claude-3-sonnet';
      }
    } else {
      // Check if we can downgrade for efficiency
      const canDowngrade = insights.some(i => 
        i.strategy.includes('efficient') || 
        i.strategy.includes('fast')
      );
      
      if (canDowngrade && config.model === 'gpt-4o') {
        newConfig.model = 'gpt-4o-mini';
      }
    }
    
    return newConfig;
  }
  
  /**
   * Apply multiple optimization strategies
   */
  private async hybridOptimization(config: Config, insights: ResearchInsight[]): Promise<Config> {
    let optimized = { ...config };
    
    // Apply each optimization in sequence
    optimized = await this.optimizePrompt(optimized, insights);
    optimized = await this.tuneParameters(optimized, insights);
    optimized = await this.selectModel(optimized, insights);
    
    return optimized;
  }
  
  /**
   * Generate parameter variations
   */
  private async generateParameterVariations(
    config: Config,
    insights: ResearchInsight[]
  ): Promise<ConfigVariation[]> {
    const variations: ConfigVariation[] = [];
    
    // Temperature variations
    const temperatures = [0.1, 0.3, 0.5, 0.7, 0.9];
    for (const temp of temperatures) {
      if (Math.abs(temp - (config.temperature || 0.7)) > 0.1) {
        const varConfig = { ...config, temperature: temp };
        variations.push({
          config: varConfig,
          strategy: 'temperature-variation',
          changes: [`Temperature: ${config.temperature} → ${temp}`],
          expectedImprovement: this.estimateTemperatureImprovement(temp, insights),
        });
      }
    }
    
    return variations;
  }
  
  /**
   * Check if prompt optimization is needed
   */
  private needsPromptOptimization(
    feedback: DetailedFeedback,
    research: ResearchInsight[]
  ): boolean {
    return (
      feedback.weaknesses?.some(w => 
        w.includes('prompt') || 
        w.includes('instruction') || 
        w.includes('clarity')
      ) ||
      research.some(i => i.implementation?.includes('prompt'))
    ) ?? false;
  }
  
  /**
   * Check if parameter tuning is needed
   */
  private needsParameterTuning(
    feedback: DetailedFeedback,
    research: ResearchInsight[]
  ): boolean {
    return (
      feedback.weaknesses?.some(w => 
        w.includes('consistency') || 
        w.includes('variance') || 
        w.includes('stability')
      ) ||
      research.some(i => 
        i.implementation?.includes('temperature') || 
        i.implementation?.includes('parameter')
      )
    ) ?? false;
  }
  
  /**
   * Check if model change is needed
   */
  private needsModelChange(score: number, research: ResearchInsight[]): boolean {
    return (
      score < 0.5 || // Poor performance
      research.some(i => 
        i.strategy.includes('model') || 
        i.strategy.includes('powerful')
      )
    );
  }
  
  /**
   * Convert insight to prompt strategy
   */
  private insightToPromptStrategy(insight: ResearchInsight): string {
    if (insight.strategy.includes('few-shot')) return 'few-shot';
    if (insight.strategy.includes('chain-of-thought')) return 'chain-of-thought';
    if (insight.strategy.includes('structure')) return 'structured';
    if (insight.strategy.includes('calibration')) return 'calibration';
    return 'enhancement';
  }
  
  /**
   * Calculate expected improvement
   */
  private calculateExpectedImprovement(
    strategy: OptimizationStrategy,
    research: ResearchInsight[]
  ): number {
    // Base improvement estimate
    let improvement = 0.1;
    
    // Adjust based on research confidence
    const relevantInsights = research.filter(i => 
      i.strategy.toLowerCase().includes(strategy.type)
    );
    
    if (relevantInsights.length > 0) {
      const avgConfidence = relevantInsights.reduce((sum, i) => sum + i.confidence, 0) / relevantInsights.length;
      const avgApplicability = relevantInsights.reduce((sum, i) => sum + i.applicability, 0) / relevantInsights.length;
      
      improvement = avgConfidence * avgApplicability * 0.3; // Max 30% improvement
    }
    
    return improvement;
  }
  
  /**
   * Estimate temperature improvement
   */
  private estimateTemperatureImprovement(temp: number, insights: ResearchInsight[]): number {
    // Lower temperatures generally improve consistency
    const consistencyInsights = insights.filter(i => 
      i.strategy.includes('consistency') || 
      i.strategy.includes('stability')
    );
    
    if (consistencyInsights.length > 0 && temp < 0.5) {
      return 0.15; // 15% expected improvement
    }
    
    return 0.05; // 5% baseline
  }
  
  /**
   * Document changes between configurations
   */
  private documentChanges(original: Config, optimized: Config): string[] {
    const changes: string[] = [];
    
    if (original.model !== optimized.model) {
      changes.push(`Model: ${original.model} → ${optimized.model}`);
    }
    
    if (original.temperature !== optimized.temperature) {
      changes.push(`Temperature: ${original.temperature} → ${optimized.temperature}`);
    }
    
    if (original.promptId !== optimized.promptId) {
      changes.push('Prompt updated with improvements');
    }
    
    if (original.maxTokens !== optimized.maxTokens) {
      changes.push(`Max tokens: ${original.maxTokens} → ${optimized.maxTokens}`);
    }
    
    return changes;
  }
}