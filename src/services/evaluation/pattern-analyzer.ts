import type { EvaluationStrategy } from './strategy.interface.js';
import type { EvaluationResult, FailurePattern, EvaluationExample } from './types.js';

export class PatternAnalyzer {
  private patternHistory: Map<string, FailurePattern[]> = new Map();
  private patternFrequency: Map<string, number> = new Map();
  
  /**
   * Analyze patterns in evaluation results based on the strategy used
   */
  analyzePatterns(
    results: EvaluationResult | EvaluationResult[],
    strategy: EvaluationStrategy
  ): FailurePattern[] {
    const resultsArray = Array.isArray(results) ? results : [results];
    
    // Use strategy-specific pattern analysis if available
    if (strategy.analyzePatterns) {
      return strategy.analyzePatterns(resultsArray);
    }
    
    // Otherwise, use generic pattern analysis
    return this.genericPatternAnalysis(resultsArray, strategy.name);
  }
  
  /**
   * Cross-strategy pattern analysis
   */
  analyzeCrossStrategyPatterns(
    resultsByStrategy: Map<string, EvaluationResult[]>
  ): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    // Look for patterns that appear across multiple strategies
    const allPatterns = new Map<string, { pattern: FailurePattern; strategies: Set<string> }>();
    
    for (const [strategyName, results] of resultsByStrategy) {
      const strategyPatterns = this.genericPatternAnalysis(results, strategyName);
      
      for (const pattern of strategyPatterns) {
        const key = `${pattern.type}:${pattern.suggestedFix}`;
        
        if (!allPatterns.has(key)) {
          allPatterns.set(key, {
            pattern: { ...pattern },
            strategies: new Set([strategyName]),
          });
        } else {
          const existing = allPatterns.get(key)!;
          existing.strategies.add(strategyName);
          existing.pattern.frequency = Math.max(existing.pattern.frequency, pattern.frequency);
          existing.pattern.examples.push(...pattern.examples.slice(0, 1));
        }
      }
    }
    
    // Include patterns that appear in multiple strategies
    for (const { pattern, strategies } of allPatterns.values()) {
      if (strategies.size > 1) {
        patterns.push({
          ...pattern,
          type: `cross-strategy-${pattern.type}`,
          evaluatorSource: Array.from(strategies).join(', '),
        });
      }
    }
    
