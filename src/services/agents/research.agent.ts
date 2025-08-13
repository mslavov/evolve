import type { DetailedFeedback, ResearchInsight, FailurePattern } from '../evaluation/types.js';

export interface KnowledgeSource {
  type: 'internal' | 'external' | 'historical';
  name: string;
  query: (topic: string) => Promise<string[]>;
}

export class ResearchAgent {
  private knowledgeSources: KnowledgeSource[] = [];
  private researchCache: Map<string, ResearchInsight[]> = new Map();
  
  constructor() {
    this.initializeKnowledgeSources();
  }
  
  
  /**
   * Find improvement strategies based on feedback
   */
  async findStrategies(feedback: DetailedFeedback): Promise<ResearchInsight[]> {
    const insights: ResearchInsight[] = [];
    
    // Extract key topics from feedback
    const topics = this.extractTopics(feedback);
    
    // Query knowledge sources for each topic
    for (const topic of topics) {
      // Check cache first
      const cacheKey = this.getCacheKey(topic);
      if (this.researchCache.has(cacheKey)) {
        insights.push(...this.researchCache.get(cacheKey)!);
        continue;
      }
      
      // Query external knowledge
      const externalKnowledge = await this.queryKnowledgeSources(topic);
      
      // Analyze historical improvements
      const historicalInsights = await this.analyzeHistory(topic);
      
      // Generate targeted strategies
      const strategies = await this.synthesizeStrategies(
        externalKnowledge,
        historicalInsights,
        feedback
      );
      
      insights.push(...strategies);
      
      // Cache results
      this.researchCache.set(cacheKey, strategies);
    }
    
    // Rank insights by relevance
    return this.rankInsights(insights);
  }
  
  /**
   * Research based on failure patterns
   */
  async researchPatterns(patterns: FailurePattern[]): Promise<ResearchInsight[]> {
    const insights: ResearchInsight[] = [];
    
    for (const pattern of patterns) {
      // Research specific solutions for this pattern type
      const patternInsights = await this.researchPatternSolution(pattern);
      insights.push(...patternInsights);
    }
    
    return insights;
  }
  
  /**
   * Initialize knowledge sources
   */
  private initializeKnowledgeSources(): void {
    // Internal knowledge base
    this.knowledgeSources.push({
      type: 'internal',
      name: 'optimization-patterns',
      query: async (topic: string) => {
        return this.getInternalKnowledge(topic);
      },
    });
    
    // Historical data
    this.knowledgeSources.push({
      type: 'historical',
      name: 'improvement-history',
      query: async (topic: string) => {
        return this.queryHistoricalImprovements(topic);
      },
    });
    
    // External research (simulated)
    this.knowledgeSources.push({
      type: 'external',
      name: 'research-papers',
      query: async (topic: string) => {
        return this.simulateExternalResearch(topic);
      },
    });
  }
  
  /**
   * Extract topics from feedback for research
   */
  private extractTopics(feedback: DetailedFeedback): string[] {
    const topics: Set<string> = new Set();
    
    // Extract from weaknesses
    if (feedback.weaknesses) {
      for (const weakness of feedback.weaknesses) {
        if (weakness.includes('correlation')) topics.add('correlation-improvement');
        if (weakness.includes('bias')) topics.add('bias-correction');
        if (weakness.includes('consistency')) topics.add('consistency-enhancement');
        if (weakness.includes('fact')) topics.add('fact-extraction');
        if (weakness.includes('accuracy')) topics.add('accuracy-optimization');
      }
    }
    
    // Extract from patterns
    if (feedback.patterns) {
      for (const pattern of feedback.patterns) {
        if (pattern.includes('overestim')) topics.add('calibration');
        if (pattern.includes('underestim')) topics.add('calibration');
        if (pattern.includes('missing')) topics.add('completeness');
        if (pattern.includes('variance')) topics.add('stability');
      }
    }
    
    // Add general optimization if no specific topics
    if (topics.size === 0) {
      topics.add('general-optimization');
    }
    
    return Array.from(topics);
  }
  
  /**
   * Query all knowledge sources
   */
  private async queryKnowledgeSources(topic: string): Promise<string[]> {
    const results: string[] = [];
    
    for (const source of this.knowledgeSources) {
      try {
        const knowledge = await source.query(topic);
        results.push(...knowledge);
      } catch (error) {
        console.warn(`Failed to query ${source.name} for topic ${topic}:`, error);
      }
    }
    
    return results;
  }
  
  /**
   * Analyze historical improvements
   */
  private async analyzeHistory(topic: string): Promise<string[]> {
    // Query database for successful past improvements
    // This would typically query the runs table for improvements
    // For now, returning simulated insights
    
    const insights: string[] = [];
    
    if (topic === 'bias-correction') {
      insights.push('Previous success: Adding calibration examples reduced bias by 40%');
    }
    
    if (topic === 'consistency-enhancement') {
      insights.push('Historical pattern: Lower temperature (0.3) improved consistency');
    }
    
    return insights;
  }
  
  /**
   * Synthesize strategies from research
   */
  private async synthesizeStrategies(
    externalKnowledge: string[],
    historicalInsights: string[],
    feedback: DetailedFeedback
  ): Promise<ResearchInsight[]> {
    const strategies: ResearchInsight[] = [];
    
    // Combine knowledge to generate strategies
    const allKnowledge = [...externalKnowledge, ...historicalInsights];
    
    for (const knowledge of allKnowledge) {
      const insight = this.knowledgeToInsight(knowledge, feedback);
      if (insight) {
        strategies.push(insight);
      }
    }
    
    return strategies;
  }
  
