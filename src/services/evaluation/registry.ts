import type { EvaluationStrategy } from './strategy.interface.js';
import type { EvaluationContext, EvaluationRule } from './types.js';

export class EvaluationRegistry {
  private strategies = new Map<string, EvaluationStrategy>();
  private rules: EvaluationRule[] = [];
  private defaultStrategy: string | null = null;
  
  /**
   * Register a new evaluation strategy
   */
  register(strategy: EvaluationStrategy): void {
    if (this.strategies.has(strategy.name)) {
      console.warn(`Strategy '${strategy.name}' is being overwritten`);
    }
    this.strategies.set(strategy.name, strategy);
  }
  
  /**
   * Unregister an evaluation strategy
   */
  unregister(strategyName: string): boolean {
    return this.strategies.delete(strategyName);
  }
  
  /**
   * Get a specific strategy by name
   */
  get(strategyName: string): EvaluationStrategy | undefined {
    return this.strategies.get(strategyName);
  }
  
  /**
   * Get all registered strategies
   */
  getAll(): EvaluationStrategy[] {
    return Array.from(this.strategies.values());
  }
  
  /**
   * Get all strategy names
   */
  getNames(): string[] {
    return Array.from(this.strategies.keys());
  }
  
  /**
   * Check if a strategy is registered
   */
  has(strategyName: string): boolean {
    return this.strategies.has(strategyName);
  }
  
  /**
   * Set the default strategy
   */
  setDefault(strategyName: string): void {
    if (!this.strategies.has(strategyName)) {
      throw new Error(`Strategy '${strategyName}' is not registered`);
    }
    this.defaultStrategy = strategyName;
  }
  
  /**
   * Get the default strategy
   */
  getDefault(): EvaluationStrategy | undefined {
    if (!this.defaultStrategy) {
      return undefined;
    }
    return this.strategies.get(this.defaultStrategy);
  }
  
  /**
   * Add a rule for automatic strategy selection
   */
  addRule(rule: EvaluationRule): void {
    // Validate that the strategy exists
    if (!this.strategies.has(rule.strategyName)) {
      throw new Error(`Strategy '${rule.strategyName}' is not registered`);
    }
    
    // Insert rule in priority order (higher priority first)
    const insertIndex = this.rules.findIndex(
      r => (r.priority || 0) < (rule.priority || 0)
    );
    
    if (insertIndex === -1) {
      this.rules.push(rule);
    } else {
      this.rules.splice(insertIndex, 0, rule);
    }
  }
  
  /**
   * Remove a rule by name
   */
  removeRule(ruleName: string): boolean {
    const index = this.rules.findIndex(r => r.name === ruleName);
    if (index === -1) {
      return false;
    }
    this.rules.splice(index, 1);
    return true;
  }
  
  /**
   * Get all rules
   */
  getRules(): EvaluationRule[] {
    return [...this.rules];
  }
  
  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
  }
  
  /**
   * Auto-select best evaluator based on context
   */
  selectStrategy(context: EvaluationContext): EvaluationStrategy {
    // Check rules for automatic selection
    for (const rule of this.rules) {
      if (rule.matches(context)) {
        const strategy = this.strategies.get(rule.strategyName);
        if (strategy) {
          return strategy;
        }
      }
    }
    
    // Fallback to context-based selection
    const applicableStrategies = Array.from(this.strategies.values())
      .filter(strategy => strategy.isApplicable(context));
    
    if (applicableStrategies.length === 0) {
      // If no applicable strategies, try default
      const defaultStrategy = this.getDefault();
      if (defaultStrategy) {
        return defaultStrategy;
      }
      throw new Error(`No suitable evaluation strategy for context: ${JSON.stringify(context)}`);
    }
    
    // Prefer strategies in this order: hybrid > fact-based > numeric > custom
    const priorityOrder: Record<string, number> = {
      'hybrid': 4,
      'fact-based': 3,
      'numeric': 2,
      'custom': 1,
    };
    
    applicableStrategies.sort((a, b) => {
      const aPriority = priorityOrder[a.type] || 0;
      const bPriority = priorityOrder[b.type] || 0;
      return bPriority - aPriority;
    });
    
    return applicableStrategies[0];
  }
  
  /**
   * Find all applicable strategies for a context
   */
  findApplicable(context: EvaluationContext): EvaluationStrategy[] {
    return Array.from(this.strategies.values())
      .filter(strategy => strategy.isApplicable(context));
  }
  
  /**
   * Clear all strategies and rules
   */
  clear(): void {
    this.strategies.clear();
    this.rules = [];
    this.defaultStrategy = null;
  }
  
  /**
   * Get registry statistics
   */
  getStats(): {
    totalStrategies: number;
    strategiesByType: Record<string, number>;
    totalRules: number;
    hasDefault: boolean;
  } {
    const strategiesByType: Record<string, number> = {};
    
    for (const strategy of this.strategies.values()) {
      strategiesByType[strategy.type] = (strategiesByType[strategy.type] || 0) + 1;
    }
    
    return {
      totalStrategies: this.strategies.size,
      strategiesByType,
      totalRules: this.rules.length,
      hasDefault: this.defaultStrategy !== null,
    };
  }
}