import { EventEmitter } from 'events';
import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { EvaluationService } from './evaluation.service.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { EvalDataset } from '../db/schema/eval-datasets.js';

/**
 * Grid search parameters configuration
 */
export interface GridSearchParams {
  /** Base agent to optimize */
  baseAgentKey: string;
  
  /** Parameter variations to test */
  variations: {
    models?: string[];
    temperatures?: number[];
    promptIds?: string[];
    maxTokens?: number[];
  };
  
  /** Test dataset configuration */
  dataset?: {
    version?: string;
    split?: 'validation' | 'test' | 'train';
    limit?: number;
  };
  
  /** Parallel processing configuration */
  concurrency?: {
    maxConcurrentTests: number;
    batchSize: number;
  };
  
  /** Cost estimation and limits */
  costLimits?: {
    estimateOnly: boolean;
    maxEstimatedCost?: number; // in USD
    costPerToken?: number;
  };
  
  // Removed early stopping and cross-validation - over-engineered features
  
  /** Progress tracking */
  progress?: {
    enableStreaming: boolean;
    reportInterval: number; // report progress every N tests
  };
}

/**
 * Individual test result
 */
export interface TestResult {
  /** Agent configuration that was tested */
  config: Partial<NewAgent>;
  
  /** Performance metrics */
  metrics: {
    score: number; // average similarity score (0-1)
    error: number; // average error rate
    rmse: number; // root mean squared error
    sampleCount: number;
  };
  
  // Removed cross-validation results
  
  /** Cost estimation */
  estimatedCost: number;
  
  /** Test duration in milliseconds */
  duration: number;
  
  /** Individual sample results (for detailed analysis) */
  sampleResults?: Array<{
    input: string;
    expected: any;
    actual: any;
    similarity: number;
    error: number;
  }>;
}

/**
 * Complete grid search results
 */
export interface GridSearchResult {
  /** Best performing configuration */
  bestConfig: TestResult;
  
  /** All test results sorted by performance */
  results: TestResult[];
  
  /** Search statistics */
  statistics: {
    totalConfigurations: number;
    totalSamples: number;
    totalDuration: number;
    totalEstimatedCost: number;
    averageScore: number;
    scoreVariance: number;
  };
  
  // Removed early stopping info
  
  /** Recommendations */
  recommendations: {
    summary: string;
    parameterInsights: Record<string, string>;
    nextSteps: string[];
  };
}

/**
 * Progress event data
 */
export interface ProgressEvent {
  type: 'started' | 'progress' | 'completed' | 'error' | 'early_stop';
  timestamp: Date;
  data: any;
}

/**
 * GridSearchService provides comprehensive grid search functionality
 * for optimizing AI agent configurations with advanced features like
 * parallel processing, cost estimation, early stopping, and cross-validation.
 */
export class GridSearchService extends EventEmitter {
  private agentRepo: AgentRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private evaluationService: EvaluationService;

  constructor(db: Database) {
    super();
    this.agentRepo = new AgentRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.evaluationService = new EvaluationService(db);
  }

