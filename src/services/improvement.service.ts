import { Database } from '../db/client.js';
import { ConfigRepository } from '../repositories/config.repository.js';
import { RunRepository } from '../repositories/run.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { PromptService, type PromptGenerationStrategy } from './prompt.service.js';
import { AgentService } from './agent.service.js';
import type { Config, NewConfig } from '../db/schema/configs.js';
import type { EvalDataset } from '../db/schema/eval-datasets.js';
import type { Prompt } from '../db/schema/prompts.js';

// New orchestration imports
import { FlowOrchestrator, type FlowConfig } from './orchestration/flow.orchestrator.js';
import { EvaluationRegistry } from './evaluation/registry.js';
import { NumericScoreEvaluator } from './evaluation/strategies/numeric-score.strategy.js';
import { FactBasedEvaluator } from './evaluation/strategies/fact-based.strategy.js';
import { HybridEvaluator } from './evaluation/strategies/hybrid.strategy.js';
import type { OptimizationParams as FlowOptimizationParams } from './orchestration/optimization-state.js';
import type { EvaluationConfig } from './evaluation/types.js';

export interface OptimizationParams {
  baseConfigKey: string;
  variations?: {
    models?: string[];
    temperatures?: number[];
    promptIds?: string[];
    generatePrompts?: boolean;
    promptStrategies?: PromptGenerationStrategy[];
  };
  testDataVersion?: string;
  testDataSplit?: 'validation' | 'test';
  sampleSize?: number;
}

export interface OptimizationResult {
  bestConfig: Config;
  results: Array<{
    config: Partial<NewConfig>;
    score: number;
    error: number;
    rmse: number;
  }>;
  recommendation: string;
}

export interface PromptImprovementParams {
  currentVersion: string;
  targetVersion: string;
  analysisDepth?: 'basic' | 'detailed';
}

export class ImprovementService {
  private configRepo: ConfigRepository;
  private runRepo: RunRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private promptService: PromptService;
  private agentService: AgentService;
  
  // New orchestration components
  private evaluationRegistry: EvaluationRegistry;
  private flowOrchestrator: FlowOrchestrator;
  
  constructor(private readonly db: Database) {
    this.configRepo = new ConfigRepository(db);
    this.runRepo = new RunRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.promptService = new PromptService(db);
    this.agentService = new AgentService(db);
    
    // Initialize orchestration components
    this.evaluationRegistry = new EvaluationRegistry();
    this.setupEvaluationStrategies();
    this.flowOrchestrator = new FlowOrchestrator(db, this.evaluationRegistry);
  }
  
  /**
   * Initialize the improvement service
   */
  async initialize(): Promise<void> {
    await this.agentService.initialize();
    await this.flowOrchestrator.initialize();
  }
  
  /**
   * Set up available evaluation strategies
   */
  private setupEvaluationStrategies(): void {
    // Register evaluation strategies
    this.evaluationRegistry.register(new NumericScoreEvaluator());
    this.evaluationRegistry.register(new FactBasedEvaluator());
    this.evaluationRegistry.register(new HybridEvaluator());
    
    // Set default strategy
    this.evaluationRegistry.setDefault('numeric-score');
    
    // Add automatic selection rules
    this.evaluationRegistry.addRule({
      name: 'content-scoring-rule',
      priority: 10,
      matches: (ctx) => ctx.hasNumericGroundTruth && !ctx.hasFactRequirements,
      strategyName: 'numeric-score',
    });
    
    this.evaluationRegistry.addRule({
      name: 'fact-based-rule',
      priority: 9,
      matches: (ctx) => ctx.hasFactRequirements,
      strategyName: 'fact-based',
    });
    
    this.evaluationRegistry.addRule({
      name: 'hybrid-rule',
      priority: 8,
      matches: (ctx) => ctx.hasNumericGroundTruth && ctx.hasTextualContent,
      strategyName: 'hybrid',
    });
  }
  