  /**
   * Convert knowledge to actionable insight
   */
  private knowledgeToInsight(
    knowledge: string,
    feedback: DetailedFeedback
  ): ResearchInsight | null {
    // Parse knowledge and create insight
    const insight: ResearchInsight = {
      source: 'research',
      strategy: knowledge,
      description: knowledge,
      confidence: 0.7,
      applicability: 0.8,
    };
    
    // Enhance based on content
    if (knowledge.includes('calibration')) {
      insight.implementation = 'Add calibration examples to prompt';
      insight.confidence = 0.9;
    } else if (knowledge.includes('temperature')) {
      insight.implementation = 'Adjust temperature parameter';
      insight.confidence = 0.85;
    } else if (knowledge.includes('few-shot')) {
      insight.implementation = 'Add few-shot examples to prompt';
      insight.confidence = 0.8;
    } else if (knowledge.includes('structure')) {
      insight.implementation = 'Use structured output format';
      insight.confidence = 0.75;
    }
    
    // Check applicability to current issues
    insight.applicability = this.calculateApplicability(insight, feedback);
    
    return insight.applicability > 0.5 ? insight : null;
  }
  
  /**
   * Calculate how applicable an insight is to current issues
   */
  private calculateApplicability(
    insight: ResearchInsight,
    feedback: DetailedFeedback
  ): number {
    let score = 0.5; // Base applicability
    
    // Check if insight addresses weaknesses
    if (feedback.weaknesses) {
      for (const weakness of feedback.weaknesses) {
        if (insight.strategy.toLowerCase().includes(weakness.toLowerCase())) {
          score += 0.2;
        }
      }
    }
    
    // Check if insight addresses action items
    if (feedback.actionItems) {
      for (const action of feedback.actionItems) {
        if (insight.strategy.toLowerCase().includes(action.toLowerCase())) {
          score += 0.15;
        }
      }
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Rank insights by relevance
   */
  private rankInsights(
    insights: ResearchInsight[]
  ): ResearchInsight[] {
    return insights.sort((a, b) => {
      // Sort by combined score of confidence and applicability
      const scoreA = a.confidence * 0.4 + a.applicability * 0.6;
      const scoreB = b.confidence * 0.4 + b.applicability * 0.6;
      return scoreB - scoreA;
    });
  }
  
  /**
   * Research specific solution for a pattern
   */
  private async researchPatternSolution(pattern: FailurePattern): Promise<ResearchInsight[]> {
    const insights: ResearchInsight[] = [];
    
    // Map pattern types to research strategies
    const patternStrategies: Record<string, string[]> = {
      'consistent-overestimation': [
        'Implement calibration with lower bound examples',
        'Reduce model confidence through temperature adjustment',
        'Add explicit scoring boundaries in prompt',
      ],
      'high-variance': [
        'Stabilize with few-shot examples',
        'Use structured output format',
        'Implement ensemble approach',
      ],
      'edge-case-failures': [
        'Add edge case examples to prompt',
        'Implement special handling for boundary values',
        'Use conditional logic for extreme values',
      ],
      'systematic-missing-fact': [
        'Add checklist format to prompt',
        'Implement fact extraction template',
        'Use chain-of-thought for completeness',
      ],
    };
    
    const strategies = patternStrategies[pattern.type] || [pattern.suggestedFix];
    
    for (const strategy of strategies) {
      insights.push({
        source: `pattern-research-${pattern.type}`,
        strategy,
        description: `Solution for ${pattern.type}: ${strategy}`,
        confidence: 0.8 - (pattern.frequency * 0.2), // Less confident for more frequent issues
        applicability: pattern.frequency, // More applicable for more frequent patterns
        implementation: strategy,
      });
    }
    
    return insights;
  }
  
  /**
   * Get internal knowledge for a topic
   */
  private getInternalKnowledge(topic: string): string[] {
    const knowledge: Record<string, string[]> = {
      'correlation-improvement': [
        'Use chain-of-thought reasoning to improve correlation',
        'Add explicit scoring criteria to prompt',
        'Implement multi-step evaluation process',
      ],
      'bias-correction': [
        'Add calibration examples spanning full range',
        'Implement bias detection and correction',
        'Use balanced training examples',
      ],
      'consistency-enhancement': [
        'Lower temperature for more deterministic outputs',
        'Use structured output format',
        'Add consistency checks in prompt',
      ],
      'fact-extraction': [
        'Use explicit fact extraction template',
        'Implement named entity recognition',
        'Add fact verification step',
      ],
      'accuracy-optimization': [
        'Use more powerful model',
        'Implement ensemble approach',
        'Add domain-specific examples',
      ],
      'general-optimization': [
        'Iterate on prompt wording',
        'Test different model parameters',
        'Add more examples',
      ],
    };
    
    return knowledge[topic] || knowledge['general-optimization'];
  }
  
  /**
   * Query historical improvements from database
   */
  private async queryHistoricalImprovements(topic: string): Promise<string[]> {
    // This would query actual database
    // For now, returning simulated data
    return [
      `Historical: ${topic} improved by 20% using few-shot examples`,
      `Past success: Temperature 0.3 optimal for ${topic}`,
    ];
  }
  
  /**
   * Simulate external research
   */
  private simulateExternalResearch(topic: string): string[] {
    // This would integrate with external APIs or knowledge bases
    // For now, returning simulated research findings
    return [
      `Research: Chain-of-thought improves ${topic} by 15-30%`,
      `Study: Structured prompts enhance ${topic} reliability`,
      `Paper: Few-shot learning effective for ${topic}`,
    ];
  }
  
  /**
   * Get cache key for a topic
   */
  private getCacheKey(topic: string): string {
    return `research:${topic}:${Date.now() % (1000 * 60 * 60)}`; // Cache for 1 hour
  }
  
  /**
   * Clear research cache
   */
  clearCache(): void {
    this.researchCache.clear();
  }
}