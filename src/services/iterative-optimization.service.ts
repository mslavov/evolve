import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { EvaluationService } from './evaluation.service.js';
import { FlowOrchestrator, type FlowConfig } from './orchestration/flow.orchestrator.js';
import { EvaluationRegistry } from './evaluation/registry.js';
import { NumericScoreEvaluator } from './evaluation/strategies/numeric-score.strategy.js';
import { FactBasedEvaluator } from './evaluation/strategies/fact-based.strategy.js';
import { HybridEvaluator } from './evaluation/strategies/hybrid.strategy.js';
import type { Agent } from '../db/schema/agents.js';
import type { DetailedEvaluation, ResearchInsight, DetailedFeedback } from './evaluation/types.js';

/**
 * Objective definition for multi-objective optimization
 */
export interface OptimizationObjective {
  /** Unique identifier for the objective */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this objective measures */
  description: string;
  /** Weight/importance of this objective (0-1) */
  weight: number;
  /** Target value to achieve for this objective */
  target: number;
  /** Evaluation strategy to use for this objective */
  evaluationStrategy?: string;
  /** Whether higher values are better (default: true) */
  higherIsBetter?: boolean;
}

/**
 * Advanced convergence detection configuration
 */
export interface ConvergenceConfig {
  /** Minimum number of iterations before checking convergence */
  minIterations: number;
  /** Maximum allowed variance in recent scores */
  scoreVarianceThreshold: number;
  /** Number of recent scores to consider for variance */
  windowSize: number;
  /** Maximum consecutive iterations with no improvement */
  maxConsecutiveNoImprovement: number;
  /** Minimum improvement threshold per iteration */
  minImprovementThreshold: number;
  /** Enable adaptive thresholds based on optimization progress */
  adaptive: boolean;
}

/**
 * Adaptive learning rate configuration
 */
export interface AdaptiveLearningConfig {
  /** Initial learning rate */
  initialRate: number;
  /** Minimum learning rate */
  minRate: number;
  /** Maximum learning rate */
  maxRate: number;
  /** Rate adjustment factor when improvement detected */
  accelerationFactor: number;
  /** Rate adjustment factor when no improvement */
  decelerationFactor: number;
  /** Number of iterations to consider for adaptation */
  adaptationWindow: number;
}

// Removed OptimizationPattern interface - over-engineered

/**
 * Checkpoint data for resuming optimization
 */
export interface OptimizationCheckpoint {
  /** Unique checkpoint identifier */
  id: string;
  /** Optimization session identifier */
  sessionId: string;
  /** Current iteration number */
  iteration: number;
  /** Current agent configuration */
  currentConfig: Agent;
  /** Current optimization objectives and their scores */
  objectiveScores: Record<string, number>;
  /** Optimization history up to this point */
  history: IterativeOptimizationStep[];
  /** Current convergence metrics */
  convergenceMetrics: ConvergenceMetrics;
  /** Current learning rate */
  learningRate: number;
  // Removed discovered patterns
  /** Research insights accumulated */
  researchInsights: ResearchInsight[];
  /** Timestamp of checkpoint */
  timestamp: Date;
  /** Additional metadata */
  metadata: Record<string, any>;
}

/**
 * Enhanced convergence metrics
 */
export interface ConvergenceMetrics {
  /** Recent objective scores for variance calculation */
  recentScores: Record<string, number[]>;
  /** Score improvements by objective */
  scoreImprovements: Record<string, number>;
  /** Consecutive iterations with no improvement by objective */
  consecutiveNoImprovement: Record<string, number>;
  /** Average improvements by objective */
  averageImprovements: Record<string, number>;
  /** Overall convergence indicators */
  isConverged: boolean;
  /** Convergence reason if applicable */
  convergenceReason?: string;
}

/**
 * Single optimization step in the iterative process
 */
export interface IterativeOptimizationStep {
  /** Iteration number */
  iteration: number;
  /** Agent configuration used */
  config: Agent;
  /** Objective scores achieved */
  objectiveScores: Record<string, number>;
  /** Overall weighted score */
  overallScore: number;
  /** Improvements from previous iteration */
  improvements: Record<string, number>;
  /** Strategies applied in this iteration */
  strategies: string[];
  /** Detailed feedback from evaluation */
  feedback: DetailedFeedback;
  /** Research insights used */
  researchInsights: ResearchInsight[];
  /** Patterns applied */
  patternsApplied: string[];
  /** Learning rate used */
  learningRate: number;
  /** Timestamp of this step */
  timestamp: Date;
}