  /**
   * Run iterative optimization using the flow orchestrator
   */
  async runIterativeOptimization(params: {
    baseConfigKey: string;
    targetScore?: number;
    maxIterations?: number;
    evaluationStrategy?: string;
    enableResearch?: boolean;
    verbose?: boolean;
  }): Promise<any> {
    // Get base configuration
    const baseConfig = await this.configRepo.findByKey(params.baseConfigKey);
    if (!baseConfig) {
      throw new Error(`Base configuration ${params.baseConfigKey} not found`);
    }
    
    // Prepare flow optimization parameters
    const flowParams: FlowOptimizationParams = {
      baseConfig,
      targetScore: params.targetScore || 0.9,
      maxIterations: params.maxIterations || 10,
      minImprovement: 0.01,
      evaluationStrategy: params.evaluationStrategy,
      enableResearch: params.enableResearch !== false,
      convergenceThreshold: 0.005,
    };
    
    // Prepare flow configuration
    const flowConfig: FlowConfig = {
      evaluationConfig: {
        strategy: params.evaluationStrategy,
        feedbackDetail: 'detailed',
      },
      enableParallelAgents: true,
      saveIntermediateResults: true,
      verbose: params.verbose || false,
    };
    
    // Run iterative optimization
    const result = await this.flowOrchestrator.runOptimizationFlow(flowParams, flowConfig);
    
    // Save the optimized configuration
    const optimizedKey = `${params.baseConfigKey}_flow_optimized_${Date.now()}`;
    const optimizedConfig = await this.configRepo.create({
      key: optimizedKey,
      model: result.finalConfig.model,
      temperature: result.finalConfig.temperature,
      promptId: result.finalConfig.promptId,
      maxTokens: result.finalConfig.maxTokens,
      description: `Flow-optimized from ${params.baseConfigKey}`,
      metadata: {
        baseConfig: params.baseConfigKey,
        optimizationDate: new Date(),
        iterations: result.iterations,
        finalScore: result.finalScore,
        totalImprovement: result.totalImprovement,
        converged: result.converged,
        stoppedReason: result.stoppedReason,
      },
    });
    
    // Update performance metrics
    await this.configRepo.updatePerformanceMetrics(
      optimizedKey,
      result.finalScore,
      false
    );
    
    // Analyze optimization history
    const analysis = this.flowOrchestrator.analyzeOptimizationHistory(result);
    
    return {
      optimizedConfig,
      result,
      analysis,
    };
  }
  
  /**
   * Optimize configuration by testing variations
   */
  async optimizeConfiguration(params: OptimizationParams): Promise<OptimizationResult> {
    // Get base configuration
    const baseConfig = await this.configRepo.findByKey(params.baseConfigKey);
    if (!baseConfig) {
      throw new Error(`Base configuration ${params.baseConfigKey} not found`);
    }
    
    // Get test dataset
    const testData = await this.evalDatasetRepo.findMany({
      version: params.testDataVersion,
      split: params.testDataSplit || 'validation',
      limit: params.sampleSize || 100,
    });
    
    if (testData.length === 0) {
      throw new Error('No test data available for optimization');
    }
    
    // Generate configuration variations
    const variations = await this.generateVariations(baseConfig, params.variations);
    
    // Test each variation
    const results = [];
    for (const variation of variations) {
      const { score, error, rmse } = await this.testConfiguration(
        variation,
        testData
      );
      
      results.push({
        config: variation,
        score,
        error,
        rmse,
      });
    }
    
    // Sort by RMSE (lower is better)
    results.sort((a, b) => a.rmse - b.rmse);
    
    // Save the best configuration
    const bestVariation = results[0];
    const bestConfigKey = `${params.baseConfigKey}_optimized_${Date.now()}`;
    const bestConfig = await this.configRepo.create({
      key: bestConfigKey,
      model: bestVariation.config.model || baseConfig.model,
      temperature: bestVariation.config.temperature || baseConfig.temperature,
      promptId: bestVariation.config.promptId || baseConfig.promptId,
      maxTokens: bestVariation.config.maxTokens || baseConfig.maxTokens,
      description: `Optimized from ${params.baseConfigKey}`,
      metadata: {
        baseConfig: params.baseConfigKey,
        optimizationDate: new Date(),
        testDataVersion: params.testDataVersion,
        performance: {
          score: bestVariation.score,
          error: bestVariation.error,
          rmse: bestVariation.rmse,
        },
      },
    });
    
    // Update performance metrics
    await this.configRepo.updatePerformanceMetrics(
      bestConfigKey,
      bestVariation.score,
      false
    );
    
    return {
      bestConfig,
      results,
      recommendation: this.generateRecommendation(results, baseConfig),
    };
  }
  
