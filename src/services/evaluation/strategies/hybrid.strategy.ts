import type { EvaluationStrategy } from '../strategy.interface.js';
import type {
  EvaluationConfig,
  EvaluationResult,
  DetailedFeedback,
  EvaluationContext,
  FailurePattern,
} from '../types.js';
import { NumericScoreEvaluator } from './numeric-score.strategy.js';
import { FactBasedEvaluator } from './fact-based.strategy.js';

export interface HybridWeights {
  numeric: number;
  facts: number;
}

export interface HybridData {
  scores: number[];
  responses: string[];
}

export interface HybridGroundTruth {
  scores: number[];
  facts: any[];
}

export class HybridEvaluator implements EvaluationStrategy {
  name = 'hybrid';
  type = 'hybrid' as const;
  
  constructor(
    private numericEvaluator: NumericScoreEvaluator = new NumericScoreEvaluator(),
    private factEvaluator: FactBasedEvaluator = new FactBasedEvaluator(),
    private weights: HybridWeights = { numeric: 0.5, facts: 0.5 }
  ) {
    // Normalize weights
    const total = this.weights.numeric + this.weights.facts;
    this.weights.numeric /= total;
    this.weights.facts /= total;
  }
  
  async evaluate(
    data: HybridData[],
    groundTruth: HybridGroundTruth[],
    config?: EvaluationConfig
  ): Promise<EvaluationResult> {
    if (data.length !== groundTruth.length) {
      throw new Error('Data and ground truth must have the same length');
    }
    
    // Extract numeric and text data
    const numericPredictions = data.map(d => d.scores).flat();
    const numericGroundTruth = groundTruth.map(gt => gt.scores).flat();
    
    const textResponses = data.map(d => d.responses).flat();
    const factRequirements = groundTruth.map(gt => gt.facts).flat();
    
    // Run both evaluations in parallel
    const [numericResult, factResult] = await Promise.all([
      this.numericEvaluator.evaluate(numericPredictions, numericGroundTruth, config),
      this.factEvaluator.evaluate(textResponses, factRequirements, config),
    ]);
    
    // Combine scores with weights
    const combinedScore = 
      numericResult.score * this.weights.numeric + 
      factResult.score * this.weights.facts;
    
    // Synthesize insights from both evaluations
    const insights = this.synthesizeInsights(numericResult, factResult);
    
    // Merge metrics from both evaluators
    const mergedMetrics = {
      ...numericResult.metrics,
      ...factResult.metrics,
      numericScore: numericResult.score,
      factScore: factResult.score,
      hybridScore: combinedScore,
      numericWeight: this.weights.numeric,
      factWeight: this.weights.facts,
    };
    
    return {
      score: combinedScore,
      metrics: mergedMetrics,
      numericAnalysis: numericResult,
      factAnalysis: factResult,
      insights,
      details: this.combineDetails(numericResult, factResult, data),
    };
  }
  
  generateFeedback(result: EvaluationResult): DetailedFeedback {
    const numericFeedback = this.numericEvaluator.generateFeedback(
      result.numericAnalysis || { score: 0 }
    );
    const factFeedback = this.factEvaluator.generateFeedback(
      result.factAnalysis || { score: 0 }
    );
    
    // Merge feedback from both evaluators
    const strengths = [
      ...this.prefixItems(numericFeedback.strengths || [], '[Numeric]'),
      ...this.prefixItems(factFeedback.strengths || [], '[Facts]'),
    ];
    
    const weaknesses = [
      ...this.prefixItems(numericFeedback.weaknesses || [], '[Numeric]'),
      ...this.prefixItems(factFeedback.weaknesses || [], '[Facts]'),
    ];
    
    const actionItems = this.prioritizeActionItems(
      numericFeedback.actionItems || [],
      factFeedback.actionItems || [],
      result
    );
    
    const patterns = [
      ...(numericFeedback.patterns || []),
      ...(factFeedback.patterns || []),
    ];
    
    const improvements = this.synthesizeImprovements(
      numericFeedback.improvements || [],
      factFeedback.improvements || [],
      result
    );
    
    return {
      summary: this.generateHybridSummary(result),
      strengths: strengths.length > 0 ? strengths : ['None identified'],
      weaknesses: weaknesses.length > 0 ? weaknesses : ['None identified'],
      patterns,
      actionItems,
      improvements,
      risks: this.identifyRisks(result),
    };
  }
  