/**
 * Parameters for iterative optimization
 */
export interface IterativeOptimizationParams {
  /** Base agent to optimize */
  baseAgentKey: string;
  /** Optimization objectives */
  objectives: OptimizationObjective[];
  /** Maximum number of iterations */
  maxIterations?: number;
  /** Convergence detection configuration */
  convergenceConfig?: Partial<ConvergenceConfig>;
  /** Adaptive learning configuration */
  adaptiveLearningConfig?: Partial<AdaptiveLearningConfig>;
  /** Enable research-driven optimization */
  enableResearch?: boolean;
  /** Enable pattern learning and reuse */
  enablePatternLearning?: boolean;
  /** Session identifier for checkpointing */
  sessionId?: string;
  /** Resume from checkpoint if available */
  resumeFromCheckpoint?: boolean;
  /** Save checkpoints every N iterations */
  checkpointInterval?: number;
  /** Additional optimization configuration */
  optimizationConfig?: Record<string, any>;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Result of iterative optimization
 */
export interface IterativeOptimizationResult {
  /** Final optimized agent configuration */
  finalConfig: Agent;
  /** Final objective scores */
  finalObjectiveScores: Record<string, number>;
  /** Final overall weighted score */
  finalOverallScore: number;
  /** Total number of iterations performed */
  iterations: number;
  /** Complete optimization history */
  history: IterativeOptimizationStep[];
  /** Total improvements by objective */
  totalImprovements: Record<string, number>;
  /** Whether optimization converged */
  converged: boolean;
  /** Reason optimization stopped */
  stoppedReason: string;
  // Removed discovered patterns
  /** All research insights gathered */
  researchInsights: ResearchInsight[];
  /** Performance analysis */
  analysis: {
    bestIteration: number;
    worstIteration: number;
    averageImprovements: Record<string, number>;
    improvementTrends: Record<string, 'improving' | 'declining' | 'stable'>;
    recommendations: string[];
  };
  /** Optimization session metadata */
  sessionMetadata: {
    sessionId: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    checkpointsSaved: number;
  };
}

/**
 * Enhanced iterative optimization service with advanced features
 */
export class IterativeOptimizationService {
  private agentRepo: AgentRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private evaluationService: EvaluationService;
  private evaluationRegistry: EvaluationRegistry;
  private flowOrchestrator: FlowOrchestrator;
  // Removed pattern memory - over-engineered
  private checkpoints: Map<string, OptimizationCheckpoint> = new Map();

  // Default configurations
  private readonly defaultConvergenceConfig: ConvergenceConfig = {
    minIterations: 3,
    scoreVarianceThreshold: 0.005,
    windowSize: 5,
    maxConsecutiveNoImprovement: 3,
    minImprovementThreshold: 0.01,
    adaptive: true,
  };

  private readonly defaultAdaptiveLearningConfig: AdaptiveLearningConfig = {
    initialRate: 0.1,
    minRate: 0.01,
    maxRate: 0.5,
    accelerationFactor: 1.2,
    decelerationFactor: 0.8,
    adaptationWindow: 3,
  };