  /**
   * Analyze prompt performance and suggest improvements
   */
  async analyzePromptPerformance(params: PromptImprovementParams): Promise<{
    currentPerformance: any;
    suggestions: string[];
    examples: Array<{
      input: string;
      currentScore: number;
      expectedScore: number;
      issue: string;
    }>;
  }> {
    // Get recent runs for the current prompt version
    const currentRuns = await this.runRepo.findMany({
      limit: 100,
    });
    
    // Get prompt by version
    const prompt = await this.promptService.getPrompt(params.currentVersion);
    if (!prompt) {
      throw new Error(`Prompt version ${params.currentVersion} not found`);
    }
    
    // Filter for runs with the current prompt
    const versionRuns = currentRuns.filter(
      r => r.configPromptId === prompt.id
    );
    
    // Get ground truth data from eval datasets
    const evalData = await this.evalDatasetRepo.findMany({
      limit: 100,
    });
    
    // Match runs with ground truth data
    const matched = versionRuns
      .map(run => {
        const groundTruth = evalData.find(
          e => e.inputContent === run.inputContent
        );
        return groundTruth ? {
          run,
          groundTruth: groundTruth.groundTruthScore,
          error: run.outputScore - groundTruth.groundTruthScore
        } : null;
      })
      .filter(Boolean) as Array<{
        run: any;
        groundTruth: number;
        error: number;
      }>;
    
    // Calculate performance metrics
    const avgError = matched.length > 0
      ? matched.reduce((sum, m) => sum + Math.abs(m.error), 0) / matched.length
      : 0;
    
    // Identify problematic examples
    const problems = matched
      .filter(m => Math.abs(m.error) > 0.2)
      .slice(0, 5)
      .map(m => ({
        input: m.run.inputContent.substring(0, 100) + '...',
        currentScore: m.run.outputScore,
        expectedScore: m.groundTruth,
        issue: this.identifyIssue(m.error),
      }));
    
    // Create performance stats
    const currentStats = {
      totalRuns: versionRuns.length,
      withGroundTruth: matched.length,
      averageError: avgError,
      rmse: matched.length > 0
        ? Math.sqrt(matched.reduce((sum, m) => sum + Math.pow(m.error, 2), 0) / matched.length)
        : 0,
    };
    
    // Generate improvement suggestions
    const suggestions = this.generatePromptSuggestions(
      currentStats,
      problems,
      params.analysisDepth
    );
    
    return {
      currentPerformance: currentStats,
      suggestions,
      examples: problems,
    };
  }
  