  isApplicable(context: EvaluationContext): boolean {
    return context.hasNumericGroundTruth && 
           (context.hasTextualContent || context.hasFactRequirements);
  }
  
  analyzePatterns(results: EvaluationResult[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    // Get patterns from both evaluators
    const numericPatterns = this.numericEvaluator.analyzePatterns?.(
      results.map(r => r.numericAnalysis || { score: 0 })
    ) || [];
    
    const factPatterns = this.factEvaluator.analyzePatterns?.(
      results.map(r => r.factAnalysis || { score: 0 })
    ) || [];
    
    // Combine and tag patterns
    patterns.push(
      ...numericPatterns.map(p => ({ ...p, evaluatorSource: 'hybrid-numeric' })),
      ...factPatterns.map(p => ({ ...p, evaluatorSource: 'hybrid-facts' }))
    );
    
    // Add hybrid-specific patterns
    const hybridPatterns = this.identifyHybridPatterns(results);
    patterns.push(...hybridPatterns);
    
    return patterns;
  }
  
  private synthesizeInsights(
    numericResult: EvaluationResult,
    factResult: EvaluationResult
  ): string[] {
    const insights: string[] = [];
    
    // Compare performance between numeric and fact-based evaluation
    const numericScore = numericResult.score;
    const factScore = factResult.score;
    const difference = Math.abs(numericScore - factScore);
    
    if (difference > 0.3) {
      if (numericScore > factScore) {
        insights.push('Strong numeric performance but weak factual accuracy - consider improving content completeness');
      } else {
        insights.push('Good factual coverage but poor numeric accuracy - consider improving scoring calibration');
      }
    }
    
    // Check for correlation between numeric and fact performance
    if (numericScore > 0.8 && factScore > 0.8) {
      insights.push('Excellent overall performance across both dimensions');
    } else if (numericScore < 0.5 && factScore < 0.5) {
      insights.push('Significant improvement needed in both scoring accuracy and content quality');
    }
    
    // Specific metric insights
    const numericMetrics = numericResult.metrics || {};
    const factMetrics = factResult.metrics || {};
    
    if (numericMetrics.consistency && numericMetrics.consistency < 0.7) {
      insights.push('Inconsistent numeric scoring may be affecting overall reliability');
    }
    
    if (factMetrics.averageConfidence && factMetrics.averageConfidence < 0.6) {
      insights.push('Low confidence in fact detection suggests response ambiguity');
    }
    
    return insights;
  }
  
  private combineDetails(
    numericResult: EvaluationResult,
    factResult: EvaluationResult,
    originalData: HybridData[]
  ): any[] {
    const details: any[] = [];
    const numericDetails = numericResult.details || [];
    const factDetails = factResult.details || [];
    
    for (let i = 0; i < originalData.length; i++) {
      details.push({
        input: originalData[i],
        numericAnalysis: numericDetails[i] || null,
        factAnalysis: factDetails[i] || null,
        combinedScore: this.calculateCombinedScore(
          numericDetails[i],
          factDetails[i]
        ),
      });
    }
    
    return details;
  }
  
  private calculateCombinedScore(numericDetail: any, factDetail: any): number {
    const numericScore = numericDetail?.score || 0;
    const factScore = factDetail?.score || 0;
    
    return numericScore * this.weights.numeric + factScore * this.weights.facts;
  }
  
  private prefixItems(items: string[], prefix: string): string[] {
    return items.map(item => `${prefix} ${item}`);
  }
  
  private prioritizeActionItems(
    numericActions: string[],
    factActions: string[],
    result: EvaluationResult
  ): string[] {
    const prioritized: string[] = [];
    const metrics = result.metrics || {};
    
    // Prioritize based on which component needs more improvement
    const numericScore = metrics.numericScore || 0;
    const factScore = metrics.factScore || 0;
    
    if (numericScore < factScore) {
      prioritized.push(...numericActions);
      prioritized.push(...factActions);
    } else {
      prioritized.push(...factActions);
      prioritized.push(...numericActions);
    }
    
    // Remove duplicates
    return [...new Set(prioritized)];
  }
  
  private synthesizeImprovements(
    numericImprovements: string[],
    factImprovements: string[],
    result: EvaluationResult
  ): string[] {
    const improvements: string[] = [];
    const metrics = result.metrics || {};
    
    // Add weighted improvements
    if (metrics.numericScore && metrics.numericScore < 0.7) {
      improvements.push(...numericImprovements);
    }
    
    if (metrics.factScore && metrics.factScore < 0.7) {
      improvements.push(...factImprovements);
    }
    
    // Add hybrid-specific improvements
    if (metrics.numericScore && metrics.factScore) {
      const variance = Math.abs(metrics.numericScore - metrics.factScore);
      if (variance > 0.3) {
        improvements.push('Balance improvement efforts between numeric accuracy and factual completeness');
      }
    }
    
    if (improvements.length === 0 && result.score < 0.8) {
      improvements.push('Consider adjusting the weights between numeric and fact-based evaluation');
    }
    
    return [...new Set(improvements)];
  }
  
  private generateHybridSummary(result: EvaluationResult): string {
    const score = result.score;
    const metrics = result.metrics || {};
    
    let summary = `Hybrid evaluation score: ${(score * 100).toFixed(1)}%`;
    
    if (metrics.numericScore !== undefined && metrics.factScore !== undefined) {
      summary += ` (Numeric: ${(metrics.numericScore * 100).toFixed(0)}%, Facts: ${(metrics.factScore * 100).toFixed(0)}%)`;
    }
    
    return summary;
  }
  
  private identifyRisks(result: EvaluationResult): string[] {
    const risks: string[] = [];
    const metrics = result.metrics || {};
    
    // Check for imbalanced performance
    if (metrics.numericScore && metrics.factScore) {
      const imbalance = Math.abs(metrics.numericScore - metrics.factScore);
      if (imbalance > 0.4) {
        risks.push('Significant performance imbalance between evaluation dimensions');
      }
    }
    
    // Check for low scores in critical areas
    if (metrics.numericScore && metrics.numericScore < 0.4) {
      risks.push('Critical: Numeric accuracy below acceptable threshold');
    }
    
    if (metrics.factScore && metrics.factScore < 0.4) {
      risks.push('Critical: Factual accuracy below acceptable threshold');
    }
    
    // Check for consistency issues
    if (metrics.consistency && metrics.consistency < 0.6) {
      risks.push('Low consistency may lead to unpredictable results');
    }
    
    return risks;
  }
  
  private identifyHybridPatterns(results: EvaluationResult[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    // Pattern: Numeric-fact divergence
    const divergentResults = results.filter(r => {
      const numScore = r.metrics?.numericScore || 0;
      const factScore = r.metrics?.factScore || 0;
      return Math.abs(numScore - factScore) > 0.3;
    });
    
    if (divergentResults.length > results.length * 0.3) {
      patterns.push({
        type: 'numeric-fact-divergence',
        frequency: divergentResults.length / results.length,
        examples: divergentResults.slice(0, 3).map(r => ({
          input: r,
          expected: 'Balanced performance',
          actual: `Numeric: ${(r.metrics?.numericScore || 0).toFixed(2)}, Facts: ${(r.metrics?.factScore || 0).toFixed(2)}`,
          error: 'Performance imbalance between evaluation methods',
        })),
        suggestedFix: 'Review prompt to ensure both accuracy and completeness are addressed',
        evaluatorSource: 'hybrid',
      });
    }
    
    // Pattern: Consistent underperformance
    const underperforming = results.filter(r => r.score < 0.5);
    if (underperforming.length > results.length * 0.5) {
      patterns.push({
        type: 'consistent-underperformance',
        frequency: underperforming.length / results.length,
        examples: underperforming.slice(0, 3).map(r => ({
          input: r,
          expected: 'Score > 0.5',
          actual: `Score: ${r.score.toFixed(2)}`,
          error: 'Below acceptable threshold',
        })),
        suggestedFix: 'Major prompt revision needed - consider restructuring approach',
        evaluatorSource: 'hybrid',
      });
    }
    
    return patterns;
  }
}