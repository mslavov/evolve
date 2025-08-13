import { Database } from '../../db/client.js';
import { EvaluationAgent } from '../agents/evaluation.agent.js';
import { ResearchAgent } from '../agents/research.agent.js';
import { OptimizationAgent } from '../agents/optimization.agent.js';
import { EvaluationRegistry } from '../evaluation/registry.js';
import { OptimizationState, type OptimizationParams, type OptimizationResult } from './optimization-state.js';
import type { EvaluationConfig } from '../evaluation/types.js';

export interface FlowConfig {
  evaluationConfig?: EvaluationConfig;
  enableParallelAgents?: boolean;
  saveIntermediateResults?: boolean;
  verbose?: boolean;
}

export class FlowOrchestrator {
  private evaluator: EvaluationAgent;
  private researcher: ResearchAgent;
  private optimizer: OptimizationAgent;
  
  constructor(
    db: Database,
    registry: EvaluationRegistry
  ) {
    this.evaluator = new EvaluationAgent(registry);
    this.researcher = new ResearchAgent();
    this.optimizer = new OptimizationAgent(db);
  }
  
  
  /**
   * Run the optimization flow
   */
  async runOptimizationFlow(
    params: OptimizationParams,
    config?: FlowConfig
  ): Promise<OptimizationResult> {
    const state = new OptimizationState(params);
    
    if (config?.verbose) {
      console.log('Starting optimization flow...');
      console.log(`Target score: ${params.targetScore}`);
      console.log(`Max iterations: ${params.maxIterations}`);
    }
    
    // Main optimization loop
    while (!state.isComplete() && state.iterationCount < params.maxIterations) {
      if (config?.verbose) {
        console.log(`\n--- Iteration ${state.iterationCount + 1} ---`);
      }
      
      try {
        // Step 1: Evaluate current configuration
        const evaluation = await this.evaluateConfiguration(
          state,
          config?.evaluationConfig
        );
        
        if (config?.verbose) {
          console.log(`Evaluation score: ${(evaluation.score * 100).toFixed(1)}%`);
          console.log(`Feedback: ${evaluation.feedback.summary}`);
        }
        
        // Check if optimization target is met
        if (evaluation.score >= params.targetScore) {
          state.update(state.currentConfig, evaluation);
          if (config?.verbose) {
            console.log('Target score reached!');
          }
          break;
        }
        
        // Step 2: Research improvement strategies (if enabled)
        let researchInsights = [];
        if (params.enableResearch) {
          researchInsights = await this.researchImprovements(evaluation);
          
          if (config?.verbose) {
            console.log(`Found ${researchInsights.length} research insights`);
          }
        }
        
        // Step 3: Generate optimized configuration
        const optimizedConfig = await this.generateOptimization(
          state,
          evaluation,
          researchInsights
        );
        
        if (config?.verbose) {
          console.log('Generated optimized configuration');
        }
        
        // Step 4: Update state
        state.update(optimizedConfig, evaluation, researchInsights);
        
        // Step 5: Check for early stopping conditions
        const recommendations = state.getRecommendations();
        if (config?.verbose && recommendations.length > 0) {
          console.log('Recommendations:', recommendations);
        }
        
        // Save intermediate results if configured
        if (config?.saveIntermediateResults) {
          await this.saveIntermediateState(state);
        }
        
        if (config?.verbose) {
          console.log(state.getSummary());
        }
        
      } catch (error) {
        console.error(`Error in iteration ${state.iterationCount + 1}:`, error);
        
        // Continue with next iteration or stop based on error handling policy
        if (state.iterationCount === 0) {
          throw error; // Fatal error on first iteration
        }
        break;
      }
    }
    
    // Finalize and return results
    const result = state.finalize();
    
    if (config?.verbose) {
      console.log('\n--- Optimization Complete ---');
      console.log(`Final score: ${(result.finalScore * 100).toFixed(1)}%`);
      console.log(`Total improvement: ${(result.totalImprovement * 100).toFixed(1)}%`);
      console.log(`Iterations: ${result.iterations}`);
      console.log(`Stopped reason: ${result.stoppedReason}`);
    }
    
    return result;
  }
  
  /**
   * Run optimization with checkpointing
   */
  async runWithCheckpoints(
    params: OptimizationParams,
    config?: FlowConfig,
    checkpointCallback?: (state: OptimizationState) => Promise<void>
  ): Promise<OptimizationResult> {
    const state = new OptimizationState(params);
    
    while (!state.isComplete()) {
      // Run single iteration
      const iterationResult = await this.runSingleIteration(state, config);
      
      if (!iterationResult.success) {
        break;
      }
      
      // Call checkpoint callback
      if (checkpointCallback) {
        await checkpointCallback(state);
      }
    }
    
    return state.finalize();
  }
  
  /**
   * Run a single optimization iteration
   */
  private async runSingleIteration(
    state: OptimizationState,
    config?: FlowConfig
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      // Evaluate
      const evaluation = await this.evaluateConfiguration(
        state,
        config?.evaluationConfig
      );
      
      // Check target
      if (evaluation.score >= state['params'].targetScore) {
        state.update(state.currentConfig, evaluation);
        return { success: true };
      }
      
      // Research (if enabled)
      let researchInsights = [];
      if (state['params'].enableResearch) {
        researchInsights = await this.researchImprovements(evaluation);
      }
      
      // Optimize
      const optimizedConfig = await this.generateOptimization(
        state,
        evaluation,
        researchInsights
      );
      
      // Update state
      state.update(optimizedConfig, evaluation, researchInsights);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }
  