  /**
   * Run evaluation on the current configuration
   */
  async evaluateCurrentConfig(): Promise<{
    metrics: any;
    weaknesses: string[];
    strengths: string[];
  }> {
    // Get current default config
    const config = await this.configRepo.findDefault();
    if (!config) {
      throw new Error('No default configuration found');
    }
    
    // Get test dataset
    const testData = await this.evalDatasetRepo.findMany({
      split: 'test',
      limit: 50,
    });
    
    if (testData.length === 0) {
      throw new Error('No test data available for evaluation');
    }
    
    // Run evaluation
    const { score, error, rmse } = await this.testConfiguration(
      config,
      testData
    );
    
    // Update config metrics
    await this.configRepo.updatePerformanceMetrics(config.key, score);
    
    // Analyze strengths and weaknesses
    const analysis = await this.analyzePerformance(config, testData);
    
    return {
      metrics: {
        averageScore: score,
        averageError: error,
        rmse,
        samplesEvaluated: testData.length,
      },
      weaknesses: analysis.weaknesses,
      strengths: analysis.strengths,
    };
  }
  
  /**
   * Generate configuration variations for testing
   */
  private async generateVariations(
    baseConfig: Config,
    variations?: OptimizationParams['variations']
  ): Promise<Array<Partial<NewConfig>>> {
    const configs: Array<Partial<NewConfig>> = [];
    
    const models = variations?.models || [baseConfig.model];
    const temperatures = variations?.temperatures || [baseConfig.temperature];
    let promptIds = variations?.promptIds || [baseConfig.promptId];
    
    // Generate new prompts if requested
    if (variations?.generatePrompts && variations?.promptStrategies) {
      const newPromptIds = await this.generatePromptVariations(
        baseConfig.promptId,
        variations.promptStrategies
      );
      promptIds = [...promptIds, ...newPromptIds];
    }
    
    for (const model of models) {
      for (const temperature of temperatures) {
        for (const promptId of promptIds) {
          configs.push({
            model,
            temperature,
            promptId,
            maxTokens: baseConfig.maxTokens || undefined,
          });
        }
      }
    }
    
    return configs;
  }
  
  /**
   * Test a configuration against a dataset
   */
  private async testConfiguration(
    config: Partial<NewConfig> | Config,
    testData: EvalDataset[]
  ): Promise<{ score: number; error: number; rmse: number }> {
    let totalScore = 0;
    let totalError = 0;
    let totalSquaredError = 0;
    let count = 0;
    
    // Create temporary config
    const tempKey = `temp_${Date.now()}`;
    const tempConfig = await this.agentService.saveConfig(tempKey, config);
    
    try {
      for (const data of testData) {
        const result = await this.agentService.scoreContent(
          data.inputContent,
          { configKey: tempKey }
        );
        
        const error = result.score - data.groundTruthScore;
        
        totalScore += result.score;
        totalError += error;
        totalSquaredError += error * error;
        count++;
      }
    } finally {
      // Clean up temporary config
      await this.configRepo.deleteByKey(tempKey);
    }
    
    if (count === 0) return { score: 0, error: 0, rmse: 0 };
    
    return {
      score: totalScore / count,
      error: totalError / count,
      rmse: Math.sqrt(totalSquaredError / count),
    };
  }
  
  /**
   * Analyze performance for strengths and weaknesses
   */
  private async analyzePerformance(
    config: Config,
    testData: EvalDataset[]
  ): Promise<{ weaknesses: string[]; strengths: string[] }> {
    const weaknesses: string[] = [];
    const strengths: string[] = [];
    
    // Group errors by content type
    const errorsByType: Record<string, number[]> = {};
    
    for (const data of testData) {
      const result = await this.agentService.scoreContent(
        data.inputContent,
        { configKey: config.key }
      );
      
      const error = Math.abs(result.score - data.groundTruthScore);
      const type = data.inputType || 'general';
      
      if (!errorsByType[type]) errorsByType[type] = [];
      errorsByType[type].push(error);
    }
    
    // Analyze by type
    for (const [type, errors] of Object.entries(errorsByType)) {
      const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
      
      if (avgError > 0.2) {
        weaknesses.push(`High error rate for ${type} content (avg: ${avgError.toFixed(2)})`);
      } else if (avgError < 0.1) {
        strengths.push(`Excellent accuracy for ${type} content (avg: ${avgError.toFixed(2)})`);
      }
    }
    
    // Analyze by score range
    const lowScoreErrors = testData
      .filter(d => d.groundTruthScore < 0.3)
      .length;
    
    const highScoreErrors = testData
      .filter(d => d.groundTruthScore > 0.7)
      .length;
    
    if (lowScoreErrors > testData.length * 0.3) {
      weaknesses.push('Struggles with low-quality content identification');
    }
    
    if (highScoreErrors > testData.length * 0.3) {
      weaknesses.push('Overscores content (too generous)');
    }
    
    return { weaknesses, strengths };
  }
  