  constructor(private db: Database) {
    this.agentRepo = new AgentRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.evaluationService = new EvaluationService(db);
    this.evaluationRegistry = new EvaluationRegistry();
    this.setupEvaluationStrategies();
    this.flowOrchestrator = new FlowOrchestrator(db, this.evaluationRegistry);
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
   * Main optimization method with all enhancements
   */
  async optimize(params: IterativeOptimizationParams): Promise<IterativeOptimizationResult> {
    const sessionId = params.sessionId || `opt_${Date.now()}`;
    const startTime = new Date();

    if (params.verbose) {
      console.log(`Starting iterative optimization session: ${sessionId}`);
      console.log(`Objectives: ${params.objectives.map(o => o.name).join(', ')}`);
    }

    // Get base agent
    const baseAgent = await this.agentRepo.findByKey(params.baseAgentKey);
    if (!baseAgent) {
      throw new Error(`Base agent ${params.baseAgentKey} not found`);
    }

    // Initialize configuration
    const convergenceConfig = { ...this.defaultConvergenceConfig, ...params.convergenceConfig };
    const adaptiveLearningConfig = { ...this.defaultAdaptiveLearningConfig, ...params.adaptiveLearningConfig };
    const maxIterations = params.maxIterations || 10;

    // Initialize state
    let currentConfig = baseAgent;
    let currentLearningRate = adaptiveLearningConfig.initialRate;
    let iterationCount = 0;
    let history: IterativeOptimizationStep[] = [];
    let convergenceMetrics = this.initializeConvergenceMetrics(params.objectives);
    // Pattern memory removed
    let allResearchInsights: ResearchInsight[] = [];
    let checkpointsSaved = 0;

    // Try to resume from checkpoint if requested
    if (params.resumeFromCheckpoint) {
      const checkpoint = this.loadCheckpoint(sessionId);
      if (checkpoint) {
        if (params.verbose) {
          console.log(`Resuming from checkpoint at iteration ${checkpoint.iteration}`);
        }
        currentConfig = checkpoint.currentConfig;
        iterationCount = checkpoint.iteration;
        history = checkpoint.history;
        convergenceMetrics = checkpoint.convergenceMetrics;
        currentLearningRate = checkpoint.learningRate;
        // Pattern loading removed
        allResearchInsights = checkpoint.researchInsights;
      }
    }

    // Main optimization loop
    while (iterationCount < maxIterations && !this.hasConverged(convergenceMetrics, convergenceConfig)) {
      iterationCount++;

      if (params.verbose) {
        console.log(`\n--- Iteration ${iterationCount} ---`);
        console.log(`Learning rate: ${currentLearningRate.toFixed(3)}`);
      }

      try {
        // Step 1: Evaluate current configuration against all objectives
        const objectiveScores = await this.evaluateMultiObjective(currentConfig, params.objectives);
        const overallScore = this.calculateOverallScore(objectiveScores, params.objectives);

        if (params.verbose) {
          console.log('Objective scores:', Object.entries(objectiveScores)
            .map(([obj, score]) => `${obj}: ${(score * 100).toFixed(1)}%`)
            .join(', '));
          console.log(`Overall score: ${(overallScore * 100).toFixed(1)}%`);
        }

        // Step 2: Research improvement strategies (if enabled)
        let researchInsights: ResearchInsight[] = [];
        if (params.enableResearch) {
          researchInsights = await this.gatherResearchInsights(objectiveScores, params.objectives, history);
          allResearchInsights.push(...researchInsights);

          if (params.verbose && researchInsights.length > 0) {
            console.log(`Found ${researchInsights.length} research insights`);
          }
        }

        // Step 3: Apply pattern learning and matching
        let patternsApplied: string[] = [];
        if (params.enablePatternLearning) {
          // Removed pattern matching and application
        }

        // Step 4: Generate optimized configuration
        const optimizedConfig = await this.generateOptimizedConfiguration(
          currentConfig,
          objectiveScores,
          params.objectives,
          researchInsights,
          patternsApplied,
          currentLearningRate
        );

        // Step 5: Update convergence metrics
        const improvements = this.calculateImprovements(objectiveScores, history);
        this.updateConvergenceMetrics(convergenceMetrics, objectiveScores, improvements, convergenceConfig);

        // Removed pattern learning

        // Step 7: Create optimization step record
        const step: IterativeOptimizationStep = {
          iteration: iterationCount,
          config: currentConfig,
          objectiveScores,
          overallScore,
          improvements,
          strategies: this.extractStrategiesUsed(researchInsights, patternsApplied),
          feedback: this.synthesizeFeedback(objectiveScores, params.objectives, improvements),
          researchInsights,
          patternsApplied,
          learningRate: currentLearningRate,
          timestamp: new Date(),
        };

        history.push(step);

        // Step 8: Update configuration for next iteration
        currentConfig = optimizedConfig;

        // Step 9: Adapt learning rate
        currentLearningRate = this.adaptLearningRate(
          currentLearningRate,
          improvements,
          adaptiveLearningConfig,
          history
        );

        // Step 10: Check for early stopping conditions
        if (this.shouldStop(objectiveScores, params.objectives, convergenceMetrics)) {
          if (params.verbose) {
            console.log('Early stopping condition met');
          }
          break;
        }

        // Step 11: Save checkpoint if configured
        if (params.checkpointInterval && iterationCount % params.checkpointInterval === 0) {
          await this.saveCheckpoint({
            id: `${sessionId}_${iterationCount}`,
            sessionId,
            iteration: iterationCount,
            currentConfig,
            objectiveScores,
            history,
            convergenceMetrics,
            learningRate: currentLearningRate,
            // discoveredPatterns removed
            researchInsights: allResearchInsights,
            timestamp: new Date(),
            metadata: params.optimizationConfig || {},
          });
          checkpointsSaved++;

          if (params.verbose) {
            console.log(`Checkpoint saved at iteration ${iterationCount}`);
          }
        }

      } catch (error) {
        console.error(`Error in iteration ${iterationCount}:`, error);
        
        if (iterationCount === 1) {
          throw error; // Fatal error on first iteration
        }
        break;
      }
    }

    // Finalize optimization
    const endTime = new Date();
    const finalObjectiveScores = history.length > 0 ? history[history.length - 1].objectiveScores : {};
    const finalOverallScore = this.calculateOverallScore(finalObjectiveScores, params.objectives);

    // Save final optimized agent
    const optimizedKey = `${params.baseAgentKey}_iterative_optimized_${Date.now()}`;
    const optimizedAgent = await this.agentRepo.create({
      key: optimizedKey,
      name: `Iteratively optimized from ${params.baseAgentKey}`,
      type: currentConfig.type,
      model: currentConfig.model,
      temperature: currentConfig.temperature,
      promptId: currentConfig.promptId,
      maxTokens: currentConfig.maxTokens,
      outputType: currentConfig.outputType,
      outputSchema: currentConfig.outputSchema,
      description: `Iteratively optimized from ${params.baseAgentKey} using multi-objective optimization`,
      metadata: {
        baseAgent: params.baseAgentKey,
        optimizationDate: new Date(),
        sessionId,
        iterations: iterationCount,
        finalObjectiveScores,
        finalOverallScore,
        converged: this.hasConverged(convergenceMetrics, convergenceConfig),
        objectives: params.objectives,
        patternsDiscovered: 0, // Pattern memory removed
        researchInsightsGathered: allResearchInsights.length,
      },
    });

    // Update performance metrics
    await this.agentRepo.updatePerformanceMetrics(optimizedKey, finalOverallScore, false);

    // Generate analysis
    const analysis = this.analyzeOptimizationResults(history, params.objectives);

    // Determine stop reason
    const stoppedReason = this.determineStopReason(
      iterationCount,
      maxIterations,
      convergenceMetrics,
      convergenceConfig
    );

    if (params.verbose) {
      console.log('\n--- Optimization Complete ---');
      console.log(`Final overall score: ${(finalOverallScore * 100).toFixed(1)}%`);
      console.log(`Iterations: ${iterationCount}`);
      console.log(`Patterns discovered: 0`); // Pattern memory removed
      console.log(`Stopped reason: ${stoppedReason}`);
    }

    return {
      finalConfig: optimizedAgent,
      finalObjectiveScores,
      finalOverallScore,
      iterations: iterationCount,
      history,
      totalImprovements: this.calculateTotalImprovements(history, params.objectives),
      converged: this.hasConverged(convergenceMetrics, convergenceConfig),
      stoppedReason,
      // discoveredPatterns removed
      researchInsights: allResearchInsights,
      analysis,
      sessionMetadata: {
        sessionId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        checkpointsSaved,
      },
    };
  }

  /**
   * Evaluate agent against multiple objectives
   */
  private async evaluateMultiObjective(
    config: Agent,
    objectives: OptimizationObjective[]
  ): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    // Get test dataset for evaluation
    const testData = await this.evalDatasetRepo.findMany({
      limit: 50, // Use a reasonable sample size for iterative optimization
    });

    if (testData.length === 0) {
      console.warn('No test data available for evaluation');
      for (const objective of objectives) {
        scores[objective.id] = 0;
      }
      return scores;
    }

    // For now, use the same test for all objectives
    // In the future, could have objective-specific datasets
    const testResult = await this.evaluationService.testAgentConfiguration(
      {
        model: config.model,
        temperature: config.temperature,
        promptId: config.promptId,
        maxTokens: config.maxTokens,
        outputType: config.outputType,
        outputSchema: config.outputSchema,
      },
      testData,
      { agentKey: config.key }
    );

    // Map the single score to all objectives for now
    // In the future, could have objective-specific scoring
    for (const objective of objectives) {
      scores[objective.id] = testResult.metrics.score;
    }

    return scores;
  }

