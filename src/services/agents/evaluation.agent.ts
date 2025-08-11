import type { Config } from '../../db/schema/configs.js';
import type { 
  EvaluationConfig, 
  EvaluationContext,
  DetailedEvaluation,
  EvaluationResult,
  AggregationMethod,
} from '../evaluation/types.js';
import { EvaluationRegistry } from '../evaluation/registry.js';
import { PatternAnalyzer } from '../evaluation/pattern-analyzer.js';
import { FeedbackSynthesizer } from '../evaluation/feedback-synthesizer.js';
import { AgentService } from '../agent.service.js';
import { Database } from '../../db/client.js';

export interface PredictionResult {
  data: any[];
  groundTruth: any[];
  metadata?: Record<string, any>;
}

export interface CombineStrategiesConfig {
  strategies: string[];
  aggregation: AggregationMethod;
  weights?: number[];
}

export class EvaluationAgent {
  private patternAnalyzer: PatternAnalyzer;
  private feedbackSynthesizer: FeedbackSynthesizer;
  private agentService: AgentService;
  
  constructor(
    private registry: EvaluationRegistry,
    private db: Database
  ) {
    this.patternAnalyzer = new PatternAnalyzer();
    this.feedbackSynthesizer = new FeedbackSynthesizer(registry);
    this.agentService = new AgentService(db);
  }
  
  /**
   * Initialize the evaluation agent
   */
  async initialize(): Promise<void> {
    await this.agentService.initialize();
  }
  
  /**
   * Evaluate configuration with pluggable strategies
   */
  async evaluate(
    config: Config,
    evaluationConfig?: EvaluationConfig
  ): Promise<DetailedEvaluation> {
    // Run predictions on test set
    const predictions = await this.runPredictions(config);
    const context = this.analyzeContext(predictions);
    
    let evaluationResult: EvaluationResult;
    let strategyUsed: string;
    
    if (evaluationConfig?.combineStrategies) {
      // Run multiple strategies and combine results
      const combinedResult = await this.runMultipleStrategies(
        predictions,
        evaluationConfig.combineStrategies
      );
      evaluationResult = combinedResult.result;
      strategyUsed = combinedResult.strategiesUsed.join('+');
    } else {
      // Select or use specified strategy
      const strategy = evaluationConfig?.strategy
        ? this.registry.get(evaluationConfig.strategy)
        : evaluationConfig?.autoSelect !== false
          ? this.registry.selectStrategy(context)
          : this.registry.getDefault();
      
      if (!strategy) {
        throw new Error('No evaluation strategy available');
      }
      
      strategyUsed = strategy.name;
      evaluationResult = await strategy.evaluate(
        predictions.data,
        predictions.groundTruth,
        evaluationConfig
      );
    }
    
    // Get the primary strategy for pattern analysis
    const primaryStrategy = this.registry.get(strategyUsed.split('+')[0]);
    if (!primaryStrategy) {
      throw new Error(`Strategy ${strategyUsed} not found`);
    }
    
    // Analyze patterns
    const patterns = this.patternAnalyzer.analyzePatterns(
      evaluationResult,
      primaryStrategy
    );
    
    // Generate comprehensive feedback
    const feedback = this.feedbackSynthesizer.synthesize(
      evaluationResult,
      primaryStrategy,
      evaluationConfig?.feedbackDetail || 'standard'
    );
    
    return {
      score: evaluationResult.score,
      evaluationMethod: strategyUsed,
      results: evaluationResult,
      patterns,
      feedback,
    };
  }
  
