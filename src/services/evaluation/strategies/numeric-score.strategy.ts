import type { EvaluationStrategy } from '../strategy.interface.js';
import type {
  EvaluationConfig,
  EvaluationResult,
  DetailedFeedback,
  EvaluationContext,
  FailurePattern,
  EvaluationExample,
} from '../types.js';

export class NumericScoreEvaluator implements EvaluationStrategy {
  name = 'numeric-score';
  type = 'numeric' as const;
  
  async evaluate(
    predictions: number[],
    groundTruth: number[],
    config?: EvaluationConfig
  ): Promise<EvaluationResult> {
    if (predictions.length !== groundTruth.length) {
      throw new Error('Predictions and ground truth must have the same length');
    }
    
    const errors = predictions.map((p, i) => p - groundTruth[i]);
    const absoluteErrors = errors.map(e => Math.abs(e));
    
    // Calculate metrics
    const rmse = Math.sqrt(
      errors.reduce((sum, e) => sum + e * e, 0) / errors.length
    );
    
    const mae = absoluteErrors.reduce((sum, e) => sum + e, 0) / errors.length;
    
    const correlation = this.calculateCorrelation(predictions, groundTruth);
    
    const bias = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    
    // Calculate consistency (how stable predictions are for similar inputs)
    const consistency = this.calculateConsistency(predictions, groundTruth);
    
    // Convert RMSE to 0-1 score (assuming max error of 1.0)
    const score = Math.max(0, 1 - rmse);
    
    // Prepare detailed results
    const details = predictions.map((predicted, i) => ({
      predicted,
      actual: groundTruth[i],
      error: errors[i],
      absoluteError: absoluteErrors[i],
      percentageError: groundTruth[i] !== 0 
        ? (errors[i] / groundTruth[i]) * 100 
        : null,
    }));
    
    return {
      score,
      metrics: {
        rmse,
        mae,
        correlation,
        bias,
        consistency,
        maxError: Math.max(...absoluteErrors),
        minError: Math.min(...absoluteErrors),
        errorStdDev: this.calculateStdDev(errors),
      },
      details,
    };
  }
  
  generateFeedback(result: EvaluationResult): DetailedFeedback {
    const metrics = result.metrics || {};
    const score = result.score;
    
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const actionItems: string[] = [];
    
    // Analyze strengths
    if (metrics.correlation && metrics.correlation > 0.8) {
      strengths.push('Strong correlation with ground truth');
    }
    if (metrics.mae && metrics.mae < 0.1) {
      strengths.push('Low average error rate');
    }
    if (metrics.consistency && metrics.consistency > 0.9) {
      strengths.push('High prediction consistency');
    }
    if (Math.abs(metrics.bias || 0) < 0.05) {
      strengths.push('Minimal systematic bias');
    }
    
    // Analyze weaknesses
    if (metrics.correlation && metrics.correlation < 0.5) {
      weaknesses.push('Poor correlation with ground truth');
      actionItems.push('Review the scoring logic and criteria');
    }
    if (metrics.mae && metrics.mae > 0.2) {
      weaknesses.push('High average error rate');
      actionItems.push('Consider adjusting model parameters or prompt');
    }
    if (metrics.consistency && metrics.consistency < 0.7) {
      weaknesses.push('Inconsistent predictions');
      actionItems.push('Improve stability through temperature adjustment');
    }
    if (Math.abs(metrics.bias || 0) > 0.1) {
      const direction = (metrics.bias || 0) > 0 ? 'overestimating' : 'underestimating';
      weaknesses.push(`Systematic bias: ${direction} scores`);
      actionItems.push(`Adjust calibration to correct for ${direction}`);
    }
    
    // Analyze patterns in errors
    const patterns = this.identifyErrorPatterns(result.details || []);
    
    return {
      summary: `Numeric evaluation score: ${(score * 100).toFixed(1)}%`,
      strengths: strengths.length > 0 ? strengths : ['None identified'],
      weaknesses: weaknesses.length > 0 ? weaknesses : ['None identified'],
      patterns,
      actionItems: actionItems.length > 0 ? actionItems : ['Continue monitoring performance'],
      improvements: this.generateImprovementSuggestions(metrics),
    };
  }
  
  isApplicable(context: EvaluationContext): boolean {
    return context.hasNumericGroundTruth && !context.hasFactRequirements;
  }
  