  /**
   * Evaluate current configuration
   */
  private async evaluateConfiguration(
    state: OptimizationState,
    evaluationConfig?: EvaluationConfig
  ): Promise<any> {
    const history = state.getEvaluationHistory();
    
    if (history.length > 0) {
      // Evaluate with historical context
      return await this.evaluator.evaluateWithHistory(
        state.currentConfig,
        history,
        evaluationConfig
      );
    } else {
      // First evaluation
      return await this.evaluator.evaluate(
        state.currentConfig,
        evaluationConfig
      );
    }
  }
  
  /**
   * Research improvement strategies
   */
  private async researchImprovements(
    evaluation: any
  ): Promise<any[]> {
    const tasks = [];
    
    // Research based on feedback
    tasks.push(this.researcher.findStrategies(evaluation.feedback));
    
    // Research based on patterns
    if (evaluation.patterns && evaluation.patterns.length > 0) {
      tasks.push(this.researcher.researchPatterns(evaluation.patterns));
    }
    
    // Run research tasks sequentially for now
    const results = await this.runSequential(tasks);
    
    // Flatten and deduplicate insights
    const allInsights = results.flat();
    return this.deduplicateInsights(allInsights);
  }
  
  /**
   * Generate optimized configuration
   */
  private async generateOptimization(
    state: OptimizationState,
    evaluation: any,
    researchInsights: any[]
  ): Promise<any> {
    return await this.optimizer.optimize(
      state.currentConfig,
      evaluation,
      researchInsights
    );
  }
  
  /**
   * Run tasks sequentially
   */
  private async runSequential<T>(tasks: Promise<T>[]): Promise<T[]> {
    const results: T[] = [];
    for (const task of tasks) {
      results.push(await task);
    }
    return results;
  }
  
  /**
   * Deduplicate research insights
   */
  private deduplicateInsights(insights: any[]): any[] {
    const seen = new Set<string>();
    const unique = [];
    
    for (const insight of insights) {
      const key = `${insight.source}:${insight.strategy}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(insight);
      }
    }
    
    return unique;
  }
  
  /**
   * Save intermediate state (for recovery/analysis)
   */
  private async saveIntermediateState(state: OptimizationState): Promise<void> {
    // This would typically save to database
    // For now, just logging
    const stateData = state.toJSON();
    console.log('Saving intermediate state:', {
      iteration: stateData.iterationCount,
      score: stateData.score,
    });
  }
  
  /**
   * Load and resume from saved state
   */
  async resumeFromState(
    stateData: any,
    config?: FlowConfig
  ): Promise<OptimizationResult> {
    const state = OptimizationState.fromJSON(stateData);
    
    if (config?.verbose) {
      console.log(`Resuming from iteration ${state.iterationCount}`);
      console.log(`Current score: ${(state.score * 100).toFixed(1)}%`);
    }
    
    // Continue optimization from saved state
    return this.continueOptimization(state, config);
  }
  
  /**
   * Continue optimization from existing state
   */
  private async continueOptimization(
    state: OptimizationState,
    config?: FlowConfig
  ): Promise<OptimizationResult> {
    while (!state.isComplete()) {
      const iterationResult = await this.runSingleIteration(state, config);
      
      if (!iterationResult.success) {
        if (config?.verbose) {
          console.error('Iteration failed:', iterationResult.error);
        }
        break;
      }
      
      if (config?.saveIntermediateResults) {
        await this.saveIntermediateState(state);
      }
      
      if (config?.verbose) {
        console.log(state.getSummary());
      }
    }
    
    return state.finalize();
  }
  
  /**
   * Analyze optimization history
   */
  analyzeOptimizationHistory(result: OptimizationResult): {
    bestIteration: number;
    worstIteration: number;
    averageImprovement: number;
    improvementTrend: 'improving' | 'declining' | 'stable';
    recommendations: string[];
  } {
    const history = result.history;
    
    if (history.length === 0) {
      return {
        bestIteration: -1,
        worstIteration: -1,
        averageImprovement: 0,
        improvementTrend: 'stable',
        recommendations: ['No optimization history available'],
      };
    }
    
    // Find best and worst iterations
    const bestStep = history.reduce((best, step) => 
      step.score > best.score ? step : best
    );
    const worstStep = history.reduce((worst, step) => 
      step.score < worst.score ? step : worst
    );
    
    // Calculate average improvement
    const totalImprovement = history.reduce((sum, step) => sum + step.improvement, 0);
    const averageImprovement = totalImprovement / history.length;
    
    // Determine trend
    const recentHistory = history.slice(-3);
    const recentImprovement = recentHistory.reduce((sum, step) => sum + step.improvement, 0);
    const recentAverage = recentImprovement / recentHistory.length;
    
    let improvementTrend: 'improving' | 'declining' | 'stable';
    if (recentAverage > averageImprovement * 1.2) {
      improvementTrend = 'improving';
    } else if (recentAverage < averageImprovement * 0.8) {
      improvementTrend = 'declining';
    } else {
      improvementTrend = 'stable';
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (result.converged) {
      recommendations.push('Optimization converged - consider more aggressive strategies');
    }
    
    if (result.stoppedReason === 'no-improvement') {
      recommendations.push('Optimization stuck - try different evaluation methods');
    }
    
    if (improvementTrend === 'declining') {
      recommendations.push('Performance declining - review recent changes');
    }
    
    if (result.totalImprovement < 0.1) {
      recommendations.push('Limited improvement achieved - consider alternative approaches');
    }
    
    return {
      bestIteration: bestStep.iteration,
      worstIteration: worstStep.iteration,
      averageImprovement,
      improvementTrend,
      recommendations,
    };
  }
}