    return patterns;
  }
  
  /**
   * Track pattern evolution over time
   */
  trackPatternEvolution(
    patterns: FailurePattern[],
    iterationNumber: number
  ): void {
    const key = `iteration-${iterationNumber}`;
    this.patternHistory.set(key, patterns);
    
    // Update frequency tracking
    for (const pattern of patterns) {
      const count = this.patternFrequency.get(pattern.type) || 0;
      this.patternFrequency.set(pattern.type, count + 1);
    }
  }
  
  /**
   * Get persistent patterns (appearing across multiple iterations)
   */
  getPersistentPatterns(minIterations: number = 3): FailurePattern[] {
    const persistentPatterns: FailurePattern[] = [];
    
    for (const [type, frequency] of this.patternFrequency) {
      if (frequency >= minIterations) {
        // Find the most recent occurrence of this pattern
        for (const [_, patterns] of Array.from(this.patternHistory.entries()).reverse()) {
          const pattern = patterns.find(p => p.type === type);
          if (pattern) {
            persistentPatterns.push({
              ...pattern,
              type: `persistent-${pattern.type}`,
              frequency: frequency / this.patternHistory.size,
            });
            break;
          }
        }
      }
    }
    
    return persistentPatterns;
  }
  
  /**
   * Identify improvement opportunities from patterns
   */
  suggestImprovements(patterns: FailurePattern[]): string[] {
    const improvements = new Set<string>();
    
    // Group patterns by type
    const patternsByType = new Map<string, FailurePattern[]>();
    for (const pattern of patterns) {
      const baseType = pattern.type.replace(/^(persistent-|cross-strategy-)/, '');
      if (!patternsByType.has(baseType)) {
        patternsByType.set(baseType, []);
      }
      patternsByType.get(baseType)!.push(pattern);
    }
    
    // Generate improvements based on pattern types
    for (const [type, typePatterns] of patternsByType) {
      const avgFrequency = typePatterns.reduce((sum, p) => sum + p.frequency, 0) / typePatterns.length;
      
      if (type.includes('overestimation') || type.includes('underestimation')) {
        improvements.add('Implement calibration mechanism to correct systematic bias');
      }
      
      if (type.includes('variance') || type.includes('inconsistent')) {
        improvements.add('Stabilize predictions through temperature adjustment or few-shot examples');
      }
      
      if (type.includes('missing') || type.includes('incomplete')) {
        improvements.add('Enhance prompt with explicit requirements and structure');
      }
      
      if (type.includes('edge-case')) {
        improvements.add('Add specialized handling for boundary conditions');
      }
      
      if (avgFrequency > 0.5) {
        improvements.add(`Priority fix: ${typePatterns[0].suggestedFix}`);
      }
    }
    
    return Array.from(improvements);
  }
  
  /**
   * Generic pattern analysis for strategies without specific implementation
   */
  private genericPatternAnalysis(
    results: EvaluationResult[],
    strategyName: string
  ): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    // Pattern: Low scores
    const lowScores = results.filter(r => r.score < 0.5);
    if (lowScores.length > results.length * 0.3) {
      patterns.push({
        type: 'low-scores',
        frequency: lowScores.length / results.length,
        examples: this.extractExamples(lowScores, 'Low score'),
        suggestedFix: 'Review evaluation criteria and prompt effectiveness',
        evaluatorSource: strategyName,
      });
    }
    
    // Pattern: High variance
    const scores = results.map(r => r.score);
    const variance = this.calculateVariance(scores);
    if (variance > 0.1) {
      patterns.push({
        type: 'high-score-variance',
        frequency: 1,
        examples: this.extractVarianceExamples(results),
        suggestedFix: 'Improve consistency in evaluation approach',
        evaluatorSource: strategyName,
      });
    }
    
    // Pattern: Missing metrics
    const missingMetrics = results.filter(r => !r.metrics || Object.keys(r.metrics).length === 0);
    if (missingMetrics.length > results.length * 0.2) {
      patterns.push({
        type: 'missing-metrics',
        frequency: missingMetrics.length / results.length,
        examples: [],
        suggestedFix: 'Ensure comprehensive metric calculation',
        evaluatorSource: strategyName,
      });
    }
    
    // Pattern: Error clusters
    const errorClusters = this.identifyErrorClusters(results);
    patterns.push(...errorClusters.map(cluster => ({
      type: `error-cluster-${cluster.characteristic}`,
      frequency: cluster.frequency,
      examples: cluster.examples,
      suggestedFix: cluster.suggestedFix,
      evaluatorSource: strategyName,
    })));
    
    return patterns;
  }
  
  /**
   * Extract examples from results
   */
  private extractExamples(
    results: EvaluationResult[],
    errorType: string,
    limit: number = 3
  ): EvaluationExample[] {
    return results.slice(0, limit).map(r => ({
      input: r,
      expected: 'Higher score',
      actual: `Score: ${r.score.toFixed(3)}`,
      error: errorType,
    }));
  }
  
  /**
   * Extract variance examples
   */
  private extractVarianceExamples(results: EvaluationResult[]): EvaluationExample[] {
    const sorted = [...results].sort((a, b) => b.score - a.score);
    const examples: EvaluationExample[] = [];
    
    // Add highest score
    if (sorted.length > 0) {
      examples.push({
        input: sorted[0],
        expected: 'Consistent scoring',
        actual: `High score: ${sorted[0].score.toFixed(3)}`,
      });
    }
    
    // Add lowest score
    if (sorted.length > 1) {
      examples.push({
        input: sorted[sorted.length - 1],
        expected: 'Consistent scoring',
        actual: `Low score: ${sorted[sorted.length - 1].score.toFixed(3)}`,
      });
    }
    
    // Add median score
    if (sorted.length > 2) {
      const medianIndex = Math.floor(sorted.length / 2);
      examples.push({
        input: sorted[medianIndex],
        expected: 'Consistent scoring',
        actual: `Median score: ${sorted[medianIndex].score.toFixed(3)}`,
      });
    }
    
    return examples;
  }
  
  /**
   * Identify clusters of similar errors
   */
  private identifyErrorClusters(results: EvaluationResult[]): Array<{
    characteristic: string;
    frequency: number;
    examples: EvaluationExample[];
    suggestedFix: string;
  }> {
    const clusters: Array<{
      characteristic: string;
      frequency: number;
      examples: EvaluationExample[];
      suggestedFix: string;
    }> = [];
    
    // Cluster by score ranges
    const scoreRanges = [
      { min: 0, max: 0.3, label: 'very-low' },
      { min: 0.3, max: 0.5, label: 'low' },
      { min: 0.5, max: 0.7, label: 'medium' },
      { min: 0.7, max: 0.9, label: 'high' },
      { min: 0.9, max: 1.0, label: 'very-high' },
    ];
    
    for (const range of scoreRanges) {
      const inRange = results.filter(r => r.score >= range.min && r.score < range.max);
      
      if (inRange.length > results.length * 0.4) {
        clusters.push({
          characteristic: range.label,
          frequency: inRange.length / results.length,
          examples: this.extractExamples(inRange, `Score in ${range.label} range`, 2),
          suggestedFix: this.getSuggestedFixForScoreRange(range.label),
        });
      }
    }
    
    // Cluster by presence of specific metrics
    const metricClusters = this.clusterByMetrics(results);
    clusters.push(...metricClusters);
    
    return clusters;
  }
  
  /**
   * Cluster results by metric characteristics
   */
  private clusterByMetrics(results: EvaluationResult[]): Array<{
    characteristic: string;
    frequency: number;
    examples: EvaluationExample[];
    suggestedFix: string;
  }> {
    const clusters: Array<{
      characteristic: string;
      frequency: number;
      examples: EvaluationExample[];
      suggestedFix: string;
    }> = [];
    
    // Check for common metric patterns
    const highRMSE = results.filter(r => r.metrics?.rmse && r.metrics.rmse > 0.2);
    if (highRMSE.length > results.length * 0.3) {
      clusters.push({
        characteristic: 'high-rmse',
        frequency: highRMSE.length / results.length,
        examples: this.extractExamples(highRMSE, 'High RMSE', 2),
        suggestedFix: 'Improve model accuracy through prompt engineering or parameter tuning',
      });
    }
    
    const lowCorrelation = results.filter(r => r.metrics?.correlation && r.metrics.correlation < 0.5);
    if (lowCorrelation.length > results.length * 0.3) {
      clusters.push({
        characteristic: 'low-correlation',
        frequency: lowCorrelation.length / results.length,
        examples: this.extractExamples(lowCorrelation, 'Low correlation', 2),
        suggestedFix: 'Align evaluation criteria with ground truth expectations',
      });
    }
    
    return clusters;
  }
  
  /**
   * Get suggested fix based on score range
   */
  private getSuggestedFixForScoreRange(range: string): string {
    const fixes: Record<string, string> = {
      'very-low': 'Major revision needed - consider complete prompt restructuring',
      'low': 'Significant improvements required - review core evaluation logic',
      'medium': 'Moderate adjustments needed - fine-tune parameters and prompts',
      'high': 'Minor optimizations - focus on edge cases and consistency',
      'very-high': 'Maintain current approach - monitor for regression',
    };
    
    return fixes[range] || 'Review and adjust evaluation approach';
  }
  
  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
  
  /**
   * Clear pattern history
   */
  clearHistory(): void {
    this.patternHistory.clear();
    this.patternFrequency.clear();
  }
  
  /**
   * Get pattern statistics
   */
  getStatistics(): {
    totalIterations: number;
    uniquePatterns: number;
    mostFrequent: string[];
    persistentCount: number;
  } {
    const mostFrequent = Array.from(this.patternFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);
    
    return {
      totalIterations: this.patternHistory.size,
      uniquePatterns: this.patternFrequency.size,
      mostFrequent,
      persistentCount: this.getPersistentPatterns().length,
    };
  }
}