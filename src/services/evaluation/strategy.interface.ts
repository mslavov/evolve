import type {
  EvaluationStrategyType,
  EvaluationConfig,
  EvaluationResult,
  DetailedFeedback,
  EvaluationContext,
  FailurePattern,
} from './types.js';

export interface EvaluationStrategy {
  name: string;
  type: EvaluationStrategyType;
  
  /**
   * Evaluate predictions against ground truth
   */
  evaluate(
    predictions: any[],
    groundTruth: any[],
    config?: EvaluationConfig
  ): Promise<EvaluationResult>;
  
  /**
   * Generate detailed feedback from evaluation results
   */
  generateFeedback(result: EvaluationResult): DetailedFeedback;
  
  /**
   * Check if this strategy is applicable to the given context
   */
  isApplicable(context: EvaluationContext): boolean;
  
  /**
   * Analyze patterns in evaluation results (optional)
   */
  analyzePatterns?(results: EvaluationResult[]): FailurePattern[];
  
  /**
   * Get strategy-specific configuration defaults
   */
  getDefaultConfig?(): Partial<EvaluationConfig>;
  
  /**
   * Validate input data format
   */
  validateInput?(predictions: any[], groundTruth: any[]): boolean;
}