  /**
   * Calculate overall weighted score from objective scores
   */
  private calculateOverallScore(
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[]
  ): number {
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const objective of objectives) {
      const score = objectiveScores[objective.id] || 0;
      totalWeightedScore += score * objective.weight;
      totalWeight += objective.weight;
    }

    return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  }

  /**
   * Initialize convergence metrics for all objectives
   */
  private initializeConvergenceMetrics(objectives: OptimizationObjective[]): ConvergenceMetrics {
    const recentScores: Record<string, number[]> = {};
    const scoreImprovements: Record<string, number> = {};
    const consecutiveNoImprovement: Record<string, number> = {};
    const averageImprovements: Record<string, number> = {};

    for (const objective of objectives) {
      recentScores[objective.id] = [];
      scoreImprovements[objective.id] = 0;
      consecutiveNoImprovement[objective.id] = 0;
      averageImprovements[objective.id] = 0;
    }

    return {
      recentScores,
      scoreImprovements,
      consecutiveNoImprovement,
      averageImprovements,
      isConverged: false,
    };
  }

  /**
   * Check if optimization has converged using advanced detection
   */
  private hasConverged(
    metrics: ConvergenceMetrics,
    config: ConvergenceConfig
  ): boolean {
    if (metrics.isConverged) {
      return true;
    }

    // Check minimum iterations
    const totalIterations = Math.max(...Object.values(metrics.recentScores).map(scores => scores.length));
    if (totalIterations < config.minIterations) {
      return false;
    }

    // Check variance-based convergence for all objectives
    let allObjectivesConverged = true;
    for (const [objectiveId, scores] of Object.entries(metrics.recentScores)) {
      if (scores.length < config.windowSize) {
        allObjectivesConverged = false;
        continue;
      }

      const variance = this.calculateVariance(scores.slice(-config.windowSize));
      if (variance > config.scoreVarianceThreshold) {
        allObjectivesConverged = false;
      }
    }

    // Check consecutive no improvement
    let anyObjectiveStuck = false;
    for (const consecutiveCount of Object.values(metrics.consecutiveNoImprovement)) {
      if (consecutiveCount >= config.maxConsecutiveNoImprovement) {
        anyObjectiveStuck = true;
        break;
      }
    }

    // Convergence if all objectives are stable or any is stuck
    const converged = allObjectivesConverged || anyObjectiveStuck;

    if (converged) {
      metrics.isConverged = true;
      metrics.convergenceReason = allObjectivesConverged ? 'variance-threshold' : 'no-improvement';
    }

    return converged;
  }