  analyzePatterns(results: EvaluationResult[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    const allDetails = results.flatMap(r => r.details || []);
    
    // Pattern: Consistent overestimation
    const overestimations = allDetails.filter(d => d.error > 0.1);
    if (overestimations.length > allDetails.length * 0.3) {
      patterns.push({
        type: 'consistent-overestimation',
        frequency: overestimations.length / allDetails.length,
        examples: overestimations.slice(0, 3).map(d => ({
          input: d,
          expected: d.actual,
          actual: d.predicted,
          error: `Overestimated by ${d.error.toFixed(3)}`,
        })),
        suggestedFix: 'Reduce model confidence or adjust temperature downward',
        evaluatorSource: this.name,
      });
    }
    
    // Pattern: High variance
    const errors = allDetails.map(d => d.error);
    const errorStdDev = this.calculateStdDev(errors);
    if (errorStdDev > 0.2) {
      patterns.push({
        type: 'high-variance',
        frequency: 1,
        examples: this.getHighVarianceExamples(allDetails),
        suggestedFix: 'Improve prompt consistency or use more structured output format',
        evaluatorSource: this.name,
      });
    }
    
    // Pattern: Edge case failures
    const edgeCases = allDetails.filter(d => 
      d.actual === 0 || d.actual === 1 || d.actual < 0.1 || d.actual > 0.9
    );
    const edgeErrors = edgeCases.filter(d => Math.abs(d.error) > 0.2);
    if (edgeErrors.length > edgeCases.length * 0.5 && edgeCases.length > 0) {
      patterns.push({
        type: 'edge-case-failures',
        frequency: edgeErrors.length / edgeCases.length,
        examples: edgeErrors.slice(0, 3).map(d => ({
          input: d,
          expected: d.actual,
          actual: d.predicted,
          error: `Error: ${d.error.toFixed(3)}`,
        })),
        suggestedFix: 'Add specific handling for edge cases in prompt',
        evaluatorSource: this.name,
      });
    }
    
    return patterns;
  }
  
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
  
  private calculateConsistency(predictions: number[], groundTruth: number[]): number {
    // Group similar ground truth values and check prediction variance
    const groups = new Map<number, number[]>();
    
    groundTruth.forEach((value, index) => {
      const rounded = Math.round(value * 10) / 10; // Group by 0.1 intervals
      if (!groups.has(rounded)) {
        groups.set(rounded, []);
      }
      groups.get(rounded)!.push(predictions[index]);
    });
    
    let totalConsistency = 0;
    let groupCount = 0;
    
    for (const [_, groupPredictions] of groups) {
      if (groupPredictions.length > 1) {
        const variance = this.calculateVariance(groupPredictions);
        const consistency = Math.max(0, 1 - variance);
        totalConsistency += consistency;
        groupCount++;
      }
    }
    
    return groupCount > 0 ? totalConsistency / groupCount : 1;
  }
  
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
  
  private calculateStdDev(values: number[]): number {
    return Math.sqrt(this.calculateVariance(values));
  }
  
  private identifyErrorPatterns(details: any[]): string[] {
    const patterns: string[] = [];
    
    // Check for systematic patterns
    const highErrors = details.filter(d => Math.abs(d.error) > 0.2);
    const lowValues = details.filter(d => d.actual < 0.3);
    const highValues = details.filter(d => d.actual > 0.7);
    
    if (highErrors.length > details.length * 0.3) {
      patterns.push(`High error rate: ${highErrors.length}/${details.length} predictions have >20% error`);
    }
    
    const lowValueErrors = lowValues.filter(d => Math.abs(d.error) > 0.15);
    if (lowValueErrors.length > lowValues.length * 0.5 && lowValues.length > 0) {
      patterns.push('Poor performance on low-value predictions');
    }
    
    const highValueErrors = highValues.filter(d => Math.abs(d.error) > 0.15);
    if (highValueErrors.length > highValues.length * 0.5 && highValues.length > 0) {
      patterns.push('Poor performance on high-value predictions');
    }
    
    return patterns;
  }
  
  private generateImprovementSuggestions(metrics: Record<string, number>): string[] {
    const suggestions: string[] = [];
    
    if (metrics.rmse && metrics.rmse > 0.15) {
      suggestions.push('Consider using a more powerful model or refining the prompt');
    }
    
    if (metrics.bias && Math.abs(metrics.bias) > 0.1) {
      suggestions.push('Add calibration examples to correct systematic bias');
    }
    
    if (metrics.consistency && metrics.consistency < 0.8) {
      suggestions.push('Reduce temperature for more consistent predictions');
    }
    
    if (metrics.correlation && metrics.correlation < 0.7) {
      suggestions.push('Review scoring criteria alignment with ground truth');
    }
    
    return suggestions;
  }
  
  private getHighVarianceExamples(details: any[]): EvaluationExample[] {
    // Sort by absolute error and get top and bottom examples
    const sorted = [...details].sort((a, b) => b.absoluteError - a.absoluteError);
    const examples: EvaluationExample[] = [];
    
    // Add highest error examples
    for (let i = 0; i < Math.min(2, sorted.length); i++) {
      examples.push({
        input: sorted[i],
        expected: sorted[i].actual,
        actual: sorted[i].predicted,
        error: `High error: ${sorted[i].error.toFixed(3)}`,
      });
    }
    
    // Add lowest error example for contrast
    if (sorted.length > 2) {
      const best = sorted[sorted.length - 1];
      examples.push({
        input: best,
        expected: best.actual,
        actual: best.predicted,
        error: `Low error: ${best.error.toFixed(3)}`,
      });
    }
    
    return examples;
  }
}