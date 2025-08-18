import { Database } from '../db/client.js';
import { EventEmitter } from 'events';
import type { GridSearchParams, TestResult } from './grid-search.service.js';
import type { IterativeOptimizationParams, IterativeOptimizationStep } from './iterative-optimization.service.js';

/**
 * Model pricing information for different AI providers
 */
export interface ModelPricing {
  /** Model identifier */
  model: string;
  /** Provider name (openai, anthropic, etc.) */
  provider: string;
  /** Input token price per 1K tokens in USD */
  inputPricePer1K: number;
  /** Output token price per 1K tokens in USD */
  outputPricePer1K: number;
  /** Maximum tokens supported by the model */
  maxTokens: number;
  /** Whether the model supports function calling */
  supportsFunctionCalling: boolean;
  /** Additional notes about pricing or limitations */
  notes?: string;
}

/**
 * Real-time cost tracking data for a single operation
 */
export interface CostTrackingEntry {
  /** Unique identifier for this cost entry */
  id: string;
  /** Session or operation identifier */
  sessionId: string;
  /** Timestamp of the operation */
  timestamp: Date;
  /** Model used for the operation */
  model: string;
  /** Provider name */
  provider: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Cost for input tokens in USD */
  inputCost: number;
  /** Cost for output tokens in USD */
  outputCost: number;
  /** Total cost in USD */
  totalCost: number;
  /** Operation type (grid-search, iterative-optimization, single-run, etc.) */
  operationType: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Budget control configuration
 */
export interface BudgetConfig {
  /** Daily spending limit in USD */
  dailyLimit?: number;
  /** Weekly spending limit in USD */
  weeklyLimit?: number;
  /** Monthly spending limit in USD */
  monthlyLimit?: number;
  /** Per-session spending limit in USD */
  sessionLimit?: number;
  /** Per-operation spending limit in USD */
  operationLimit?: number;
  /** Warning threshold (percentage of limit) */
  warningThreshold: number; // 0.8 = 80% warning
  /** Whether to block operations when limit is exceeded */
  enforceHardLimits: boolean;
  /** Email addresses to notify when thresholds are reached */
  notificationEmails?: string[];
}

/**
 * Cost estimation for planned operations
 */
export interface CostEstimation {
  /** Estimated total cost in USD */
  totalCost: number;
  /** Breakdown by model */
  modelBreakdown: Record<string, {
    estimatedTokens: number;
    estimatedCost: number;
    operations: number;
  }>;
  /** Estimated duration of operations */
  estimatedDuration: number;
  /** Cost range (min, max) accounting for variability */
  costRange: {
    min: number;
    max: number;
  };
  /** Confidence level of the estimation */
  confidence: number; // 0-1
  /** Assumptions used in the estimation */
  assumptions: string[];
}

/**
 * Budget alert information
 */
export interface BudgetAlert {
  /** Alert type */
  type: 'warning' | 'limit_exceeded' | 'daily_limit' | 'weekly_limit' | 'monthly_limit' | 'session_limit';
  /** Current spending amount */
  currentSpending: number;
  /** Limit that was approached or exceeded */
  limit: number;
  /** Percentage of limit reached */
  percentage: number;
  /** Time period for the alert */
  period: 'day' | 'week' | 'month' | 'session' | 'operation';
  /** Timestamp of the alert */
  timestamp: Date;
  /** Additional context */
  message: string;
}

/**
 * Cost analytics and reporting data
 */
export interface CostAnalytics {
  /** Total spending by time period */
  spendingByPeriod: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    last30Days: number;
  };
  /** Spending breakdown by model */
  spendingByModel: Record<string, number>;
  /** Spending breakdown by operation type */
  spendingByOperation: Record<string, number>;
  /** Spending breakdown by provider */
  spendingByProvider: Record<string, number>;
  /** Average cost per operation */
  averageCostPerOperation: Record<string, number>;
  /** Token usage statistics */
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    averageTokensPerOperation: number;
  };
  /** Cost efficiency metrics */
  efficiency: {
    costPerSuccessfulOperation: number;
    tokenEfficiencyRatio: number; // output tokens / input tokens
    costTrends: Array<{
      date: string;
      dailyCost: number;
      operationCount: number;
    }>;
  };
  /** Projected monthly spending based on current usage */
  projectedMonthlySpending: number;
}