  /**
   * Evaluate with historical context
   */
  async evaluateWithHistory(
    config: Config,
    previousEvaluations: DetailedEvaluation[],
    evaluationConfig?: EvaluationConfig
  ): Promise<DetailedEvaluation> {
    const evaluation = await this.evaluate(config, evaluationConfig);
    
    // Track pattern evolution
    this.patternAnalyzer.trackPatternEvolution(
      evaluation.patterns,
      previousEvaluations.length + 1
    );
    
    // Get persistent patterns
    const persistentPatterns = this.patternAnalyzer.getPersistentPatterns();
    
    // Generate iterative feedback
    const previousResults = previousEvaluations.map(e => e.results);
    const primaryStrategy = this.registry.get(evaluation.evaluationMethod.split('+')[0]);
    
    if (primaryStrategy) {
      const iterativeFeedback = this.feedbackSynthesizer.generateIterativeFeedback(
        evaluation.results,
        previousResults,
        primaryStrategy
      );
      
      // Merge with persistent pattern feedback
      const patternFeedback = this.feedbackSynthesizer.generatePatternFeedback(persistentPatterns);
      
      evaluation.feedback = this.feedbackSynthesizer.combineFeedback(
        new Map([
          ['current', iterativeFeedback],
          ['patterns', patternFeedback],
        ]),
        'current'
      );
    }
    
    // Add persistent patterns to the evaluation
    evaluation.patterns.push(...persistentPatterns);
    
    return evaluation;
  }
  
  /**
   * Run predictions using the agent service
   */
  private async runPredictions(config: Config): Promise<PredictionResult> {
    // This would typically load test data and run predictions
    // For now, returning mock data structure
    // In real implementation, this would:
    // 1. Load test dataset
    // 2. Run agent.score() for each test item
    // 3. Collect predictions and ground truth
    
    const testData: any[] = []; // Load from database
    const predictions: any[] = [];
    const groundTruth: any[] = [];
    
    // TODO: Implement actual prediction logic
    // for (const item of testData) {
    //   const prediction = await this.agentService.score(item.content, config);
    //   predictions.push(prediction);
    //   groundTruth.push(item.expectedScore);
    // }
    
    return {
      data: predictions,
      groundTruth,
      metadata: {
        configId: config.id,
        timestamp: new Date(),
      },
    };
  }
  
  /**
   * Analyze context from predictions
   */
  private analyzeContext(predictions: PredictionResult): EvaluationContext {
    const data = predictions.data;
    const groundTruth = predictions.groundTruth;
    
    // Determine data characteristics
    const hasNumericGroundTruth = groundTruth.some(gt => typeof gt === 'number');
    const hasTextualContent = data.some(d => typeof d === 'string' || (d && typeof d.response === 'string'));
    const hasFactRequirements = groundTruth.some(gt => gt && gt.facts);
    
    return {
      hasNumericGroundTruth,
      hasTextualContent,
      hasFactRequirements,
      dataType: this.inferDataType(data),
      sampleSize: data.length,
    };
  }
  
  /**
   * Infer data type from samples
   */
  private inferDataType(data: any[]): string {
    if (data.length === 0) return 'unknown';
    
    const sample = data[0];
    if (typeof sample === 'number') return 'numeric';
    if (typeof sample === 'string') return 'text';
    if (sample && typeof sample === 'object') {
      if (sample.score !== undefined) return 'scored';
      if (sample.response !== undefined) return 'response';
      if (sample.facts !== undefined) return 'factual';
    }
    
    return 'mixed';
  }
  
  /**
   * Run multiple strategies and combine results
   */
  private async runMultipleStrategies(
    predictions: PredictionResult,
    config: CombineStrategiesConfig
  ): Promise<{ result: EvaluationResult; strategiesUsed: string[] }> {
    // Run strategies in parallel
    const results = await Promise.all(
      config.strategies.map(async (name) => {
        const strategy = this.registry.get(name);
        if (!strategy) {
          throw new Error(`Strategy '${name}' not found`);
        }
        return {
          name,
          result: await strategy.evaluate(predictions.data, predictions.groundTruth),
        };
      })
    );
    
    // Aggregate results based on configuration
    const aggregatedResult = this.aggregateResults(
      results.map(r => r.result),
      config.aggregation,
      config.weights
    );
    
    return {
      result: aggregatedResult,
      strategiesUsed: config.strategies,
    };
  }
  
  /**
   * Aggregate results from multiple strategies
   */
  private aggregateResults(
    results: EvaluationResult[],
    aggregation: AggregationMethod,
    weights?: number[]
  ): EvaluationResult {
    switch (aggregation) {
      case 'weighted':
        return this.weightedAggregation(results, weights);
        
      case 'voting':
        return this.votingAggregation(results);
        
      case 'ensemble':
        return this.ensembleAggregation(results);
        
      default:
        throw new Error(`Unknown aggregation method: ${aggregation}`);
    }
  }
  