  /**
   * Update convergence metrics with new scores
   */
  private updateConvergenceMetrics(
    metrics: ConvergenceMetrics,
    objectiveScores: Record<string, number>,
    improvements: Record<string, number>,
    config: ConvergenceConfig
  ): void {
    for (const [objectiveId, score] of Object.entries(objectiveScores)) {
      // Update recent scores
      if (!metrics.recentScores[objectiveId]) {
        metrics.recentScores[objectiveId] = [];
      }
      metrics.recentScores[objectiveId].push(score);
      
      // Keep only window size recent scores
      if (metrics.recentScores[objectiveId].length > config.windowSize) {
        metrics.recentScores[objectiveId].shift();
      }

      // Update improvement tracking
      const improvement = improvements[objectiveId] || 0;
      metrics.scoreImprovements[objectiveId] = improvement;

      // Update consecutive no improvement
      if (improvement < config.minImprovementThreshold) {
        metrics.consecutiveNoImprovement[objectiveId] = (metrics.consecutiveNoImprovement[objectiveId] || 0) + 1;
      } else {
        metrics.consecutiveNoImprovement[objectiveId] = 0;
      }

      // Update average improvements (exponential moving average)
      const alpha = 0.3; // Smoothing factor
      const currentAvg = metrics.averageImprovements[objectiveId] || 0;
      metrics.averageImprovements[objectiveId] = alpha * improvement + (1 - alpha) * currentAvg;
    }
  }

  /**
   * Calculate variance for convergence detection
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Gather research insights for improvement
   */
  private async gatherResearchInsights(
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[],
    history: IterativeOptimizationStep[]
  ): Promise<ResearchInsight[]> {
    const insights: ResearchInsight[] = [];

    // Analyze performance gaps
    for (const objective of objectives) {
      const score = objectiveScores[objective.id] || 0;
      const gap = objective.target - score;

      if (gap > 0.1) { // Significant gap
        insights.push({
          source: 'gap-analysis',
          strategy: `improve-${objective.id}`,
          description: `Focus on improving ${objective.name} (current: ${(score * 100).toFixed(1)}%, target: ${(objective.target * 100).toFixed(1)}%)`,
          confidence: Math.min(gap * 2, 1), // Higher gap = higher confidence in need for improvement
          applicability: objective.weight, // Weight indicates importance
          implementation: `Analyze ${objective.name} evaluation criteria and adjust optimization strategy`,
        });
      }
    }

    // Analyze historical trends
    if (history.length >= 3) {
      const recentHistory = history.slice(-3);
      for (const objective of objectives) {
        const scores = recentHistory.map(h => h.objectiveScores[objective.id] || 0);
        const trend = scores[scores.length - 1] - scores[0];

        if (trend < 0) { // Declining performance
          insights.push({
            source: 'trend-analysis',
            strategy: `stabilize-${objective.id}`,
            description: `Performance declining for ${objective.name} - need stabilization`,
            confidence: Math.abs(trend),
            applicability: objective.weight,
            implementation: `Review recent changes affecting ${objective.name} and revert problematic modifications`,
          });
        }
      }
    }

    return insights;
  }