  /**
   * Generate recommendation based on optimization results
   */
  private generateRecommendation(
    results: OptimizationResult['results'],
    baseConfig: Config
  ): string {
    const best = results[0];
    const baseline = results.find(r => 
      r.config.model === baseConfig.model &&
      r.config.temperature === baseConfig.temperature &&
      r.config.promptId === baseConfig.promptId
    );
    
    if (!baseline) {
      return `Best configuration: ${JSON.stringify(best.config)} with RMSE: ${best.rmse.toFixed(3)}`;
    }
    
    const improvement = ((baseline.rmse - best.rmse) / baseline.rmse) * 100;
    
    if (improvement > 10) {
      return `Significant improvement found! New configuration reduces error by ${improvement.toFixed(1)}%. Consider adopting: ${JSON.stringify(best.config)}`;
    } else if (improvement > 0) {
      return `Minor improvement found (${improvement.toFixed(1)}% error reduction). Current configuration is reasonably optimized.`;
    } else {
      return 'Current configuration is already optimal for the test dataset.';
    }
  }
  
  /**
   * Generate prompt variations using AI
   */
  private async generatePromptVariations(
    basePromptId: string,
    strategies: PromptGenerationStrategy[]
  ): Promise<string[]> {
    const generatedPromptIds: string[] = [];
    
    for (const strategy of strategies) {
      try {
        const newPrompt = await this.promptService.generateVariation(
          basePromptId,
          strategy,
          this.agentService
        );
        generatedPromptIds.push(newPrompt.id);
      } catch (error) {
        console.warn(`Failed to generate prompt variation with strategy ${strategy.type}:`, error);
      }
    }
    
    return generatedPromptIds;
  }
  
  /**
   * Identify the issue type based on error
   */
  private identifyIssue(error: number): string {
    if (error > 0.3) return 'Significant overscoring';
    if (error > 0.1) return 'Mild overscoring';
    if (error < -0.3) return 'Significant underscoring';
    if (error < -0.1) return 'Mild underscoring';
    return 'Minor deviation';
  }
  
  /**
   * Generate prompt improvement suggestions
   */
  private generatePromptSuggestions(
    stats: any,
    problems: any[],
    depth?: 'basic' | 'detailed'
  ): string[] {
    const suggestions: string[] = [];
    
    // Basic suggestions
    if (stats.averageError > 0.1) {
      suggestions.push('Prompt tends to overscore - consider adding stricter criteria');
    }
    
    if (stats.averageError < -0.1) {
      suggestions.push('Prompt tends to underscore - consider relaxing criteria');
    }
    
    if (stats.rmse > 0.2) {
      suggestions.push('High variance in scoring - prompt may need clearer guidelines');
    }
    
    // Detailed suggestions
    if (depth === 'detailed') {
      const issueTypes = problems.map(p => p.issue);
      const uniqueIssues = [...new Set(issueTypes)];
      
      for (const issue of uniqueIssues) {
        const count = issueTypes.filter(i => i === issue).length;
        if (count >= 2) {
          suggestions.push(`Multiple instances of ${issue} detected - review scoring criteria`);
        }
      }
      
      suggestions.push('Consider adding examples of edge cases to the prompt');
      suggestions.push('Review dimension weights and their impact on final score');
    }
    
    return suggestions;
  }
}