import type { Config } from '../../db/schema/configs.js';
import type { 
  DetailedFeedback, 
  ImprovementStep, 
  ResearchInsight,
  DetailedEvaluation 
} from '../evaluation/types.js';

export interface OptimizationParams {
  baseConfig: Config;
  targetScore: number;
  maxIterations: number;
  minImprovement: number;
  evaluationStrategy?: string;
  enableResearch: boolean;
  convergenceThreshold: number;
}

export interface OptimizationResult {
  finalConfig: Config;
  finalScore: number;
  iterations: number;
  history: ImprovementStep[];
  totalImprovement: number;
  converged: boolean;
  stoppedReason: string;
}

export class OptimizationState {
  public currentConfig: Config;
  public iterationCount: number = 0;
  public score: number = 0;
  public feedback: DetailedFeedback | null = null;
  public improvementHistory: ImprovementStep[] = [];
  public researchFindings: ResearchInsight[] = [];
  public convergenceMetrics: {
    scoreImprovement: number;
    consecutiveNoImprovement: number;
    averageImprovement: number;
    recentScores: number[];
  };
  
  private readonly params: OptimizationParams;
  private startTime: Date;
  private evaluationHistory: DetailedEvaluation[] = [];
  
  constructor(params: OptimizationParams) {
    this.params = params;
    this.currentConfig = params.baseConfig;
    this.startTime = new Date();
    this.convergenceMetrics = {
      scoreImprovement: 0,
      consecutiveNoImprovement: 0,
      averageImprovement: 0,
      recentScores: [],
    };
  }
  
