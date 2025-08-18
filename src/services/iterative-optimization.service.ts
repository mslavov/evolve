import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { PromptRepository } from '../repositories/prompt.repository.js';
import { EvaluationService } from './evaluation.service.js';
import { PromptService } from './prompt.service.js';
import { PromptResearchAgent, type PromptResearchInput, type PromptResearchOutput } from './agents/prompt-research.agent.js';
import { PromptEngineerAgent, type PromptEngineeringInput, type PromptEngineeringOutput } from './agents/prompt-engineer.agent.js';
import type { Agent } from '../db/schema/agents.js';
import type { DetailedFeedback } from './evaluation/types.js';


/**
 * Simple convergence detection configuration
 */
export interface ConvergenceConfig {
  /** Target score to achieve */
  targetScore: number;
  /** Maximum number of iterations */
  maxIterations: number;
  /** Maximum consecutive iterations with no improvement */
  maxConsecutiveNoImprovement: number;
  /** Minimum improvement threshold per iteration */
  minImprovementThreshold: number;
}




/**
 * Single optimization step in the iterative process
 */
export interface IterativeOptimizationStep {
  /** Iteration number */
  iteration: number;
  /** Agent configuration used */
  agentKey: string;
  /** Prompt version used */
  promptVersion: string;
  /** Score achieved */
  score: number;
  /** Improvement from previous iteration */
  improvement: number;
  /** Feedback from evaluation */
  feedback: string;
  /** Applied improvements */
  appliedImprovements: string[];
  /** Timestamp of this step */
  timestamp: Date;
}

/**
 * Parameters for iterative optimization
 */
export interface IterativeOptimizationParams {
  /** Base agent to optimize */
  baseAgentKey: string;
  /** Target score to achieve */
  targetScore?: number;
  /** Maximum number of iterations */
  maxIterations?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Result of iterative optimization
 */
export interface IterativeOptimizationResult {
  /** Final optimized agent key */
  finalAgentKey: string;
  /** Final prompt version */
  finalPromptVersion: string;
  /** Final score achieved */
  finalScore: number;
  /** Total improvement */
  totalImprovement: number;
  /** Number of iterations performed */
  iterations: number;
  /** Optimization history */
  history: IterativeOptimizationStep[];
  /** Whether target was reached */
  targetReached: boolean;
  /** Reason optimization stopped */
  stoppedReason: string;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Simplified iterative optimization service using real AI agents
 */
export class IterativeOptimizationService {
  private agentRepo: AgentRepository;
  private promptRepo: PromptRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private evaluationService: EvaluationService;
  private researchAgent: PromptResearchAgent;
  private engineerAgent: PromptEngineerAgent;

  // Default configuration
  private readonly defaultConfig: ConvergenceConfig = {
    targetScore: 0.8,
    maxIterations: 5,
    maxConsecutiveNoImprovement: 3,
    minImprovementThreshold: 0.01,
  };

  constructor(private db: Database) {
    this.agentRepo = new AgentRepository(db);
    this.promptRepo = new PromptRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.evaluationService = new EvaluationService(db);
    this.researchAgent = new PromptResearchAgent(db);
    this.engineerAgent = new PromptEngineerAgent(db);
  }

