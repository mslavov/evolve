import type { EvaluationStrategy } from './strategy.interface.js';
import type { 
  EvaluationResult, 
  DetailedFeedback, 
  FeedbackVerbosity,
  FailurePattern 
} from './types.js';
import { EvaluationRegistry } from './registry.js';

export class FeedbackSynthesizer {
  constructor(private registry: EvaluationRegistry) {}
  
  /**
   * Synthesize comprehensive feedback from evaluation results
   */
  synthesize(
    evaluationResult: EvaluationResult,
    strategy: EvaluationStrategy,
    verbosity: FeedbackVerbosity = 'standard'
  ): DetailedFeedback {
    // Get strategy-specific feedback
    const strategyFeedback = strategy.generateFeedback(evaluationResult);
    
    // Enhance with cross-strategy insights if using multiple evaluators
    const enhancedFeedback = this.crossStrategyAnalysis(
      evaluationResult,
      strategyFeedback
    );
    
    // Format based on verbosity level
    return this.formatFeedback(enhancedFeedback, verbosity);
  }
  
  /**
   * Combine feedback from multiple strategies
   */
  combineFeedback(
    feedbacks: Map<string, DetailedFeedback>,
    mainStrategy?: string
  ): DetailedFeedback {
    const combined: DetailedFeedback = {
      summary: '',
      strengths: [],
      weaknesses: [],
      patterns: [],
      actionItems: [],
      improvements: [],
      risks: [],
    };
    
    // Build summary
    const summaries: string[] = [];
    for (const [strategy, feedback] of feedbacks) {
      const prefix = strategy === mainStrategy ? '[Primary]' : `[${strategy}]`;
      summaries.push(`${prefix} ${feedback.summary}`);
    }
    combined.summary = summaries.join(' | ');
    
    // Merge and deduplicate lists
    for (const feedback of feedbacks.values()) {
      combined.strengths?.push(...(feedback.strengths || []));
      combined.weaknesses?.push(...(feedback.weaknesses || []));
      combined.patterns?.push(...(feedback.patterns || []));
      combined.actionItems?.push(...(feedback.actionItems || []));
      combined.improvements?.push(...(feedback.improvements || []));
      combined.risks?.push(...(feedback.risks || []));
    }
    
    // Deduplicate while preserving order
    combined.strengths = this.deduplicateItems(combined.strengths || []);
    combined.weaknesses = this.deduplicateItems(combined.weaknesses || []);
    combined.patterns = this.deduplicateItems(combined.patterns || []);
    combined.actionItems = this.prioritizeActionItems(combined.actionItems || []);
    combined.improvements = this.deduplicateItems(combined.improvements || []);
    combined.risks = this.prioritizeRisks(combined.risks || []);
    
    return combined;
  }
  
  /**
   * Generate comparative feedback across iterations
   */
  generateIterativeFeedback(
    currentResult: EvaluationResult,
    previousResults: EvaluationResult[],
    strategy: EvaluationStrategy
  ): DetailedFeedback {
    const currentFeedback = strategy.generateFeedback(currentResult);
    
    // Add iteration-specific insights
    const iterationInsights = this.analyzeIterationProgress(
      currentResult,
      previousResults
    );
    
    return {
      ...currentFeedback,
      summary: `${currentFeedback.summary} | Iteration ${previousResults.length + 1}`,
      patterns: [
        ...(currentFeedback.patterns || []),
        ...iterationInsights.patterns,
      ],
      improvements: [
        ...(currentFeedback.improvements || []),
        ...iterationInsights.improvements,
      ],
    };
  }
  
  /**
   * Generate feedback from patterns
   */
  generatePatternFeedback(patterns: FailurePattern[]): DetailedFeedback {
    const feedback: DetailedFeedback = {
      summary: `Identified ${patterns.length} failure patterns`,
      strengths: [],
      weaknesses: [],
      patterns: [],
      actionItems: [],
      improvements: [],
    };
    
    // Group patterns by severity
    const critical = patterns.filter(p => p.frequency > 0.7);
    const major = patterns.filter(p => p.frequency > 0.4 && p.frequency <= 0.7);
    const minor = patterns.filter(p => p.frequency <= 0.4);
    
    // Generate weaknesses from patterns
    if (critical.length > 0) {
      feedback.weaknesses?.push(`Critical issues: ${critical.map(p => p.type).join(', ')}`);
    }
    if (major.length > 0) {
      feedback.weaknesses?.push(`Major issues: ${major.map(p => p.type).join(', ')}`);
    }
    
    // Generate action items from pattern fixes
    const uniqueFixes = new Set<string>();
    for (const pattern of patterns) {
      uniqueFixes.add(pattern.suggestedFix);
      feedback.patterns?.push(
        `${pattern.type} (${(pattern.frequency * 100).toFixed(0)}% frequency)`
      );
    }
    
    feedback.actionItems = Array.from(uniqueFixes);
    
    // Prioritize improvements
    if (critical.length > 0) {
      feedback.improvements?.push('Address critical patterns immediately');
    }
    if (patterns.some(p => p.type.includes('persistent'))) {
      feedback.improvements?.push('Focus on breaking persistent failure patterns');
    }
    
    return feedback;
  }
  