/**
 * Events emitted by the CostTrackerService
 */
export interface CostTrackerEvents {
  /** Cost tracking entry added */
  'cost_logged': CostTrackingEntry;
  /** Budget alert triggered */
  'budget_alert': BudgetAlert;
  /** Cost estimation completed */
  'cost_estimated': CostEstimation;
  /** Daily/weekly/monthly summary available */
  'cost_summary': CostAnalytics;
}

/**
 * Comprehensive cost tracking and budget management service for AI operations
 */
export class CostTrackerService extends EventEmitter {
  private costEntries: Map<string, CostTrackingEntry> = new Map();
  private budgetConfig: BudgetConfig | null = null;
  
  // Model pricing database with current rates (as of 2024)
  private readonly modelPricing: Map<string, ModelPricing> = new Map([
    // OpenAI Models
    ['gpt-4o', {
      model: 'gpt-4o',
      provider: 'openai',
      inputPricePer1K: 0.0025,
      outputPricePer1K: 0.01,
      maxTokens: 128000,
      supportsFunctionCalling: true,
    }],
    ['gpt-4o-mini', {
      model: 'gpt-4o-mini',
      provider: 'openai',
      inputPricePer1K: 0.00015,
      outputPricePer1K: 0.0006,
      maxTokens: 128000,
      supportsFunctionCalling: true,
    }],
    ['gpt-4-turbo', {
      model: 'gpt-4-turbo',
      provider: 'openai',
      inputPricePer1K: 0.01,
      outputPricePer1K: 0.03,
      maxTokens: 128000,
      supportsFunctionCalling: true,
    }],
    ['gpt-4', {
      model: 'gpt-4',
      provider: 'openai',
      inputPricePer1K: 0.03,
      outputPricePer1K: 0.06,
      maxTokens: 8192,
      supportsFunctionCalling: true,
    }],
    ['gpt-3.5-turbo', {
      model: 'gpt-3.5-turbo',
      provider: 'openai',
      inputPricePer1K: 0.0005,
      outputPricePer1K: 0.0015,
      maxTokens: 16385,
      supportsFunctionCalling: true,
    }],
    ['o1-preview', {
      model: 'o1-preview',
      provider: 'openai',
      inputPricePer1K: 0.015,
      outputPricePer1K: 0.06,
      maxTokens: 128000,
      supportsFunctionCalling: false,
      notes: 'Reasoning model with higher costs'
    }],
    ['o1-mini', {
      model: 'o1-mini',
      provider: 'openai',
      inputPricePer1K: 0.003,
      outputPricePer1K: 0.012,
      maxTokens: 128000,
      supportsFunctionCalling: false,
      notes: 'Smaller reasoning model'
    }],
    
    // Anthropic Models
    ['claude-3-5-sonnet-20241022', {
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      inputPricePer1K: 0.003,
      outputPricePer1K: 0.015,
      maxTokens: 200000,
      supportsFunctionCalling: true,
    }],
    ['claude-3-5-haiku-20241022', {
      model: 'claude-3-5-haiku-20241022',
      provider: 'anthropic',
      inputPricePer1K: 0.0008,
      outputPricePer1K: 0.004,
      maxTokens: 200000,
      supportsFunctionCalling: true,
    }],
    ['claude-3-opus-20240229', {
      model: 'claude-3-opus-20240229',
      provider: 'anthropic',
      inputPricePer1K: 0.015,
      outputPricePer1K: 0.075,
      maxTokens: 200000,
      supportsFunctionCalling: true,
    }],
    ['claude-3-sonnet-20240229', {
      model: 'claude-3-sonnet-20240229',
      provider: 'anthropic',
      inputPricePer1K: 0.003,
      outputPricePer1K: 0.015,
      maxTokens: 200000,
      supportsFunctionCalling: true,
    }],
    ['claude-3-haiku-20240307', {
      model: 'claude-3-haiku-20240307',
      provider: 'anthropic',
      inputPricePer1K: 0.00025,
      outputPricePer1K: 0.00125,
      maxTokens: 200000,
      supportsFunctionCalling: true,
    }],
  ]);