  /**
   * Main optimization method - simplified and using real AI agents
   */
  async optimize(params: IterativeOptimizationParams): Promise<IterativeOptimizationResult> {
    const startTime = Date.now();
    const targetScore = params.targetScore ?? this.defaultConfig.targetScore;
    const maxIterations = params.maxIterations ?? this.defaultConfig.maxIterations;
    
    if (params.verbose) {
      console.log(`Starting prompt optimization for agent: ${params.baseAgentKey}`);
      console.log(`Target score: ${targetScore}, Max iterations: ${maxIterations}`);
    }

    // Get base agent
    const baseAgent = await this.agentRepo.findByKey(params.baseAgentKey);
    if (!baseAgent) {
      throw new Error(`Agent ${params.baseAgentKey} not found`);
    }

    // Initialize state
    let currentAgent = baseAgent;
    let currentScore = 0;
    let previousScore = 0;
    let consecutiveNoImprovement = 0;
    const history: IterativeOptimizationStep[] = [];

    // Main optimization loop
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (params.verbose) {
        console.log(`\n--- Iteration ${iteration} ---`);
      }

      try {
        // Step 1: Evaluate current configuration
        const evaluation = await this.evaluateAgent(currentAgent);
        currentScore = evaluation.score;
        
        if (params.verbose) {
          console.log(`Score: ${(currentScore * 100).toFixed(1)}%`);
          if (evaluation.feedback.weaknesses?.length > 0) {
            console.log(`Weaknesses: ${evaluation.feedback.weaknesses.join(', ')}`);
          }
        }

        // Check if target reached
        if (currentScore >= targetScore) {
          if (params.verbose) {
            console.log('Target score reached!');
          }
          
          // Record final step
          history.push({
            iteration,
            agentKey: currentAgent.key,
            promptVersion: currentAgent.promptId,
            score: currentScore,
            improvement: currentScore - previousScore,
            feedback: evaluation.feedback.summary,
            appliedImprovements: [],
            timestamp: new Date()
          });
          
          return this.createResult(
            currentAgent,
            currentScore,
            history,
            true,
            'target-reached',
            Date.now() - startTime
          );
        }

        // Check for no improvement
        const improvement = currentScore - previousScore;
        if (iteration > 1 && improvement < this.defaultConfig.minImprovementThreshold) {
          consecutiveNoImprovement++;
          if (consecutiveNoImprovement >= this.defaultConfig.maxConsecutiveNoImprovement) {
            if (params.verbose) {
              console.log('No improvement for 3 iterations, stopping');
            }
            return this.createResult(
              currentAgent,
              currentScore,
              history,
              false,
              'no-improvement',
              Date.now() - startTime
            );
          }
        } else {
          consecutiveNoImprovement = 0;
        }

        // Step 2: Research improvements
        if (params.verbose) {
          console.log('Researching improvement strategies...');
        }
        
        const currentPrompt = await this.promptRepo.findByVersion(currentAgent.promptId);
        if (!currentPrompt) {
          throw new Error(`Prompt ${currentAgent.promptId} not found`);
        }
        
        const researchInput: PromptResearchInput = {
          currentPrompt: currentPrompt.template,
          evaluationScore: currentScore,
          feedback: evaluation.feedback.summary
        };
        
        const research = await this.researchAgent.research(researchInput);
        
        if (params.verbose && research.recommendations.length > 0) {
          console.log(`Found ${research.recommendations.length} improvement strategies`);
          research.recommendations.forEach(r => 
            console.log(`  - ${r.technique} (${r.priority} priority)`)
          );
        }

        // Step 3: Generate improved prompt
        if (params.verbose) {
          console.log('Generating improved prompt...');
        }
        
        const engineeringInput: PromptEngineeringInput = {
          currentPrompt: currentPrompt.template,
          evaluationScore: currentScore,
          feedback: evaluation.feedback.summary,
          researchFindings: {
            issues: research.issues,
            recommendations: research.recommendations,
            implementationStrategy: research.implementationStrategy
          }
        };
        
        const engineeringResult = await this.engineerAgent.improvePrompt(engineeringInput);
        
        // Create new prompt version
        const newPromptVersion = await this.createPromptVersion(
          currentPrompt,
          engineeringResult.improvedPrompt,
          engineeringResult.appliedTechniques
        );
        
        if (params.verbose) {
          console.log(`Created new prompt version: ${newPromptVersion}`);
          console.log(`Expected improvement: ${(engineeringResult.expectedImprovement * 100).toFixed(1)}%`);
        }

        // Step 4: Create new agent version with improved prompt
        const optimizedAgent = await this.createOptimizedAgent(
          currentAgent,
          newPromptVersion,
          iteration
        );

        // Record step
        history.push({
          iteration,
          agentKey: currentAgent.key,
          promptVersion: currentAgent.promptId,
          score: currentScore,
          improvement,
          feedback: evaluation.feedback.summary,
          appliedImprovements: engineeringResult.appliedTechniques,
          timestamp: new Date()
        });

        // Update for next iteration
        previousScore = currentScore;
        currentAgent = optimizedAgent;

      } catch (error) {
        console.error(`Error in iteration ${iteration}:`, error);
        if (iteration === 1) {
          throw error;
        }
        // Continue with current best
        break;
      }
    }

