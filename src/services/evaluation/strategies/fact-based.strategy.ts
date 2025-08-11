import type { EvaluationStrategy } from '../strategy.interface.js';
import type {
  EvaluationConfig,
  EvaluationResult,
  DetailedFeedback,
  EvaluationContext,
  FailurePattern,
  RequiredFacts,
  FactCheckResult,
  FactDefinition,
} from '../types.js';

export class FactBasedEvaluator implements EvaluationStrategy {
  name = 'fact-based';
  type = 'fact-based' as const;
  
  constructor(private factDefinitions?: FactDefinition[]) {}
  
  async evaluate(
    responses: string[],
    requirements: RequiredFacts[],
    config?: EvaluationConfig
  ): Promise<EvaluationResult> {
    if (responses.length !== requirements.length) {
      throw new Error('Responses and requirements must have the same length');
    }
    
    const allFactChecks: FactCheckResult[][] = [];
    const allMissingFacts: string[][] = [];
    
    for (let i = 0; i < responses.length; i++) {
      const factChecks = await this.checkFacts(responses[i], requirements[i]);
      allFactChecks.push(factChecks);
      
      const missingFacts = factChecks
        .filter(fc => !fc.present && this.isRequiredFact(fc.factName, requirements[i]))
        .map(fc => fc.factName);
      allMissingFacts.push(missingFacts);
    }
    
    // Calculate overall score
    const score = this.calculateFactCoverage(allFactChecks, requirements);
    
    // Identify patterns in missing facts
    const missingFactFrequency = this.analyzeMissingFactPatterns(allMissingFacts);
    
    // Compile all fact results
    const flatFactResults = allFactChecks.flat();
    const flatMissingFacts = Array.from(missingFactFrequency.keys())
      .filter(fact => missingFactFrequency.get(fact)! > responses.length * 0.3);
    
    return {
      score,
      factResults: flatFactResults,
      missingFacts: flatMissingFacts,
      metrics: {
        totalFacts: flatFactResults.length,
        presentFacts: flatFactResults.filter(f => f.present).length,
        missingFacts: flatFactResults.filter(f => !f.present).length,
        averageConfidence: this.calculateAverageConfidence(flatFactResults),
        factCoverage: score,
      },
      details: responses.map((response, i) => ({
        response,
        factChecks: allFactChecks[i],
        missingFacts: allMissingFacts[i],
        score: this.calculateResponseScore(allFactChecks[i], requirements[i]),
      })),
    };
  }
  
  generateFeedback(result: EvaluationResult): DetailedFeedback {
    const metrics = result.metrics || {};
    const missingFacts = result.missingFacts || [];
    const factResults = result.factResults || [];
    
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const actionItems: string[] = [];
    
    // Analyze strengths
    if (metrics.factCoverage && metrics.factCoverage > 0.9) {
      strengths.push('Excellent fact coverage');
    }
    if (metrics.averageConfidence && metrics.averageConfidence > 0.8) {
      strengths.push('High confidence in fact detection');
    }
    
    const criticalFacts = factResults.filter(f => f.factName.includes('critical') || f.factName.includes('required'));
    const criticalPresent = criticalFacts.filter(f => f.present);
    if (criticalFacts.length > 0 && criticalPresent.length === criticalFacts.length) {
      strengths.push('All critical facts present');
    }
    
    // Analyze weaknesses
    if (metrics.factCoverage && metrics.factCoverage < 0.7) {
      weaknesses.push('Poor fact coverage');
      actionItems.push('Review prompt to ensure all required facts are addressed');
    }
    
    if (missingFacts.length > 0) {
      weaknesses.push(`Missing facts: ${missingFacts.slice(0, 3).join(', ')}${missingFacts.length > 3 ? '...' : ''}`);
      actionItems.push('Add explicit instructions for missing facts in prompt');
    }
    
    if (metrics.averageConfidence && metrics.averageConfidence < 0.6) {
      weaknesses.push('Low confidence in fact detection');
      actionItems.push('Improve response clarity and structure');
    }
    
    // Generate patterns
    const patterns = this.identifyFactPatterns(result.details || []);
    
    return {
      summary: `Fact-based evaluation score: ${(result.score * 100).toFixed(1)}%`,
      strengths: strengths.length > 0 ? strengths : ['None identified'],
      weaknesses: weaknesses.length > 0 ? weaknesses : ['None identified'],
      patterns,
      actionItems: actionItems.length > 0 ? actionItems : ['Maintain current fact coverage'],
      missingClauses: missingFacts,
      improvements: this.generateFactImprovements(result),
    };
  }
  