  /**
   * Enhance feedback with cross-strategy insights
   */
  private crossStrategyAnalysis(
    result: EvaluationResult,
    baseFeedback: DetailedFeedback
  ): DetailedFeedback {
    const enhanced = { ...baseFeedback };
    
    // Check if result contains multiple strategy analyses
    if (result.numericAnalysis && result.factAnalysis) {
      const numericScore = result.numericAnalysis.score;
      const factScore = result.factAnalysis.score;
      const difference = Math.abs(numericScore - factScore);
      
      if (difference > 0.3) {
        enhanced.patterns = enhanced.patterns || [];
        enhanced.patterns.push(
          `Significant divergence between evaluation methods (${(difference * 100).toFixed(0)}% difference)`
        );
        
        enhanced.improvements = enhanced.improvements || [];
        enhanced.improvements.push(
          'Consider balancing optimization efforts across different evaluation dimensions'
        );
      }
    }
    
    // Add insights based on score thresholds
    if (result.score < 0.3) {
      enhanced.risks = enhanced.risks || [];
      enhanced.risks.push('Performance critically below acceptable threshold');
    } else if (result.score > 0.9) {
      enhanced.strengths = enhanced.strengths || [];
      enhanced.strengths.push('Exceptional performance achieved');
    }
    
    return enhanced;
  }
  
  /**
   * Format feedback based on verbosity level
   */
  private formatFeedback(
    feedback: DetailedFeedback,
    verbosity: FeedbackVerbosity
  ): DetailedFeedback {
    switch (verbosity) {
      case 'minimal':
        return {
          summary: feedback.summary,
          actionItems: feedback.actionItems?.slice(0, 3),
        };
        
      case 'standard':
        return {
          summary: feedback.summary,
          strengths: feedback.strengths?.slice(0, 3),
          weaknesses: feedback.weaknesses?.slice(0, 3),
          actionItems: feedback.actionItems?.slice(0, 5),
          improvements: feedback.improvements?.slice(0, 3),
        };
        
      case 'detailed':
        return feedback; // Return everything
        
      default:
        return feedback;
    }
  }
  
  /**
   * Analyze progress across iterations
   */
  private analyzeIterationProgress(
    current: EvaluationResult,
    previous: EvaluationResult[]
  ): { patterns: string[]; improvements: string[] } {
    const patterns: string[] = [];
    const improvements: string[] = [];
    
    if (previous.length === 0) {
      return { patterns, improvements };
    }
    
    const lastResult = previous[previous.length - 1];
    const improvement = current.score - lastResult.score;
    
    // Analyze score trend
    if (improvement > 0.1) {
      patterns.push(`Significant improvement: +${(improvement * 100).toFixed(1)}%`);
    } else if (improvement > 0) {
      patterns.push(`Moderate improvement: +${(improvement * 100).toFixed(1)}%`);
    } else if (improvement < -0.05) {
      patterns.push(`Performance regression: ${(improvement * 100).toFixed(1)}%`);
      improvements.push('Review recent changes - performance has degraded');
    } else {
      patterns.push('Performance plateau detected');
      improvements.push('Consider alternative optimization strategies');
    }
    
    // Check for convergence
    if (previous.length >= 3) {
      const recentScores = previous.slice(-3).map(r => r.score);
      recentScores.push(current.score);
      const variance = this.calculateVariance(recentScores);
      
      if (variance < 0.01) {
        patterns.push('Optimization has converged');
        improvements.push('Current approach may have reached its limit');
      }
    }
    
    // Check for oscillation
    if (previous.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < previous.length; i++) {
        deltas.push(previous[i].score - previous[i - 1].score);
      }
      deltas.push(current.score - lastResult.score);
      
      const signChanges = deltas.slice(1).filter((d, i) => 
        Math.sign(d) !== Math.sign(deltas[i])
      ).length;
      
      if (signChanges > deltas.length * 0.5) {
        patterns.push('Oscillating performance detected');
        improvements.push('Stabilize optimization approach to prevent oscillation');
      }
    }
    
    return { patterns, improvements };
  }
  
  /**
   * Deduplicate items while preserving order
   */
  private deduplicateItems(items: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    
    for (const item of items) {
      const normalized = item.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(item);
      }
    }
    
    return unique;
  }
  
  /**
   * Prioritize action items by importance
   */
  private prioritizeActionItems(items: string[]): string[] {
    const prioritized: Array<{ item: string; priority: number }> = [];
    
    for (const item of items) {
      let priority = 0;
      
      // Higher priority for critical keywords
      if (item.toLowerCase().includes('critical')) priority += 3;
      if (item.toLowerCase().includes('major')) priority += 2;
      if (item.toLowerCase().includes('fix')) priority += 2;
      if (item.toLowerCase().includes('immediately')) priority += 3;
      if (item.toLowerCase().includes('address')) priority += 1;
      
      prioritized.push({ item, priority });
    }
    
    // Sort by priority (descending) and deduplicate
    prioritized.sort((a, b) => b.priority - a.priority);
    return this.deduplicateItems(prioritized.map(p => p.item));
  }
  
  /**
   * Prioritize risks by severity
   */
  private prioritizeRisks(risks: string[]): string[] {
    const prioritized: Array<{ risk: string; severity: number }> = [];
    
    for (const risk of risks) {
      let severity = 0;
      
      // Higher severity for critical keywords
      if (risk.toLowerCase().includes('critical')) severity += 5;
      if (risk.toLowerCase().includes('high')) severity += 3;
      if (risk.toLowerCase().includes('significant')) severity += 2;
      if (risk.toLowerCase().includes('performance')) severity += 2;
      if (risk.toLowerCase().includes('failure')) severity += 4;
      
      prioritized.push({ risk, severity });
    }
    
    // Sort by severity (descending) and deduplicate
    prioritized.sort((a, b) => b.severity - a.severity);
    return this.deduplicateItems(prioritized.map(p => p.risk));
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
}