  /**
   * Check if optimization is complete
   */
  isComplete(): boolean {
    // Check if target score is reached
    if (this.score >= this.params.targetScore) {
      return true;
    }
    
    // Check if max iterations reached
    if (this.iterationCount >= this.params.maxIterations) {
      return true;
    }
    
    // Check for convergence
    if (this.hasConverged()) {
      return true;
    }
    
    // Check for stuck optimization (no improvement for too long)
    if (this.convergenceMetrics.consecutiveNoImprovement >= 3) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Update state with new evaluation results
   */
  update(
    config: Config,
    evaluation: DetailedEvaluation,
    research?: ResearchInsight[]
  ): void {
    const previousScore = this.score;
    this.currentConfig = config;
    this.score = evaluation.score;
    this.feedback = evaluation.feedback;
    this.evaluationHistory.push(evaluation);
    
    // Update research findings
    if (research) {
      this.researchFindings.push(...research);
    }
    
    // Calculate improvement
    const improvement = this.score - previousScore;
    
    // Update convergence metrics
    this.updateConvergenceMetrics(improvement);
    
    // Add to history
    const step: ImprovementStep = {
      iteration: this.iterationCount,
      config,
      score: this.score,
      improvement,
      strategies: this.extractStrategiesUsed(evaluation),
      feedback: evaluation.feedback,
      timestamp: new Date(),
    };
    
    this.improvementHistory.push(step);
    this.iterationCount++;
  }
  
  /**
   * Check if optimization has converged
   */
  private hasConverged(): boolean {
    // Need at least 3 iterations to check convergence
    if (this.convergenceMetrics.recentScores.length < 3) {
      return false;
    }
    
    // Check if variance in recent scores is below threshold
    const variance = this.calculateVariance(this.convergenceMetrics.recentScores);
    return variance < this.params.convergenceThreshold;
  }
  
  /**
   * Update convergence metrics
   */
  private updateConvergenceMetrics(improvement: number): void {
    // Update improvement metrics
    this.convergenceMetrics.scoreImprovement = improvement;
    
    // Track consecutive no improvement
    if (improvement < this.params.minImprovement) {
      this.convergenceMetrics.consecutiveNoImprovement++;
    } else {
      this.convergenceMetrics.consecutiveNoImprovement = 0;
    }
    
    // Update recent scores (keep last 5)
    this.convergenceMetrics.recentScores.push(this.score);
    if (this.convergenceMetrics.recentScores.length > 5) {
      this.convergenceMetrics.recentScores.shift();
    }
    
    // Calculate average improvement
    if (this.improvementHistory.length > 0) {
      const totalImprovement = this.improvementHistory.reduce(
        (sum, step) => sum + step.improvement,
        0
      );
      this.convergenceMetrics.averageImprovement = 
        totalImprovement / this.improvementHistory.length;
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
   * Extract strategies used from evaluation
   */
  private extractStrategiesUsed(evaluation: DetailedEvaluation): string[] {
    const strategies: string[] = [];
    
    // Add evaluation method
    strategies.push(`eval:${evaluation.evaluationMethod}`);
    
    // Add patterns identified
    if (evaluation.patterns.length > 0) {
      strategies.push(`patterns:${evaluation.patterns.length}`);
    }
    
    // Add feedback insights
    if (evaluation.feedback.actionItems && evaluation.feedback.actionItems.length > 0) {
      strategies.push(`actions:${evaluation.feedback.actionItems.length}`);
    }
    
    return strategies;
  }
  
  /**
   * Finalize optimization and return results
   */
  finalize(): OptimizationResult {
    const totalImprovement = this.score - (this.improvementHistory[0]?.score || 0);
    const converged = this.hasConverged();
    
    let stoppedReason = 'unknown';
    if (this.score >= this.params.targetScore) {
      stoppedReason = 'target-reached';
    } else if (this.iterationCount >= this.params.maxIterations) {
      stoppedReason = 'max-iterations';
    } else if (converged) {
      stoppedReason = 'converged';
    } else if (this.convergenceMetrics.consecutiveNoImprovement >= 3) {
      stoppedReason = 'no-improvement';
    }
    
    return {
      finalConfig: this.currentConfig,
      finalScore: this.score,
      iterations: this.iterationCount,
      history: this.improvementHistory,
      totalImprovement,
      converged,
      stoppedReason,
    };
  }
  
  /**
   * Get current state summary
   */
  getSummary(): string {
    const improvement = this.convergenceMetrics.scoreImprovement;
    const trend = improvement > 0 ? '↑' : improvement < 0 ? '↓' : '→';
    
    return `Iteration ${this.iterationCount}: Score ${(this.score * 100).toFixed(1)}% ${trend} ` +
           `(${improvement > 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%) | ` +
           `Avg improvement: ${(this.convergenceMetrics.averageImprovement * 100).toFixed(1)}%`;
  }
  
  /**
   * Get recommendations for next iteration
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Check if stuck
    if (this.convergenceMetrics.consecutiveNoImprovement >= 2) {
      recommendations.push('Consider more aggressive optimization strategies');
      recommendations.push('Try different evaluation methods');
    }
    
    // Check if close to target
    const distanceToTarget = this.params.targetScore - this.score;
    if (distanceToTarget < 0.1) {
      recommendations.push('Fine-tune parameters for final optimization');
    }
    
    // Check if improvement is slowing
    if (this.convergenceMetrics.averageImprovement < 0.02) {
      recommendations.push('Optimization may be reaching limits - consider alternative approaches');
    }
    
    return recommendations;
  }
  
  /**
   * Get state for persistence
   */
  toJSON(): any {
    return {
      currentConfig: this.currentConfig,
      iterationCount: this.iterationCount,
      score: this.score,
      feedback: this.feedback,
      improvementHistory: this.improvementHistory,
      researchFindings: this.researchFindings,
      convergenceMetrics: this.convergenceMetrics,
      params: this.params,
      startTime: this.startTime,
    };
  }
  
  /**
   * Restore state from JSON
   */
  static fromJSON(json: any): OptimizationState {
    const state = new OptimizationState(json.params);
    state.currentConfig = json.currentConfig;
    state.iterationCount = json.iterationCount;
    state.score = json.score;
    state.feedback = json.feedback;
    state.improvementHistory = json.improvementHistory;
    state.researchFindings = json.researchFindings;
    state.convergenceMetrics = json.convergenceMetrics;
    state.startTime = new Date(json.startTime);
    return state;
  }
  
  /**
   * Get best configuration from history
   */
  getBestConfiguration(): { config: Config; score: number } | null {
    if (this.improvementHistory.length === 0) {
      return null;
    }
    
    const best = this.improvementHistory.reduce((best, step) => 
      step.score > best.score ? step : best
    );
    
    return {
      config: best.config,
      score: best.score,
    };
  }
  
  /**
   * Get evaluation history
   */
  getEvaluationHistory(): DetailedEvaluation[] {
    return this.evaluationHistory;
  }
}