    // Optimization complete
    return this.createResult(
      currentAgent,
      currentScore,
      history,
      currentScore >= targetScore,
      'max-iterations',
      Date.now() - startTime
    );
  }

  /**
   * Evaluate an agent's performance
   */
  private async evaluateAgent(agent: Agent): Promise<{
    score: number;
    feedback: DetailedFeedback;
  }> {
    // Get test dataset
    const testData = await this.evalDatasetRepo.findMany({
      limit: 20 // Use smaller sample for faster iteration
    });

    if (testData.length === 0) {
      throw new Error('No test data available for evaluation');
    }

    // Evaluate the agent
    const result = await this.evaluationService.evaluateAgent(agent.key, {
      includeDetails: true
    });

    // Create detailed feedback
    const feedback: DetailedFeedback = {
      summary: `Score: ${(result.metrics.averageScore * 100).toFixed(1)}%. ${result.strengths.length} strengths, ${result.weaknesses.length} weaknesses.`,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      actionItems: result.weaknesses.map(w => `Address: ${w}`)
    };

    return {
      score: result.metrics.averageScore,
      feedback
    };
  }

  /**
   * Create an optimized agent with new prompt
   */
  /**
   * Create a new prompt version in the database
   */
  private async createPromptVersion(
    parentPrompt: any,
    improvedTemplate: string,
    appliedTechniques: string[]
  ): Promise<string> {
    const timestamp = Date.now();
    const parentVersion = parentPrompt.version;
    const newVersion = `${parentVersion.split('_')[0]}_optimized_${timestamp}`;
    
    const metadata = {
      parentVersion,
      optimizationDate: new Date().toISOString(),
      appliedTechniques,
    };
    
    const promptService = new PromptService(this.db);
    await promptService.promptRepo.create({
      version: newVersion,
      name: `${parentPrompt.name} (Optimized)`,
      description: `Optimized version of ${parentPrompt.name} based on evaluation feedback`,
      template: improvedTemplate,
      variables: parentPrompt.variables,
      parentVersion: parentPrompt.version,
      createdBy: 'ai',
      generationStrategy: 'iterative-optimization',
      metadata
    });
    
    return newVersion;
  }

  private async createOptimizedAgent(
    baseAgent: Agent,
    newPromptVersion: string,
    iteration: number
  ): Promise<Agent> {
    const timestamp = Date.now();
    const optimizedKey = `${baseAgent.key}_opt_${timestamp}`;
    
    return await this.agentRepo.create({
      key: optimizedKey,
      name: `${baseAgent.name} (Iteration ${iteration})`,
      type: baseAgent.type,
      model: baseAgent.model,
      temperature: baseAgent.temperature,
      promptId: newPromptVersion,
      maxTokens: baseAgent.maxTokens,
      outputType: baseAgent.outputType,
      outputSchema: baseAgent.outputSchema,
      description: `Optimized version of ${baseAgent.key} at iteration ${iteration}`,
      metadata: {
        baseAgent: baseAgent.key,
        optimizationIteration: iteration,
        optimizationDate: new Date()
      }
    });
  }

  /**
   * Create optimization result
   */
  private createResult(
    finalAgent: Agent,
    finalScore: number,
    history: IterativeOptimizationStep[],
    targetReached: boolean,
    stoppedReason: string,
    duration: number
  ): IterativeOptimizationResult {
    const initialScore = history.length > 0 ? history[0].score : 0;
    const totalImprovement = finalScore - initialScore;

    return {
      finalAgentKey: finalAgent.key,
      finalPromptVersion: finalAgent.promptId,
      finalScore,
      totalImprovement,
      iterations: history.length,
      history,
      targetReached,
      stoppedReason,
      duration
    };
  }
}