  constructor(private db: Database) {
    super();
    this.setupEventHandlers();
  }

  /**
   * Configure budget controls and alerts
   */
  configureBudget(config: BudgetConfig): void {
    this.budgetConfig = config;
    this.emit('budget_configured', config);
  }

  /**
   * Get current budget configuration
   */
  getBudgetConfig(): BudgetConfig | null {
    return this.budgetConfig;
  }

  /**
   * Add or update model pricing information
   */
  // Removed updateModelPricing - not used

  /**
   * Get pricing information for a specific model
   */
  getModelPricing(model: string): ModelPricing | null {
    return this.modelPricing.get(model) || null;
  }

  /**
   * Get all supported models and their pricing
   */
  getAllModelPricing(): ModelPricing[] {
    return Array.from(this.modelPricing.values());
  }

  /**
   * Estimate cost for grid search operations
   */
  async estimateGridSearchCost(params: GridSearchParams): Promise<CostEstimation> {
    const { baseAgentKey, variations, dataset, concurrency } = params;

    // Calculate total number of configurations
    const modelCount = variations.models?.length || 1;
    const tempCount = variations.temperatures?.length || 1;
    const promptCount = variations.promptIds?.length || 1;
    const maxTokensCount = variations.maxTokens?.length || 1;
    const totalConfigurations = modelCount * tempCount * promptCount * maxTokensCount;

    // Estimate dataset size
    const datasetSize = dataset?.limit || 100;
    const totalOperations = totalConfigurations * datasetSize;

    // Cross-validation multiplier
    const cvMultiplier = 1; // Cross-validation removed
    const adjustedOperations = totalOperations * cvMultiplier;

    // Calculate costs by model
    const modelBreakdown: Record<string, { estimatedTokens: number; estimatedCost: number; operations: number; }> = {};
    let totalCost = 0;

    const modelsToTest = variations.models || ['gpt-4o-mini']; // Default model
    
    // Average token estimates for assumptions
    let avgInputTokens = 0;
    let avgOutputTokens = 0;
    
    for (const model of modelsToTest) {
      const pricing = this.getModelPricing(model);
      if (!pricing) {
        console.warn(`No pricing information for model: ${model}`);
        continue;
      }

      // Estimate tokens per operation
      const estimatedInputTokens = this.estimateInputTokens(model);
      const estimatedOutputTokens = this.estimateOutputTokens(model);
      const operationsForModel = Math.floor(adjustedOperations / modelsToTest.length);

      avgInputTokens += estimatedInputTokens;
      avgOutputTokens += estimatedOutputTokens;

      const totalInputTokens = estimatedInputTokens * operationsForModel;
      const totalOutputTokens = estimatedOutputTokens * operationsForModel;

      const inputCost = (totalInputTokens / 1000) * pricing.inputPricePer1K;
      const outputCost = (totalOutputTokens / 1000) * pricing.outputPricePer1K;
      const modelCost = inputCost + outputCost;

      modelBreakdown[model] = {
        estimatedTokens: totalInputTokens + totalOutputTokens,
        estimatedCost: modelCost,
        operations: operationsForModel,
      };

      totalCost += modelCost;
    }

    // Calculate averages for assumptions
    avgInputTokens = Math.floor(avgInputTokens / Math.max(modelsToTest.length, 1));
    avgOutputTokens = Math.floor(avgOutputTokens / Math.max(modelsToTest.length, 1));

    // Estimate duration (assuming 2-5 seconds per operation)
    const avgSecondsPerOperation = 3;
    const parallelism = concurrency?.maxConcurrentTests || 3;
    const estimatedDuration = (adjustedOperations * avgSecondsPerOperation) / parallelism;

    // Calculate cost range with ±25% variability
    const costRange = {
      min: totalCost * 0.75,
      max: totalCost * 1.25,
    };

    const estimation: CostEstimation = {
      totalCost,
      modelBreakdown,
      estimatedDuration,
      costRange,
      confidence: 0.8, // 80% confidence
      assumptions: [
        `Estimated ${avgInputTokens + avgOutputTokens} tokens per operation (average)`,
        `${totalConfigurations} configurations to test`,
        `${datasetSize} samples per configuration`,
        `${cvMultiplier}x multiplier for cross-validation`,
        `${parallelism} concurrent operations`,
        'Costs based on current model pricing',
      ],
    };

    this.emit('cost_estimated', estimation);
    return estimation;
  }