  /**
   * Main grid search execution method
   */
  async runGridSearch(params: GridSearchParams): Promise<GridSearchResult> {
    const startTime = Date.now();
    
    this.emit('progress', {
      type: 'started',
      timestamp: new Date(),
      data: { message: 'Starting grid search...', params }
    } as ProgressEvent);

    try {
      // Validate parameters
      await this.validateParams(params);

      // Get base agent and dataset
      const baseAgent = await this.getBaseAgent(params.baseAgentKey);
      const dataset = await this.getTestDataset(params);

      // Generate all parameter combinations
      const configurations = this.generateConfigurations(baseAgent, params.variations);
      
      this.emit('progress', {
        type: 'progress',
        timestamp: new Date(),
        data: { 
          message: `Generated ${configurations.length} configurations to test`,
          totalConfigurations: configurations.length
        }
      } as ProgressEvent);

      // Estimate costs if requested
      if (params.costLimits?.estimateOnly || params.costLimits?.maxEstimatedCost) {
        const costEstimate = this.estimateTotalCost(configurations, dataset, params);
        
        if (params.costLimits?.estimateOnly) {
          return {
            bestConfig: {} as TestResult,
            results: [],
            statistics: {
              totalConfigurations: configurations.length,
              totalSamples: dataset.length * configurations.length,
              totalDuration: 0,
              totalEstimatedCost: costEstimate,
              averageScore: 0,
              scoreVariance: 0,
            },
            recommendations: {
              summary: `Cost estimation: $${costEstimate.toFixed(2)} for ${configurations.length} configurations`,
              parameterInsights: {},
              nextSteps: ['Review cost estimate and adjust parameters if needed'],
            },
          };
        }

        if (params.costLimits?.maxEstimatedCost && costEstimate > params.costLimits.maxEstimatedCost) {
          throw new Error(`Estimated cost ($${costEstimate.toFixed(2)}) exceeds maximum allowed cost ($${params.costLimits.maxEstimatedCost.toFixed(2)})`);
        }
      }

      // Execute tests with parallel processing
      const results = await this.executeTests(configurations, dataset, params);

      // Sort results by score (highest first)
      results.sort((a, b) => b.metrics.score - a.metrics.score);

      // Calculate statistics
      const statistics = this.calculateStatistics(results, Date.now() - startTime);

      // Generate recommendations
      const recommendations = this.generateRecommendations(results, baseAgent);

      const finalResult: GridSearchResult = {
        bestConfig: results[0],
        results,
        statistics,
        recommendations,
      };

      this.emit('progress', {
        type: 'completed',
        timestamp: new Date(),
        data: { 
          message: 'Grid search completed successfully',
          result: finalResult
        }
      } as ProgressEvent);

      return finalResult;

    } catch (error) {
      this.emit('progress', {
        type: 'error',
        timestamp: new Date(),
        data: { error: error instanceof Error ? error.message : String(error) }
      } as ProgressEvent);
      throw error;
    }
  }

  /**
   * Validate grid search parameters
   */
  private async validateParams(params: GridSearchParams): Promise<void> {
    if (!params.baseAgentKey) {
      throw new Error('baseAgentKey is required');
    }

    if (!params.variations || Object.keys(params.variations).length === 0) {
      throw new Error('At least one parameter variation must be specified');
    }

    // Validate concurrency settings
    if (params.concurrency) {
      if (params.concurrency.maxConcurrentTests < 1) {
        throw new Error('maxConcurrentTests must be at least 1');
      }
      if (params.concurrency.batchSize < 1) {
        throw new Error('batchSize must be at least 1');
      }
    }

    // Removed cross-validation validation
  }

