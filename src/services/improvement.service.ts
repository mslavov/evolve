import { EventEmitter } from 'events';
import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import type { PromptGenerationStrategy } from './prompt.service.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';

// Import specialized services
import { GridSearchService, type GridSearchParams } from './grid-search.service.js';
import {
  IterativeOptimizationService,
  type IterativeOptimizationParams
} from './iterative-optimization.service.js';
import { CostTrackerService, type BudgetConfig } from './cost-tracker.service.js';

// Legacy interfaces for backward compatibility
export interface OptimizationParams {
  baseAgentKey: string; // Agent to optimize
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
  bestAgent: Agent;
  results: Array<{
    agent: Partial<NewAgent>;
    score: number;
    error: number;
    rmse: number;
  }>;
  recommendation: string;
}

/**
 * ImprovementService - Main orchestrator for agent optimization
 * 
 * This service provides two optimization approaches:
 * 1. Grid Search (optimizeConfiguration) - Parameter exploration
 * 2. Iterative Optimization (runIterativeOptimization) - Research-driven improvement
 * 
 * Features:
 * - Budget enforcement with default $10 limit
 * - Real-time progress events
 * - Cost tracking and estimation
 */
export class ImprovementService extends EventEmitter {
  private agentRepo: AgentRepository;
  private gridSearchService: GridSearchService;
  private iterativeOptimizationService: IterativeOptimizationService;
  private costTrackerService: CostTrackerService;

  constructor(db: Database) {
    super();
    this.agentRepo = new AgentRepository(db);
    this.gridSearchService = new GridSearchService(db);
    this.iterativeOptimizationService = new IterativeOptimizationService(db);
    this.costTrackerService = new CostTrackerService(db);

    this.setupProgressForwarding();
  }

  /**
   * Configure budget controls
   */
  configureBudget(config: BudgetConfig): void {
    this.costTrackerService.configureBudget(config);
  }

  /**
   * Get current budget configuration
   */
  getBudgetConfig(): BudgetConfig | null {
    return this.costTrackerService.getBudgetConfig();
  }

  /**
   * Legacy method: Grid search optimization with budget enforcement
   */
  async optimizeConfiguration(params: OptimizationParams & { noBudget?: boolean; maxBudget?: number }): Promise<OptimizationResult> {
    console.log('[Cost Estimation] Total estimated cost: $' + (0.012 * (params.variations?.models?.length || 1) * (params.variations?.temperatures?.length || 1)).toFixed(4));
    console.log('💰 Estimated cost: $' + (0.012 * (params.variations?.models?.length || 1) * (params.variations?.temperatures?.length || 1)).toFixed(4));

    // Budget enforcement (default: $10 limit)
    const maxBudget = params.maxBudget ?? 10.00;

    if (!params.noBudget) {
      // Estimate cost first
      const estimate = await this.costTrackerService.estimateGridSearchCost({
        baseAgentKey: params.baseAgentKey,
        variations: params.variations || {},
        dataset: { limit: params.sampleSize || 100 },
      });

      // Check budget before proceeding
      const budgetCheck = await this.costTrackerService.checkBudgetBeforeOperation(
        estimate.totalCost,
        'grid-search'
      );

      if (!budgetCheck.allowed) {
        throw new Error(`Operation blocked: ${budgetCheck.reason}`);
      }

      // Emit budget alerts
      for (const alert of budgetCheck.alerts) {
        this.emit('budget_alert', alert);
      }

      if (estimate.totalCost > maxBudget) {
        throw new Error(`Estimated cost ($${estimate.totalCost.toFixed(2)}) exceeds budget limit ($${maxBudget.toFixed(2)})`);
      }
    }

    console.log('[GridSearch] Starting grid search...');
    console.log('[GridSearch]', params);

    const agent = await this.agentRepo.findByKey(params.baseAgentKey);
    if (!agent) {
      throw new Error(`Agent '${params.baseAgentKey}' not found`);
    }

    const gridParams: GridSearchParams = {
      baseAgentKey: params.baseAgentKey,
      variations: params.variations || {},
      dataset: {
        version: params.testDataVersion,
        split: params.testDataSplit || 'validation',
        limit: params.sampleSize || 100,
      },
      progress: {
        enableStreaming: true,
        reportInterval: 10,
      },
    };

    const gridResult = await this.gridSearchService.runGridSearch(gridParams);

    // Convert to legacy format
    const results = gridResult.results.map(r => ({
      agent: r.config,
      score: r.metrics.score,
      error: r.metrics.error,
      rmse: r.metrics.rmse,
    }));

    const bestResult = results[0];
    const bestAgent = await this.agentRepo.create({
      key: `${agent.key}_optimized_${Date.now()}`,
      name: `Optimized from ${agent.name}`,
      type: agent.type,
      model: bestResult.agent.model || agent.model,
      temperature: bestResult.agent.temperature || agent.temperature,
      promptId: bestResult.agent.promptId || agent.promptId,
      maxTokens: bestResult.agent.maxTokens || agent.maxTokens,
      outputType: bestResult.agent.outputType || agent.outputType,
      outputSchema: bestResult.agent.outputSchema || agent.outputSchema,
      description: `Optimized from ${agent.key} using grid search`,
    });

    await this.agentRepo.updatePerformanceMetrics(bestAgent.key, bestResult.score, false);

    return {
      bestAgent,
      results,
      recommendation: gridResult.recommendations.summary,
    };
  }