  /**
   * Estimate cost for iterative optimization operations
   */
  async estimateIterativeOptimizationCost(params: IterativeOptimizationParams): Promise<CostEstimation> {
    const maxIterations = params.maxIterations || 10;

    // Estimate operations per iteration (simplified)
    const evaluationsPerIteration = 1; // One evaluation per iteration
    const researchOperationsPerIteration = 1; // Always do research
    const optimizationOperationsPerIteration = 1; // Always optimize prompt
    
    const totalOperationsPerIteration = evaluationsPerIteration + researchOperationsPerIteration + optimizationOperationsPerIteration;
    const totalOperations = maxIterations * totalOperationsPerIteration;

    // Assume a default model if not specified
    const defaultModel = 'gpt-4o-mini';
    const pricing = this.getModelPricing(defaultModel);
    
    if (!pricing) {
      throw new Error(`No pricing information available for model: ${defaultModel}`);
    }

    // Estimate tokens per operation (optimization operations tend to be more token-heavy)
    const estimatedInputTokens = this.estimateInputTokens(defaultModel) * 1.5; // 50% more for complex prompts
    const estimatedOutputTokens = this.estimateOutputTokens(defaultModel) * 1.2; // 20% more output

    const totalInputTokens = estimatedInputTokens * totalOperations;
    const totalOutputTokens = estimatedOutputTokens * totalOperations;

    const inputCost = (totalInputTokens / 1000) * pricing.inputPricePer1K;
    const outputCost = (totalOutputTokens / 1000) * pricing.outputPricePer1K;
    const totalCost = inputCost + outputCost;

    const modelBreakdown = {
      [defaultModel]: {
        estimatedTokens: totalInputTokens + totalOutputTokens,
        estimatedCost: totalCost,
        operations: totalOperations,
      },
    };

    // Estimate duration (optimization iterations take longer)
    const avgSecondsPerIteration = totalOperationsPerIteration * 4; // 4 seconds per operation
    const estimatedDuration = maxIterations * avgSecondsPerIteration;

    // Cost range with ±30% variability (higher than grid search due to adaptive nature)
    const costRange = {
      min: totalCost * 0.7,
      max: totalCost * 1.3,
    };

    const estimation: CostEstimation = {
      totalCost,
      modelBreakdown,
      estimatedDuration,
      costRange,
      confidence: 0.7, // 70% confidence (lower due to adaptive nature)
      assumptions: [
        `${maxIterations} maximum iterations`,
        `${totalOperationsPerIteration} operations per iteration`,
        'Research and optimization enabled',
        'Default model: ' + defaultModel,
        `Estimated ${estimatedInputTokens + estimatedOutputTokens} tokens per operation`,
        'Costs based on current model pricing',
      ],
    };

    this.emit('cost_estimated', estimation);
    return estimation;
  }