  // Removed findMatchingPatterns method - over-engineered

  /**
   * Calculate similarity between contexts
   */
  private calculateContextSimilarity(context1: Record<string, any>, context2: Record<string, any>): number {
    const keys = new Set([...Object.keys(context1), ...Object.keys(context2)]);
    let matches = 0;
    let total = 0;

    for (const key of keys) {
      total++;
      if (context1[key] === context2[key]) {
        matches++;
      } else if (typeof context1[key] === 'number' && typeof context2[key] === 'number') {
        // For numbers, consider close values as partial matches
        const diff = Math.abs(context1[key] - context2[key]);
        const avgValue = (Math.abs(context1[key]) + Math.abs(context2[key])) / 2;
        if (avgValue > 0) {
          const similarity = 1 - Math.min(diff / avgValue, 1);
          matches += similarity;
        }
      }
    }

    return total > 0 ? matches / total : 0;
  }

  /**
   * Generate optimized configuration using multiple strategies
   */
  private async generateOptimizedConfiguration(
    currentConfig: Agent,
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[],
    researchInsights: ResearchInsight[],
    patternsApplied: string[],
    learningRate: number
  ): Promise<Agent> {
    // This is a simplified optimization - in practice, this would use
    // the FlowOrchestrator and optimization agents
    const optimizedConfig = { ...currentConfig };

    // Apply learning rate to parameter adjustments
    if (currentConfig.temperature !== undefined && currentConfig.temperature !== null) {
      // Adjust temperature based on performance and learning rate
      const temperatureAdjustment = this.calculateTemperatureAdjustment(objectiveScores, objectives) * learningRate;
      optimizedConfig.temperature = Math.max(0, Math.min(2, currentConfig.temperature + temperatureAdjustment));
    }

    // Apply insights and patterns
    // This would be more sophisticated in practice, potentially using the optimization agent

    return optimizedConfig;
  }

  /**
   * Calculate temperature adjustment based on objective performance
   */
  private calculateTemperatureAdjustment(
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[]
  ): number {
    // Simple heuristic: if accuracy is low, decrease temperature; if creativity is low, increase it
    let adjustment = 0;
    
    for (const objective of objectives) {
      const score = objectiveScores[objective.id] || 0;
      const gap = objective.target - score;
      
      if (objective.name.toLowerCase().includes('accuracy') && gap > 0.1) {
        adjustment -= 0.1; // Decrease temperature for better accuracy
      } else if (objective.name.toLowerCase().includes('creativity') && gap > 0.1) {
        adjustment += 0.1; // Increase temperature for more creativity
      }
    }

    return adjustment;
  }

  /**
   * Calculate improvements from previous iteration
   */
  private calculateImprovements(
    currentScores: Record<string, number>,
    history: IterativeOptimizationStep[]
  ): Record<string, number> {
    const improvements: Record<string, number> = {};

    if (history.length === 0) {
      // First iteration - no previous scores to compare
      for (const [objectiveId, score] of Object.entries(currentScores)) {
        improvements[objectiveId] = 0;
      }
      return improvements;
    }

    const previousScores = history[history.length - 1].objectiveScores;

    for (const [objectiveId, currentScore] of Object.entries(currentScores)) {
      const previousScore = previousScores[objectiveId] || 0;
      improvements[objectiveId] = currentScore - previousScore;
    }

    return improvements;
  }

  /**
   * Check if there's significant improvement to learn from
   */
  private hasSignificantImprovement(improvements: Record<string, number>): boolean {
    const totalImprovement = Object.values(improvements).reduce((sum, imp) => sum + imp, 0);
    return totalImprovement > 0.05; // 5% total improvement threshold
  }

  // Removed learnPatternFromImprovement method - over-engineered

  /**
   * Extract strategies used in the iteration
   */
  private extractStrategiesUsed(
    researchInsights: ResearchInsight[],
    patternsApplied: string[]
  ): string[] {
    const strategies: string[] = [];

    // Add research-based strategies
    strategies.push(...researchInsights.map(insight => `research:${insight.strategy}`));

    // Removed pattern-based strategies

    return strategies;
  }