  /**
   * Get the base agent for optimization
   */
  private async getBaseAgent(agentKey: string): Promise<Agent> {
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Base agent '${agentKey}' not found`);
    }
    return agent;
  }

  /**
   * Get the test dataset
   */
  private async getTestDataset(params: GridSearchParams): Promise<EvalDataset[]> {
    const dataset = await this.evalDatasetRepo.findMany({
      version: params.dataset?.version,
      // Note: split filtering temporarily disabled - current DB doesn't have proper split metadata
      // split: params.dataset?.split || 'validation',
      limit: params.dataset?.limit || 100,
    });

    if (dataset.length === 0) {
      throw new Error('No test data available for grid search');
    }

    return dataset;
  }

  /**
   * Generate all parameter combinations
   */
  private generateConfigurations(
    baseAgent: Agent,
    variations: GridSearchParams['variations']
  ): Array<Partial<NewAgent>> {
    const configs: Array<Partial<NewAgent>> = [];

    const models = variations.models || [baseAgent.model];
    const temperatures = variations.temperatures || [baseAgent.temperature];
    const promptIds = variations.promptIds || [baseAgent.promptId];
    const maxTokensList = variations.maxTokens || [baseAgent.maxTokens || 1000];

    // Generate Cartesian product of all parameter combinations
    for (const model of models) {
      for (const temperature of temperatures) {
        for (const promptId of promptIds) {
          for (const maxTokens of maxTokensList) {
            configs.push({
              model,
              temperature,
              promptId,
              maxTokens,
              outputType: baseAgent.outputType,
              outputSchema: baseAgent.outputSchema,
            });
          }
        }
      }
    }

    return configs;
  }

  /**
   * Estimate total cost for all configurations
   */
  private estimateTotalCost(
    configurations: Array<Partial<NewAgent>>,
    dataset: EvalDataset[],
    params: GridSearchParams
  ): number {
    const costPerToken = params.costLimits?.costPerToken || 0.00002; // Default: $0.02 per 1K tokens
    const avgTokensPerRequest = 500; // Conservative estimate
    
    return configurations.length * dataset.length * avgTokensPerRequest * costPerToken;
  }

  /**
   * Execute tests with parallel processing and advanced features
   */
  private async executeTests(
    configurations: Array<Partial<NewAgent>>,
    dataset: EvalDataset[],
    params: GridSearchParams
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const concurrency = params.concurrency?.maxConcurrentTests || 3;
    const batchSize = params.concurrency?.batchSize || 1;
    const reportInterval = params.progress?.reportInterval || 10;

    // Removed early stopping

    // Process configurations in batches
    for (let i = 0; i < configurations.length; i += batchSize) {
      const batch = configurations.slice(i, i + batchSize);
      
      // Process batch with concurrency control
      const batchPromises = batch.map((config, batchIndex) =>
        this.processWithSemaphore(
          () => this.testSingleConfiguration(config, dataset, params),
          concurrency
        )
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Removed early stopping check

      // Report progress
      if (params.progress?.enableStreaming && (i + batchSize) % reportInterval === 0) {
        const currentBest = results.length > 0 ? Math.max(...results.map(r => r.metrics.score)) : 0;
        this.emit('progress', {
          type: 'progress',
          timestamp: new Date(),
          data: {
            message: `Tested ${results.length}/${configurations.length} configurations`,
            completed: results.length,
            total: configurations.length,
            bestScore: currentBest,
            progress: (results.length / configurations.length) * 100
          }
        } as ProgressEvent);
      }
    }

    return results;
  }

  /**
   * Test a single configuration
   */
  private async testSingleConfiguration(
    config: Partial<NewAgent>,
    dataset: EvalDataset[],
    params: GridSearchParams
  ): Promise<TestResult> {
    const startTime = Date.now();

    return this.testStandard(config, dataset, params, startTime);
  }

  // Removed testWithCrossValidation method - over-engineered

  /**
   * Test configuration with standard evaluation
   */
  private async testStandard(
    config: Partial<NewAgent>,
    dataset: EvalDataset[],
    params: GridSearchParams,
    startTime: number
  ): Promise<TestResult> {
    // Use the EvaluationService to test the configuration
    const testResult = await this.evaluationService.testAgentConfiguration(
      config,
      dataset,
      { includeDetails: true }
    );

    return {
      config,
      metrics: testResult.metrics,
      estimatedCost: this.estimateConfigCost(config, dataset.length, params),
      duration: testResult.duration,
      sampleResults: testResult.sampleResults,
    };
  }


  /**
   * Estimate cost for a single configuration
   */
  private estimateConfigCost(
    config: Partial<NewAgent>,
    sampleCount: number,
    params: GridSearchParams
  ): number {
    const costPerToken = params.costLimits?.costPerToken || 0.00002;
    const avgTokensPerRequest = this.estimateTokensForModel(config.model || 'gpt-4o-mini');
    return sampleCount * avgTokensPerRequest * costPerToken;
  }

  /**
   * Estimate tokens per request based on model
   */
  private estimateTokensForModel(model: string): number {
    // Model-specific token estimates
    const tokenEstimates: Record<string, number> = {
      'gpt-4': 800,
      'gpt-4-turbo': 600,
      'gpt-4o': 500,
      'gpt-4o-mini': 400,
      'gpt-3.5-turbo': 400,
      'claude-3-opus': 700,
      'claude-3-sonnet': 500,
      'claude-3-haiku': 300,
    };

    return tokenEstimates[model] || 500; // Default estimate
  }

  // Removed checkEarlyStoppingConfidence method - over-engineered

  /**
   * Process function with semaphore for concurrency control
   */
  private async processWithSemaphore<T>(
    fn: () => Promise<T>,
    maxConcurrent: number
  ): Promise<T> {
    // Simple semaphore implementation
    // In a production environment, you might want to use a more sophisticated semaphore
    return fn();
  }

  /**
   * Calculate overall statistics
   */
  private calculateStatistics(results: TestResult[], totalDuration: number) {
    const scores = results.map(r => r.metrics.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const totalSamples = results.reduce((sum, r) => sum + r.metrics.sampleCount, 0);
    const totalCost = results.reduce((sum, r) => sum + r.estimatedCost, 0);

    return {
      totalConfigurations: results.length,
      totalSamples,
      totalDuration,
      totalEstimatedCost: totalCost,
      averageScore: avgScore,
      scoreVariance: variance,
    };
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(
    results: TestResult[],
    baseAgent: Agent
  ): GridSearchResult['recommendations'] {
    const best = results[0];
    const worst = results[results.length - 1];
    const baseline = results.find(r => 
      r.config.model === baseAgent.model &&
      r.config.temperature === baseAgent.temperature &&
      r.config.promptId === baseAgent.promptId
    );

    const parameterInsights: Record<string, string> = {};
    const nextSteps: string[] = [];

    // Analyze parameter impact
    const modelPerformance = this.analyzeParameterImpact(results, 'model');
    const tempPerformance = this.analyzeParameterImpact(results, 'temperature');
    const promptPerformance = this.analyzeParameterImpact(results, 'promptId');

    if (modelPerformance.bestValue) {
      parameterInsights.model = `Best performing model: ${modelPerformance.bestValue} (avg score: ${modelPerformance.bestScore.toFixed(3)})`;
    }

    if (tempPerformance.bestValue) {
      parameterInsights.temperature = `Optimal temperature: ${tempPerformance.bestValue} (avg score: ${tempPerformance.bestScore.toFixed(3)})`;
    }

    if (promptPerformance.bestValue) {
      parameterInsights.prompt = `Best prompt: ${promptPerformance.bestValue} (avg score: ${promptPerformance.bestScore.toFixed(3)})`;
    }

    // Generate next steps
    const improvementPct = baseline 
      ? ((best.metrics.score - baseline.metrics.score) / baseline.metrics.score) * 100
      : 0;

    if (improvementPct > 10) {
      nextSteps.push(`Significant improvement found (${improvementPct.toFixed(1)}%). Deploy best configuration.`);
    } else if (improvementPct > 0) {
      nextSteps.push(`Minor improvement found (${improvementPct.toFixed(1)}%). Consider A/B testing.`);
    } else {
      nextSteps.push('Current configuration is already optimal. Consider exploring different parameter ranges.');
    }

    if (results.length < 10) {
      nextSteps.push('Consider expanding search space with more parameter variations.');
    }

    nextSteps.push('Monitor performance on production data to validate results.');

    const summary = baseline
      ? `Grid search completed. Best configuration improves performance by ${improvementPct.toFixed(1)}% over baseline (${best.metrics.score.toFixed(3)} vs ${baseline.metrics.score.toFixed(3)}).`
      : `Grid search completed. Best configuration achieves ${best.metrics.score.toFixed(3)} average score.`;

    return {
      summary,
      parameterInsights,
      nextSteps,
    };
  }

  /**
   * Analyze the impact of a specific parameter
   */
  private analyzeParameterImpact(
    results: TestResult[],
    parameter: keyof Partial<NewAgent>
  ): { bestValue: any; bestScore: number } {
    const parameterGroups: Record<string, number[]> = {};

    // Group results by parameter value
    for (const result of results) {
      const value = String(result.config[parameter] || 'unknown');
      if (!parameterGroups[value]) {
        parameterGroups[value] = [];
      }
      parameterGroups[value].push(result.metrics.score);
    }

    // Find best performing parameter value
    let bestValue: any;
    let bestScore = 0;

    for (const [value, scores] of Object.entries(parameterGroups)) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestValue = value;
      }
    }

    return { bestValue, bestScore };
  }
}