  /**
   * Track actual cost from a completed operation
   */
  // Made trackCost private - only used internally by bulk methods
  private async trackCost(entry: Omit<CostTrackingEntry, 'id' | 'timestamp' | 'inputCost' | 'outputCost' | 'totalCost'>): Promise<CostTrackingEntry> {
    const pricing = this.getModelPricing(entry.model);
    if (!pricing) {
      throw new Error(`No pricing information available for model: ${entry.model}`);
    }

    const inputCost = (entry.inputTokens / 1000) * pricing.inputPricePer1K;
    const outputCost = (entry.outputTokens / 1000) * pricing.outputPricePer1K;
    const totalCost = inputCost + outputCost;

    const costEntry: CostTrackingEntry = {
      ...entry,
      id: `cost_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      inputCost,
      outputCost,
      totalCost,
    };

    // Store the entry
    this.costEntries.set(costEntry.id, costEntry);

    // Check budget limits
    await this.checkBudgetLimits(costEntry);

    this.emit('cost_logged', costEntry);
    return costEntry;
  }

  /**
   * Track costs from grid search test results
   */
  async trackGridSearchCosts(
    sessionId: string,
    results: TestResult[],
    baseModel: string = 'gpt-4o-mini'
  ): Promise<CostTrackingEntry[]> {
    const costEntries: CostTrackingEntry[] = [];

    for (const result of results) {
      // Estimate tokens based on the model and sample count
      const estimatedInputTokens = this.estimateInputTokens(result.config.model || baseModel) * result.metrics.sampleCount;
      const estimatedOutputTokens = this.estimateOutputTokens(result.config.model || baseModel) * result.metrics.sampleCount;

      const entry = await this.trackCost({
        sessionId,
        model: result.config.model || baseModel,
        provider: this.getProviderForModel(result.config.model || baseModel),
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
        operationType: 'grid-search',
        metadata: {
          configurationTested: result.config,
          score: result.metrics.score,
          sampleCount: result.metrics.sampleCount,
          duration: result.duration,
        },
      });

      costEntries.push(entry);
    }

    return costEntries;
  }

  /**
   * Track costs from iterative optimization steps
   */
  async trackIterativeOptimizationCosts(
    sessionId: string,
    steps: IterativeOptimizationStep[],
    baseModel: string = 'gpt-4o-mini'
  ): Promise<CostTrackingEntry[]> {
    const costEntries: CostTrackingEntry[] = [];

    for (const step of steps) {
      // Each step involves multiple operations (evaluation, research, optimization)
      const operationsPerStep = 3; // evaluation + research + optimization

      const estimatedInputTokens = this.estimateInputTokens(baseModel) * operationsPerStep * 1.5;
      const estimatedOutputTokens = this.estimateOutputTokens(baseModel) * operationsPerStep * 1.2;

      const entry = await this.trackCost({
        sessionId,
        model: baseModel,
        provider: this.getProviderForModel(baseModel),
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
        operationType: 'iterative-optimization',
        metadata: {
          iteration: step.iteration,
          score: step.score,
          improvement: step.improvement,
          appliedImprovements: step.appliedImprovements,
          feedback: step.feedback,
        },
      });

      costEntries.push(entry);
    }

    return costEntries;
  }

  /**
   * Check if operation would exceed budget limits
   */
  async checkBudgetBeforeOperation(estimatedCost: number, operationType: string): Promise<{
    allowed: boolean;
    alerts: BudgetAlert[];
    reason?: string;
  }> {
    if (!this.budgetConfig) {
      return { allowed: true, alerts: [] };
    }

    const alerts: BudgetAlert[] = [];
    let allowed = true;

    // Check operation limit
    if (this.budgetConfig.operationLimit && estimatedCost > this.budgetConfig.operationLimit) {
      alerts.push({
        type: 'limit_exceeded',
        currentSpending: estimatedCost,
        limit: this.budgetConfig.operationLimit,
        percentage: (estimatedCost / this.budgetConfig.operationLimit) * 100,
        period: 'operation',
        timestamp: new Date(),
        message: `Operation cost ($${estimatedCost.toFixed(4)}) exceeds per-operation limit ($${this.budgetConfig.operationLimit.toFixed(4)})`,
      });

      if (this.budgetConfig.enforceHardLimits) {
        allowed = false;
      }
    }

    // Check current spending against various limits
    const analytics = await this.getCostAnalytics();

    if (this.budgetConfig.dailyLimit) {
      const projectedDailySpending = analytics.spendingByPeriod.today + estimatedCost;
      const percentage = (projectedDailySpending / this.budgetConfig.dailyLimit) * 100;

      if (percentage >= this.budgetConfig.warningThreshold * 100) {
        alerts.push({
          type: percentage >= 100 ? 'daily_limit' : 'warning',
          currentSpending: projectedDailySpending,
          limit: this.budgetConfig.dailyLimit,
          percentage,
          period: 'day',
          timestamp: new Date(),
          message: `Daily spending would reach ${percentage.toFixed(1)}% of limit`,
        });

        if (percentage >= 100 && this.budgetConfig.enforceHardLimits) {
          allowed = false;
        }
      }
    }

    return {
      allowed,
      alerts,
      reason: allowed ? undefined : 'Budget limit would be exceeded',
    };
  }

  /**
   * Get comprehensive cost analytics
   */
  async getCostAnalytics(timeRange?: { start: Date; end: Date }): Promise<CostAnalytics> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Days = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const entries = Array.from(this.costEntries.values()).filter(entry => {
      if (timeRange) {
        return entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end;
      }
      return true;
    });

    // Calculate spending by period
    const spendingByPeriod = {
      today: this.calculateSpendingInPeriod(entries, today, now),
      thisWeek: this.calculateSpendingInPeriod(entries, thisWeek, now),
      thisMonth: this.calculateSpendingInPeriod(entries, thisMonth, now),
      last30Days: this.calculateSpendingInPeriod(entries, last30Days, now),
    };

    // Calculate spending by model
    const spendingByModel: Record<string, number> = {};
    const spendingByOperation: Record<string, number> = {};
    const spendingByProvider: Record<string, number> = {};

    for (const entry of entries) {
      spendingByModel[entry.model] = (spendingByModel[entry.model] || 0) + entry.totalCost;
      spendingByOperation[entry.operationType] = (spendingByOperation[entry.operationType] || 0) + entry.totalCost;
      spendingByProvider[entry.provider] = (spendingByProvider[entry.provider] || 0) + entry.totalCost;
    }

    // Calculate average cost per operation
    const operationCounts: Record<string, number> = {};
    for (const entry of entries) {
      operationCounts[entry.operationType] = (operationCounts[entry.operationType] || 0) + 1;
    }

    const averageCostPerOperation: Record<string, number> = {};
    for (const [opType, totalCost] of Object.entries(spendingByOperation)) {
      averageCostPerOperation[opType] = totalCost / operationCounts[opType];
    }

    // Calculate token usage statistics
    const tokenUsage = {
      totalInputTokens: entries.reduce((sum, entry) => sum + entry.inputTokens, 0),
      totalOutputTokens: entries.reduce((sum, entry) => sum + entry.outputTokens, 0),
      totalTokens: entries.reduce((sum, entry) => sum + entry.totalTokens, 0),
      averageTokensPerOperation: entries.length > 0 ? 
        entries.reduce((sum, entry) => sum + entry.totalTokens, 0) / entries.length : 0,
    };

    // Calculate efficiency metrics
    const totalCost = entries.reduce((sum, entry) => sum + entry.totalCost, 0);
    const efficiency = {
      costPerSuccessfulOperation: totalCost / Math.max(entries.length, 1),
      tokenEfficiencyRatio: tokenUsage.totalInputTokens > 0 ? 
        tokenUsage.totalOutputTokens / tokenUsage.totalInputTokens : 0,
      costTrends: this.calculateCostTrends(entries),
    };

    // Project monthly spending based on current usage
    const dailyAverage = spendingByPeriod.last30Days / 30;
    const projectedMonthlySpending = dailyAverage * 30;

    return {
      spendingByPeriod,
      spendingByModel,
      spendingByOperation,
      spendingByProvider,
      averageCostPerOperation,
      tokenUsage,
      efficiency,
      projectedMonthlySpending,
    };
  }

  /**
   * Get cost history for a specific session
   */
  getSessionCosts(sessionId: string): CostTrackingEntry[] {
    return Array.from(this.costEntries.values())
      .filter(entry => entry.sessionId === sessionId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Removed exportCostData - no CLI support

  // Removed clearCostData - not needed

  /**
   * Get current cost summary
   */
  async getCostSummary(): Promise<{
    totalEntries: number;
    totalCost: number;
    todaysCost: number;
    averageCostPerOperation: number;
    mostExpensiveModel: string;
    budgetStatus?: {
      dailyUsage: number;
      weeklyUsage: number;
      monthlyUsage: number;
      limits: Partial<BudgetConfig>;
    };
  }> {
    const analytics = await this.getCostAnalytics();
    
    // Find most expensive model
    const modelCosts = Object.entries(analytics.spendingByModel);
    const mostExpensiveModel = modelCosts.length > 0 
      ? modelCosts.reduce((a, b) => a[1] > b[1] ? a : b)[0]
      : 'none';

    const summary = {
      totalEntries: this.costEntries.size,
      totalCost: analytics.spendingByPeriod.last30Days,
      todaysCost: analytics.spendingByPeriod.today,
      averageCostPerOperation: Object.values(analytics.averageCostPerOperation).reduce((sum, cost) => sum + cost, 0) / Math.max(Object.keys(analytics.averageCostPerOperation).length, 1),
      mostExpensiveModel,
    };

    if (this.budgetConfig) {
      return {
        ...summary,
        budgetStatus: {
          dailyUsage: analytics.spendingByPeriod.today,
          weeklyUsage: analytics.spendingByPeriod.thisWeek,
          monthlyUsage: analytics.spendingByPeriod.thisMonth,
          limits: {
            dailyLimit: this.budgetConfig.dailyLimit,
            weeklyLimit: this.budgetConfig.weeklyLimit,
            monthlyLimit: this.budgetConfig.monthlyLimit,
          },
        },
      };
    }

    return summary;
  }

  // Private helper methods

  private setupEventHandlers(): void {
    this.on('budget_alert', (alert: BudgetAlert) => {
      console.warn(`Budget Alert: ${alert.message}`);
      // In a real implementation, this could send emails, notifications, etc.
    });
  }

  private async checkBudgetLimits(entry: CostTrackingEntry): Promise<void> {
    if (!this.budgetConfig) return;

    const analytics = await this.getCostAnalytics();
    const alerts: BudgetAlert[] = [];

    // Check daily limit
    if (this.budgetConfig.dailyLimit) {
      const percentage = (analytics.spendingByPeriod.today / this.budgetConfig.dailyLimit) * 100;
      if (percentage >= this.budgetConfig.warningThreshold * 100) {
        alerts.push({
          type: percentage >= 100 ? 'daily_limit' : 'warning',
          currentSpending: analytics.spendingByPeriod.today,
          limit: this.budgetConfig.dailyLimit,
          percentage,
          period: 'day',
          timestamp: new Date(),
          message: `Daily spending at ${percentage.toFixed(1)}% of limit`,
        });
      }
    }

    // Check weekly limit
    if (this.budgetConfig.weeklyLimit) {
      const percentage = (analytics.spendingByPeriod.thisWeek / this.budgetConfig.weeklyLimit) * 100;
      if (percentage >= this.budgetConfig.warningThreshold * 100) {
        alerts.push({
          type: percentage >= 100 ? 'weekly_limit' : 'warning',
          currentSpending: analytics.spendingByPeriod.thisWeek,
          limit: this.budgetConfig.weeklyLimit,
          percentage,
          period: 'week',
          timestamp: new Date(),
          message: `Weekly spending at ${percentage.toFixed(1)}% of limit`,
        });
      }
    }

    // Check monthly limit
    if (this.budgetConfig.monthlyLimit) {
      const percentage = (analytics.spendingByPeriod.thisMonth / this.budgetConfig.monthlyLimit) * 100;
      if (percentage >= this.budgetConfig.warningThreshold * 100) {
        alerts.push({
          type: percentage >= 100 ? 'monthly_limit' : 'warning',
          currentSpending: analytics.spendingByPeriod.thisMonth,
          limit: this.budgetConfig.monthlyLimit,
          percentage,
          period: 'month',
          timestamp: new Date(),
          message: `Monthly spending at ${percentage.toFixed(1)}% of limit`,
        });
      }
    }

    // Emit alerts
    for (const alert of alerts) {
      this.emit('budget_alert', alert);
    }
  }

  private calculateSpendingInPeriod(entries: CostTrackingEntry[], start: Date, end: Date): number {
    return entries
      .filter(entry => entry.timestamp >= start && entry.timestamp <= end)
      .reduce((sum, entry) => sum + entry.totalCost, 0);
  }

  private calculateCostTrends(entries: CostTrackingEntry[]): Array<{ date: string; dailyCost: number; operationCount: number; }> {
    const dailyData: Record<string, { cost: number; count: number; }> = {};

    for (const entry of entries) {
      const date = entry.timestamp.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { cost: 0, count: 0 };
      }
      dailyData[date].cost += entry.totalCost;
      dailyData[date].count += 1;
    }

    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        dailyCost: data.cost,
        operationCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private estimateInputTokens(model: string): number {
    // Conservative estimates based on typical optimization prompts
    const estimates: Record<string, number> = {
      'gpt-4o': 800,
      'gpt-4o-mini': 600,
      'gpt-4-turbo': 800,
      'gpt-4': 700,
      'gpt-3.5-turbo': 500,
      'o1-preview': 1000,
      'o1-mini': 800,
      'claude-3-5-sonnet-20241022': 900,
      'claude-3-5-haiku-20241022': 600,
      'claude-3-opus-20240229': 1000,
      'claude-3-sonnet-20240229': 800,
      'claude-3-haiku-20240307': 500,
    };

    return estimates[model] || 600; // Default estimate
  }

  private estimateOutputTokens(model: string): number {
    // Conservative estimates for typical responses
    const estimates: Record<string, number> = {
      'gpt-4o': 300,
      'gpt-4o-mini': 250,
      'gpt-4-turbo': 350,
      'gpt-4': 300,
      'gpt-3.5-turbo': 200,
      'o1-preview': 500, // Reasoning models generate more tokens
      'o1-mini': 400,
      'claude-3-5-sonnet-20241022': 350,
      'claude-3-5-haiku-20241022': 250,
      'claude-3-opus-20240229': 400,
      'claude-3-sonnet-20240229': 300,
      'claude-3-haiku-20240307': 200,
    };

    return estimates[model] || 250; // Default estimate
  }

  private getProviderForModel(model: string): string {
    if (model.startsWith('gpt-') || model.startsWith('o1-')) {
      return 'openai';
    }
    if (model.startsWith('claude-')) {
      return 'anthropic';
    }
    return 'unknown';
  }
}