  /**
   * Synthesize feedback from objective evaluations
   */
  private synthesizeFeedback(
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[],
    improvements: Record<string, number>
  ): DetailedFeedback {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const actionItems: string[] = [];

    for (const objective of objectives) {
      const score = objectiveScores[objective.id] || 0;
      const improvement = improvements[objective.id] || 0;
      const gap = objective.target - score;

      if (score >= objective.target * 0.9) {
        strengths.push(`Strong performance in ${objective.name} (${(score * 100).toFixed(1)}%)`);
      }

      if (gap > 0.2) {
        weaknesses.push(`Significant gap in ${objective.name} (${(gap * 100).toFixed(1)}% below target)`);
        actionItems.push(`Focus on improving ${objective.name} through targeted optimization`);
      }

      if (improvement > 0.05) {
        strengths.push(`Good improvement in ${objective.name} (+${(improvement * 100).toFixed(1)}%)`);
      } else if (improvement < -0.05) {
        weaknesses.push(`Declining performance in ${objective.name} (-${(Math.abs(improvement) * 100).toFixed(1)}%)`);
        actionItems.push(`Investigate and address decline in ${objective.name}`);
      }
    }

    const overallScore = this.calculateOverallScore(objectiveScores, objectives);
    const summary = `Overall performance: ${(overallScore * 100).toFixed(1)}%. ` +
      `${strengths.length} strengths, ${weaknesses.length} areas for improvement.`;

    return {
      summary,
      strengths,
      weaknesses,
      actionItems,
    };
  }

  /**
   * Adapt learning rate based on recent performance
   */
  private adaptLearningRate(
    currentRate: number,
    improvements: Record<string, number>,
    config: AdaptiveLearningConfig,
    history: IterativeOptimizationStep[]
  ): number {
    const totalImprovement = Object.values(improvements).reduce((sum, imp) => sum + imp, 0);
    
    // Get recent performance trend
    const recentHistory = history.slice(-config.adaptationWindow);
    const recentImprovements = recentHistory.map(step => 
      Object.values(step.improvements).reduce((sum, imp) => sum + imp, 0)
    );
    
    const avgRecentImprovement = recentImprovements.length > 0 
      ? recentImprovements.reduce((sum, imp) => sum + imp, 0) / recentImprovements.length
      : 0;

    let newRate = currentRate;

    if (totalImprovement > 0 && avgRecentImprovement > 0) {
      // Good performance - increase learning rate
      newRate *= config.accelerationFactor;
    } else if (totalImprovement <= 0 || avgRecentImprovement <= 0) {
      // Poor performance - decrease learning rate
      newRate *= config.decelerationFactor;
    }

    // Clamp to bounds
    return Math.max(config.minRate, Math.min(config.maxRate, newRate));
  }

  /**
   * Check if optimization should stop early
   */
  private shouldStop(
    objectiveScores: Record<string, number>,
    objectives: OptimizationObjective[],
    metrics: ConvergenceMetrics
  ): boolean {
    // Check if all objectives have reached their targets
    const allTargetsReached = objectives.every(obj => 
      (objectiveScores[obj.id] || 0) >= obj.target
    );

    return allTargetsReached || metrics.isConverged;
  }

  /**
   * Save optimization checkpoint
   */
  private async saveCheckpoint(checkpoint: OptimizationCheckpoint): Promise<void> {
    // In a real implementation, this would save to database or file system
    this.checkpoints.set(checkpoint.id, checkpoint);
    
    // For now, just log the checkpoint
    console.log(`Checkpoint saved: ${checkpoint.id} at iteration ${checkpoint.iteration}`);
  }

  /**
   * Load optimization checkpoint
   */
  private loadCheckpoint(sessionId: string): OptimizationCheckpoint | null {
    // In a real implementation, this would load from database or file system
    // For now, find the latest checkpoint for the session
    const sessionCheckpoints = Array.from(this.checkpoints.values())
      .filter(cp => cp.sessionId === sessionId)
      .sort((a, b) => b.iteration - a.iteration);

    return sessionCheckpoints.length > 0 ? sessionCheckpoints[0] : null;
  }