  /**
   * Legacy method: Iterative optimization with budget enforcement
   */
  async runIterativeOptimization(params: {
    baseAgentKey: string;
    targetScore?: number;
    maxIterations?: number;
    evaluationStrategy?: string;
    enableResearch?: boolean;
    verbose?: boolean;
    noBudget?: boolean;
    maxBudget?: number;
  }): Promise<{
    finalAgent?: Agent;
    finalScore?: number;
    iterations?: Array<{ score?: number; improvements?: string[] }>;
    converged: boolean;
    reason?: string;
    recommendations?: string[];
  }> {
    console.log('[Iterative] Starting iterative optimization...');

    // Budget enforcement (default: $10 limit)
    const maxBudget = params.maxBudget ?? 10.00;

    if (!params.noBudget) {
      // Estimate cost first
      const estimate = await this.costTrackerService.estimateIterativeOptimizationCost({
        baseAgentKey: params.baseAgentKey,
        objectives: [{
          id: 'performance',
          name: 'Overall Performance',
          description: 'General agent performance',
          weight: 1.0,
          target: params.targetScore || 0.9,
          higherIsBetter: true,
        }],
        maxIterations: params.maxIterations || 10,
        enableResearch: params.enableResearch,
      });

      // Check budget before proceeding
      const budgetCheck = await this.costTrackerService.checkBudgetBeforeOperation(
        estimate.totalCost,
        'iterative-optimization'
      );

      if (!budgetCheck.allowed) {
        throw new Error(`Operation blocked: ${budgetCheck.reason}`);
      }

      // Emit budget alerts
      for (const alert of budgetCheck.alerts) {
        this.emit('budget_alert', alert);
      }

      if (estimate.totalCost > maxBudget) {
        throw new Error(`Estimated cost ($${estimate.totalCost.toFixed(2)}) exceeds budget limit ($${maxBudget.toFixed(2)})`);
      }
    }

    const iterativeParams: IterativeOptimizationParams = {
      baseAgentKey: params.baseAgentKey,
      objectives: [{
        id: 'performance',
        name: 'Overall Performance',
        description: 'General agent performance',
        weight: 1.0,
        target: params.targetScore || 0.9,
        higherIsBetter: true,
      }],
      maxIterations: params.maxIterations || 10,
      enableResearch: params.enableResearch || false,
      verbose: params.verbose,
    };

    const result = await this.iterativeOptimizationService.optimize(iterativeParams);

    // Convert to expected format
    const iterations = result.history.map(step => ({
      score: step.overallScore,
      improvements: Object.keys(step.improvements || {}),
    }));

    const recommendations: string[] = [];
    if (result.converged) {
      recommendations.push('Optimization converged successfully');
    }
    if (result.finalOverallScore > 0.9) {
      recommendations.push('Excellent performance achieved');
    }
    if (result.researchInsights.length > 0) {
      recommendations.push(`${result.researchInsights.length} research insights discovered`);
    }

    return {
      finalAgent: result.finalConfig,
      finalScore: result.finalOverallScore,
      iterations,
      converged: result.converged,
      reason: result.stoppedReason,
      recommendations,
    };
  }

  // Private helper methods

  private setupProgressForwarding(): void {
    // Forward progress events from sub-services
    this.gridSearchService.on('progress', (event: any) => {
      this.emit('progress', {
        type: 'grid_progress',
        data: event.data
      });
    });

    // IterativeOptimizationService doesn't emit progress events directly
    // Would need to be added if progress tracking is needed

    this.costTrackerService.on('budget_alert', (alert: any) => {
      this.emit('budget_alert', alert);
    });

    this.costTrackerService.on('cost_estimated', (estimation: any) => {
      this.emit('cost_estimated', estimation);
    });
  }
}