  /**
   * Weighted aggregation of results
   */
  private weightedAggregation(
    results: EvaluationResult[],
    weights?: number[]
  ): EvaluationResult {
    const normalizedWeights = this.normalizeWeights(weights || [], results.length);
    
    let weightedScore = 0;
    const mergedMetrics: Record<string, number> = {};
    const allDetails: any[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const weight = normalizedWeights[i];
      
      weightedScore += result.score * weight;
      
      // Merge metrics with weighting
      if (result.metrics) {
        for (const [key, value] of Object.entries(result.metrics)) {
          if (typeof value === 'number') {
            mergedMetrics[key] = (mergedMetrics[key] || 0) + value * weight;
          }
        }
      }
      
      if (result.details) {
        allDetails.push(...result.details);
      }
    }
    
    return {
      score: weightedScore,
      metrics: mergedMetrics,
      details: allDetails,
      insights: ['Aggregated using weighted method'],
    };
  }
  
  /**
   * Voting-based aggregation
   */
  private votingAggregation(results: EvaluationResult[]): EvaluationResult {
    // For voting, we categorize scores and take majority
    const categories = results.map(r => this.categorizeScore(r.score));
    const voteCounts = new Map<string, number>();
    
    for (const category of categories) {
      voteCounts.set(category, (voteCounts.get(category) || 0) + 1);
    }
    
    // Find majority category
    let majorityCategory = '';
    let maxVotes = 0;
    for (const [category, votes] of voteCounts) {
      if (votes > maxVotes) {
        majorityCategory = category;
        maxVotes = votes;
      }
    }
    
    // Calculate average score within majority category
    const majorityResults = results.filter((r, i) => 
      categories[i] === majorityCategory
    );
    const avgScore = majorityResults.reduce((sum, r) => sum + r.score, 0) / majorityResults.length;
    
    return {
      score: avgScore,
      metrics: {
        votingCategory: majorityCategory as any,
        votingConfidence: maxVotes / results.length,
      },
      insights: [`Majority vote: ${majorityCategory} (${maxVotes}/${results.length} votes)`],
    };
  }
  
  /**
   * Ensemble aggregation (more sophisticated combination)
   */
  private ensembleAggregation(results: EvaluationResult[]): EvaluationResult {
    // Ensemble uses a more sophisticated approach
    // considering variance and confidence
    
    const scores = results.map(r => r.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = this.calculateVariance(scores);
    
    // Adjust score based on agreement (lower variance = higher confidence)
    const confidenceMultiplier = Math.max(0.5, 1 - variance);
    const adjustedScore = mean * confidenceMultiplier;
    
    // Merge all metrics
    const mergedMetrics: Record<string, any> = {
      ensembleMean: mean,
      ensembleVariance: variance,
      ensembleConfidence: confidenceMultiplier,
    };
    
    for (const result of results) {
      if (result.metrics) {
        for (const [key, value] of Object.entries(result.metrics)) {
          if (!mergedMetrics[key]) {
            mergedMetrics[key] = value;
          }
        }
      }
    }
    
    return {
      score: adjustedScore,
      metrics: mergedMetrics,
      insights: [
        `Ensemble score: ${(adjustedScore * 100).toFixed(1)}%`,
        `Confidence: ${(confidenceMultiplier * 100).toFixed(0)}%`,
      ],
    };
  }
  
  /**
   * Categorize score for voting
   */
  private categorizeScore(score: number): string {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'fair';
    if (score >= 0.3) return 'poor';
    return 'very-poor';
  }
  
  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: number[], count: number): number[] {
    if (weights.length === 0) {
      // Equal weights if not specified
      return Array(count).fill(1 / count);
    }
    
    if (weights.length !== count) {
      throw new Error(`Weight count (${weights.length}) doesn't match strategy count (${count})`);
    }
    
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }
  
  /**
   * Calculate variance for ensemble
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}