  isApplicable(context: EvaluationContext): boolean {
    return context.hasFactRequirements || context.hasTextualContent;
  }
  
  analyzePatterns(results: EvaluationResult[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    const allMissingFacts = results.flatMap(r => r.missingFacts || []);
    
    // Count frequency of missing facts
    const missingFactCounts = new Map<string, number>();
    for (const fact of allMissingFacts) {
      missingFactCounts.set(fact, (missingFactCounts.get(fact) || 0) + 1);
    }
    
    // Identify systematic missing facts
    const totalResponses = results.reduce((sum, r) => sum + (r.details?.length || 0), 0);
    
    for (const [fact, count] of missingFactCounts) {
      if (count > totalResponses * 0.3) {
        patterns.push({
          type: 'systematic-missing-fact',
          frequency: count / totalResponses,
          examples: this.getFactExamples(fact, results),
          suggestedFix: `Add explicit instruction for '${fact}' in prompt`,
          evaluatorSource: this.name,
        });
      }
    }
    
    // Check for partial fact coverage
    const partialCoverage = results.filter(r => 
      r.score > 0.3 && r.score < 0.7
    );
    if (partialCoverage.length > results.length * 0.5) {
      patterns.push({
        type: 'partial-fact-coverage',
        frequency: partialCoverage.length / results.length,
        examples: partialCoverage.slice(0, 3).map(r => ({
          input: r,
          expected: 'Full fact coverage',
          actual: `${(r.score * 100).toFixed(0)}% coverage`,
          error: `Missing ${r.missingFacts?.length || 0} facts`,
        })),
        suggestedFix: 'Use more structured output format to ensure all facts are addressed',
        evaluatorSource: this.name,
      });
    }
    
    return patterns;
  }
  
  private async checkFacts(response: string, requirements: RequiredFacts): Promise<FactCheckResult[]> {
    const results: FactCheckResult[] = [];
    const responseLower = response.toLowerCase();
    
    for (const fact of requirements.facts) {
      let present = false;
      let confidence = 0;
      let evidence = '';
      
      // Use custom validation if provided
      if (fact.validate) {
        present = fact.validate(response);
        confidence = present ? 0.9 : 0.1;
      } else {
        // Default: check for keyword presence
        const keywords = this.extractKeywords(fact.name, fact.description);
        const matches = keywords.filter(kw => responseLower.includes(kw.toLowerCase()));
        
        if (matches.length > 0) {
          present = true;
          confidence = Math.min(1, matches.length / keywords.length);
          
          // Extract evidence (surrounding context)
          const firstMatch = matches[0];
          const index = responseLower.indexOf(firstMatch.toLowerCase());
          const start = Math.max(0, index - 50);
          const end = Math.min(response.length, index + firstMatch.length + 50);
          evidence = response.substring(start, end);
        }
      }
      
      results.push({
        factName: fact.name,
        present,
        confidence,
        evidence,
      });
    }
    
    return results;
  }
  
  private calculateFactCoverage(
    factChecks: FactCheckResult[][],
    requirements: RequiredFacts[]
  ): number {
    let totalRequired = 0;
    let totalPresent = 0;
    
    for (let i = 0; i < factChecks.length; i++) {
      const checks = factChecks[i];
      const reqs = requirements[i];
      
      for (const check of checks) {
        if (this.isRequiredFact(check.factName, reqs)) {
          totalRequired++;
          if (check.present) {
            totalPresent++;
          }
        } else if (check.present) {
          // Bonus for optional facts
          totalPresent += 0.5;
          totalRequired += 0.5;
        }
      }
    }
    
    return totalRequired > 0 ? totalPresent / totalRequired : 0;
  }
  
  private calculateResponseScore(
    factChecks: FactCheckResult[],
    requirements: RequiredFacts
  ): number {
    let score = 0;
    let totalWeight = 0;
    
    for (const check of factChecks) {
      const fact = requirements.facts.find(f => f.name === check.factName);
      const weight = fact?.required ? 2 : 1;
      totalWeight += weight;
      
      if (check.present) {
        score += weight * check.confidence;
      }
    }
    
    return totalWeight > 0 ? score / totalWeight : 0;
  }
  
  private calculateAverageConfidence(factResults: FactCheckResult[]): number {
    const presentFacts = factResults.filter(f => f.present);
    if (presentFacts.length === 0) return 0;
    
    const totalConfidence = presentFacts.reduce((sum, f) => sum + (f.confidence || 0), 0);
    return totalConfidence / presentFacts.length;
  }
  
  private isRequiredFact(factName: string, requirements: RequiredFacts): boolean {
    const fact = requirements.facts.find(f => f.name === factName);
    return fact?.required !== false;
  }
  
  private analyzeMissingFactPatterns(missingFacts: string[][]): Map<string, number> {
    const frequency = new Map<string, number>();
    
    for (const facts of missingFacts) {
      for (const fact of facts) {
        frequency.set(fact, (frequency.get(fact) || 0) + 1);
      }
    }
    
    return frequency;
  }
  
  private extractKeywords(name: string, description?: string): string[] {
    const keywords: string[] = [];
    
    // Extract from name
    keywords.push(...name.split(/[_\s-]+/).filter(w => w.length > 2));
    
    // Extract from description if available
    if (description) {
      const descWords = description
        .split(/\s+/)
        .filter(w => w.length > 3 && !this.isStopWord(w));
      keywords.push(...descWords.slice(0, 3));
    }
    
    return [...new Set(keywords)];
  }
  
  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'or', 'but', 'with', 'from', 'for', 'that', 'this', 'have', 'has'];
    return stopWords.includes(word.toLowerCase());
  }
  
  private identifyFactPatterns(details: any[]): string[] {
    const patterns: string[] = [];
    
    // Analyze fact coverage distribution
    const scores = details.map(d => d.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    if (avgScore < 0.5) {
      patterns.push('Consistently low fact coverage across responses');
    }
    
    // Check for specific fact categories
    const allMissing = details.flatMap(d => d.missingFacts || []);
    const categories = this.categorizeFacts(allMissing);
    
    for (const [category, facts] of categories) {
      if (facts.length > allMissing.length * 0.2) {
        patterns.push(`Difficulty with ${category} facts`);
      }
    }
    
    return patterns;
  }
  
  private categorizeFacts(facts: string[]): Map<string, string[]> {
    const categories = new Map<string, string[]>();
    
    for (const fact of facts) {
      let category = 'general';
      
      if (fact.includes('date') || fact.includes('time')) {
        category = 'temporal';
      } else if (fact.includes('number') || fact.includes('count') || fact.includes('amount')) {
        category = 'quantitative';
      } else if (fact.includes('name') || fact.includes('person') || fact.includes('who')) {
        category = 'identity';
      } else if (fact.includes('location') || fact.includes('where') || fact.includes('place')) {
        category = 'spatial';
      } else if (fact.includes('reason') || fact.includes('why') || fact.includes('because')) {
        category = 'causal';
      }
      
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(fact);
    }
    
    return categories;
  }
  
  private getFactExamples(fact: string, results: EvaluationResult[]): any[] {
    const examples: any[] = [];
    
    for (const result of results) {
      if (result.missingFacts?.includes(fact) && result.details) {
        for (const detail of result.details.slice(0, 3)) {
          examples.push({
            input: detail.response?.substring(0, 100) + '...',
            expected: `Include fact: ${fact}`,
            actual: 'Fact missing',
            error: `Missing required fact: ${fact}`,
          });
          
          if (examples.length >= 3) break;
        }
      }
      if (examples.length >= 3) break;
    }
    
    return examples;
  }
  
  private generateFactImprovements(result: EvaluationResult): string[] {
    const improvements: string[] = [];
    const metrics = result.metrics || {};
    const missingFacts = result.missingFacts || [];
    
    if (missingFacts.length > 3) {
      improvements.push('Consider using a checklist format in the prompt');
    }
    
    if (metrics.averageConfidence && metrics.averageConfidence < 0.7) {
      improvements.push('Make fact requirements more explicit in the prompt');
    }
    
    const categories = this.categorizeFacts(missingFacts);
    for (const [category, facts] of categories) {
      if (facts.length > 2) {
        improvements.push(`Improve handling of ${category} information`);
      }
    }
    
    if (metrics.factCoverage && metrics.factCoverage < 0.6) {
      improvements.push('Use structured output format to ensure comprehensive coverage');
    }
    
    return improvements;
  }
}