  /**
   * Calculate total improvements across all objectives
   */
  private calculateTotalImprovements(
    history: IterativeOptimizationStep[],
    objectives: OptimizationObjective[]
  ): Record<string, number> {
    const totalImprovements: Record<string, number> = {};

    if (history.length === 0) {
      for (const objective of objectives) {
        totalImprovements[objective.id] = 0;
      }
      return totalImprovements;
    }

    const firstScores = history[0].objectiveScores;
    const lastScores = history[history.length - 1].objectiveScores;

    for (const objective of objectives) {
      const firstScore = firstScores[objective.id] || 0;
      const lastScore = lastScores[objective.id] || 0;
      totalImprovements[objective.id] = lastScore - firstScore;
    }

    return totalImprovements;
  }

  /**
   * Analyze optimization results
   */
  private analyzeOptimizationResults(
    history: IterativeOptimizationStep[],
    objectives: OptimizationObjective[]
  ): IterativeOptimizationResult['analysis'] {
    if (history.length === 0) {
      return {
        bestIteration: -1,
        worstIteration: -1,
        averageImprovements: {},
        improvementTrends: {},
        recommendations: ['No optimization history available'],
      };
    }

    // Find best and worst iterations by overall score
    const bestStep = history.reduce((best, step) => 
      step.overallScore > best.overallScore ? step : best
    );
    const worstStep = history.reduce((worst, step) => 
      step.overallScore < worst.overallScore ? step : worst
    );

    // Calculate average improvements by objective
    const averageImprovements: Record<string, number> = {};
    for (const objective of objectives) {
      const improvements = history.map(step => step.improvements[objective.id] || 0);
      averageImprovements[objective.id] = improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length;
    }

    // Determine trends by objective
    const improvementTrends: Record<string, 'improving' | 'declining' | 'stable'> = {};
    for (const objective of objectives) {
      const recentHistory = history.slice(-3);
      const recentImprovements = recentHistory.map(step => step.improvements[objective.id] || 0);
      const avgRecent = recentImprovements.reduce((sum, imp) => sum + imp, 0) / recentImprovements.length;
      const avgOverall = averageImprovements[objective.id];

      if (avgRecent > avgOverall * 1.2) {
        improvementTrends[objective.id] = 'improving';
      } else if (avgRecent < avgOverall * 0.8) {
        improvementTrends[objective.id] = 'declining';
      } else {
        improvementTrends[objective.id] = 'stable';
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    const totalImprovements = this.calculateTotalImprovements(history, objectives);
    const overallImprovement = Object.values(totalImprovements).reduce((sum, imp) => sum + imp, 0);

    if (overallImprovement < 0.1) {
      recommendations.push('Limited overall improvement achieved - consider alternative optimization approaches');
    }

    for (const [objectiveId, trend] of Object.entries(improvementTrends)) {
      const objective = objectives.find(obj => obj.id === objectiveId);
      if (objective && trend === 'declining') {
        recommendations.push(`Performance declining for ${objective.name} - review recent optimization strategies`);
      }
    }

    if (history.length >= 5) {
      const recentHistory = history.slice(-3);
      const earlyHistory = history.slice(0, 3);
      
      const recentAvgScore = recentHistory.reduce((sum, step) => sum + step.overallScore, 0) / recentHistory.length;
      const earlyAvgScore = earlyHistory.reduce((sum, step) => sum + step.overallScore, 0) / earlyHistory.length;
      
      if (recentAvgScore < earlyAvgScore) {
        recommendations.push('Recent performance worse than early iterations - optimization may have overfit');
      }
    }

    return {
      bestIteration: bestStep.iteration,
      worstIteration: worstStep.iteration,
      averageImprovements,
      improvementTrends,
      recommendations,
    };
  }

  /**
   * Determine why optimization stopped
   */
  private determineStopReason(
    iterationCount: number,
    maxIterations: number,
    metrics: ConvergenceMetrics,
    config: ConvergenceConfig
  ): string {
    if (metrics.isConverged) {
      return metrics.convergenceReason || 'converged';
    }

    if (iterationCount >= maxIterations) {
      return 'max-iterations-reached';
    }

    // Check for other stopping conditions
    const maxConsecutiveNoImprovement = Math.max(...Object.values(metrics.consecutiveNoImprovement));
    if (maxConsecutiveNoImprovement >= config.maxConsecutiveNoImprovement) {
      return 'no-improvement-detected';
    }

    return 'early-termination';
  }

  // Removed getPatternMemoryStats method - over-engineered
  getPatternMemoryStats(): any {
    // Return empty stats since pattern memory removed
    return {
      totalPatterns: 0,
      averageConfidence: 0,
      mostSuccessfulPattern: null,
      recentPatterns: [],
    };
  }

  // Removed clearPatternMemory method - pattern memory removed

  // Removed exportOptimizationState method - over-engineered
}