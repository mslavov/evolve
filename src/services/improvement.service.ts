import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RunRepository } from '../repositories/run.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { PromptService, type PromptGenerationStrategy } from './prompt.service.js';
import { AgentService } from './agent.service.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { EvalDataset } from '../db/schema/eval-datasets.js';

// New orchestration imports
import { FlowOrchestrator, type FlowConfig } from './orchestration/flow.orchestrator.js';
import { EvaluationRegistry } from './evaluation/registry.js';
import { NumericScoreEvaluator } from './evaluation/strategies/numeric-score.strategy.js';
import { FactBasedEvaluator } from './evaluation/strategies/fact-based.strategy.js';
import { HybridEvaluator } from './evaluation/strategies/hybrid.strategy.js';
import type { OptimizationParams as FlowOptimizationParams } from './orchestration/optimization-state.js';

export interface OptimizationParams {
  baseAgentKey: string; // Agent to optimize
  variations?: {
    models?: string[];
    temperatures?: number[];
    promptIds?: string[];
    generatePrompts?: boolean;
    promptStrategies?: PromptGenerationStrategy[];
  };
  testDataVersion?: string;
  testDataSplit?: 'validation' | 'test';
  sampleSize?: number;
}

export interface OptimizationResult {
  bestAgent: Agent;
  results: Array<{
    agent: Partial<NewAgent>;
    score: number;
    error: number;
    rmse: number;
  }>;
  recommendation: string;
}

export interface PromptImprovementParams {
  currentVersion: string;
  targetVersion: string;
  analysisDepth?: 'basic' | 'detailed';
}

export class ImprovementService {
  private agentRepo: AgentRepository;
  private runRepo: RunRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private promptService: PromptService;
  private agentService: AgentService;

  // New orchestration components
  private evaluationRegistry: EvaluationRegistry;
  private flowOrchestrator: FlowOrchestrator;

  constructor(db: Database) {
    this.agentRepo = new AgentRepository(db);
    this.runRepo = new RunRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.promptService = new PromptService(db);
    this.agentService = new AgentService(db);

    // Initialize orchestration components
    this.evaluationRegistry = new EvaluationRegistry();
    this.setupEvaluationStrategies();
    this.flowOrchestrator = new FlowOrchestrator(db, this.evaluationRegistry);
  }


  /**
   * Set up available evaluation strategies
   */
  private setupEvaluationStrategies(): void {
    // Register evaluation strategies
    this.evaluationRegistry.register(new NumericScoreEvaluator());
    this.evaluationRegistry.register(new FactBasedEvaluator());
    this.evaluationRegistry.register(new HybridEvaluator());

    // Set default strategy
    this.evaluationRegistry.setDefault('numeric-score');

    // Add automatic selection rules
    this.evaluationRegistry.addRule({
      name: 'content-scoring-rule',
      priority: 10,
      matches: (ctx) => ctx.hasNumericGroundTruth && !ctx.hasFactRequirements,
      strategyName: 'numeric-score',
    });

    this.evaluationRegistry.addRule({
      name: 'fact-based-rule',
      priority: 9,
      matches: (ctx) => ctx.hasFactRequirements,
      strategyName: 'fact-based',
    });

    this.evaluationRegistry.addRule({
      name: 'hybrid-rule',
      priority: 8,
      matches: (ctx) => ctx.hasNumericGroundTruth && ctx.hasTextualContent,
      strategyName: 'hybrid',
    });
  }

  /**
   * Run iterative optimization using the flow orchestrator
   */
  async runIterativeOptimization(params: {
    baseAgentKey: string;
    targetScore?: number;
    maxIterations?: number;
    evaluationStrategy?: string;
    enableResearch?: boolean;
    verbose?: boolean;
  }): Promise<any> {
    // Get base agent
    const baseAgent = await this.agentRepo.findByKey(params.baseAgentKey);
    if (!baseAgent) {
      throw new Error(`Base agent ${params.baseAgentKey} not found`);
    }

    // Prepare flow optimization parameters
    const flowParams: FlowOptimizationParams = {
      baseConfig: baseAgent,
      targetScore: params.targetScore || 0.9,
      maxIterations: params.maxIterations || 10,
      minImprovement: 0.01,
      evaluationStrategy: params.evaluationStrategy,
      enableResearch: params.enableResearch !== false,
      convergenceThreshold: 0.005,
    };

    // Prepare flow configuration
    const flowConfig: FlowConfig = {
      evaluationConfig: {
        strategy: params.evaluationStrategy,
        feedbackDetail: 'detailed',
      },
      enableParallelAgents: true,
      saveIntermediateResults: true,
      verbose: params.verbose || false,
    };

    // Run iterative optimization
    const result = await this.flowOrchestrator.runOptimizationFlow(flowParams, flowConfig);

    // Save the optimized agent
    const optimizedKey = `${params.baseAgentKey}_flow_optimized_${Date.now()}`;
    const optimizedAgent = await this.agentRepo.create({
      key: optimizedKey,
      name: `Flow-optimized from ${params.baseAgentKey}`,
      type: result.finalConfig.type,
      model: result.finalConfig.model,
      temperature: result.finalConfig.temperature,
      promptId: result.finalConfig.promptId,
      maxTokens: result.finalConfig.maxTokens,
      outputType: result.finalConfig.outputType,
      outputSchema: result.finalConfig.outputSchema,
      description: `Flow-optimized from ${params.baseAgentKey}`,
      metadata: {
        baseAgent: params.baseAgentKey,
        optimizationDate: new Date(),
        iterations: result.iterations,
        finalScore: result.finalScore,
        totalImprovement: result.totalImprovement,
        converged: result.converged,
        stoppedReason: result.stoppedReason,
      },
    });

    // Update performance metrics
    await this.agentRepo.updatePerformanceMetrics(
      optimizedKey,
      result.finalScore,
      false
    );

    // Analyze optimization history
    const analysis = this.flowOrchestrator.analyzeOptimizationHistory(result);

    return {
      optimizedAgent,
      result,
      analysis,
    };
  }

  /**
   * Optimize configuration by testing variations
   */
  async optimizeConfiguration(params: OptimizationParams): Promise<OptimizationResult> {
    // Get base agent
    const agentKey = params.baseAgentKey;
    if (!agentKey) {
      throw new Error('baseAgentKey must be provided');
    }

    const baseAgent = await this.agentRepo.findByKey(agentKey);

    if (!baseAgent) {
      throw new Error(`Base agent ${agentKey} not found`);
    }

    // Get test dataset
    const testData = await this.evalDatasetRepo.findMany({
      version: params.testDataVersion,
      split: params.testDataSplit || 'validation',
      limit: params.sampleSize || 100,
    });

    if (testData.length === 0) {
      throw new Error('No test data available for optimization');
    }

    // Generate agent variations
    const variations = await this.generateVariations(baseAgent, params.variations);

    // Test each variation
    const results = [];
    for (const variation of variations) {
      const { score, error, rmse } = await this.testAgent(
        variation,
        testData
      );

      results.push({
        agent: variation,
        score,
        error,
        rmse,
      });
    }

    // Sort by RMSE (lower is better)
    results.sort((a, b) => a.rmse - b.rmse);

    // Save the best agent
    const bestVariation = results[0];
    const bestAgentKey = `${agentKey}_optimized_${Date.now()}`;
    const bestAgent = await this.agentRepo.create({
      key: bestAgentKey,
      name: `Optimized from ${baseAgent.name}`,
      type: baseAgent.type,
      model: bestVariation.agent.model || baseAgent.model,
      temperature: bestVariation.agent.temperature || baseAgent.temperature,
      promptId: bestVariation.agent.promptId || baseAgent.promptId,
      maxTokens: bestVariation.agent.maxTokens || baseAgent.maxTokens,
      outputType: bestVariation.agent.outputType || baseAgent.outputType,
      outputSchema: bestVariation.agent.outputSchema || baseAgent.outputSchema,
      description: `Optimized from ${agentKey}`,
      metadata: {
        baseAgent: agentKey,
        optimizationDate: new Date(),
        testDataVersion: params.testDataVersion,
        performance: {
          score: bestVariation.score,
          error: bestVariation.error,
          rmse: bestVariation.rmse,
        },
      },
    });

    // Update performance metrics
    await this.agentRepo.updatePerformanceMetrics(
      bestAgentKey,
      bestVariation.score,
      false
    );

    return {
      bestAgent,
      results,
      recommendation: this.generateRecommendation(results, baseAgent),
    };
  }

  /**
   * Analyze prompt performance and suggest improvements
   */
  async analyzePromptPerformance(params: PromptImprovementParams): Promise<{
    currentPerformance: any;
    suggestions: string[];
    examples: Array<{
      input: string;
      currentScore: number;
      expectedScore: number;
      issue: string;
    }>;
  }> {
    // Get recent runs for the current prompt version
    const currentRuns = await this.runRepo.findMany({
      limit: 100,
    });

    // Get prompt by version
    const prompt = await this.promptService.getPrompt(params.currentVersion);
    if (!prompt) {
      throw new Error(`Prompt version ${params.currentVersion} not found`);
    }

    // Filter for runs with the current prompt
    const versionRuns = currentRuns.filter(
      r => r.configPromptVersion === params.currentVersion
    );

    // Get ground truth data from eval datasets
    const evalData = await this.evalDatasetRepo.findMany({
      limit: 100,
    });

    // Match runs with ground truth data
    const matched = versionRuns
      .map(run => {
        const groundTruth = evalData.find(
          e => e.input === run.input
        );
        return groundTruth ? {
          run,
          groundTruth: groundTruth.correctedScore,
          error: run.outputScore - groundTruth.correctedScore
        } : null;
      })
      .filter(Boolean) as Array<{
        run: any;
        groundTruth: number;
        error: number;
      }>;

    // Calculate performance metrics
    const avgError = matched.length > 0
      ? matched.reduce((sum, m) => sum + Math.abs(m.error), 0) / matched.length
      : 0;

    // Identify problematic examples
    const problems = matched
      .filter(m => Math.abs(m.error) > 0.2)
      .slice(0, 5)
      .map(m => ({
        input: m.run.input.substring(0, 100) + '...',
        currentScore: m.run.outputScore,
        expectedScore: m.groundTruth,
        issue: this.identifyIssue(m.error),
      }));

    // Create performance stats
    const currentStats = {
      totalRuns: versionRuns.length,
      withGroundTruth: matched.length,
      averageError: avgError,
      rmse: matched.length > 0
        ? Math.sqrt(matched.reduce((sum, m) => sum + Math.pow(m.error, 2), 0) / matched.length)
        : 0,
    };

    // Generate improvement suggestions
    const suggestions = this.generatePromptSuggestions(
      currentStats,
      problems,
      params.analysisDepth
    );

    return {
      currentPerformance: currentStats,
      suggestions,
      examples: problems,
    };
  }

  /**
   * Run evaluation on a specific agent configuration
   */
  async evaluateCurrentConfig(agentKey: string): Promise<any> {
    return this.evaluateAgent(agentKey);
  }

  /**
   * Run evaluation on a specific agent
   */
  async evaluateAgent(agentKey: string): Promise<{
    metrics: any;
    weaknesses: string[];
    strengths: string[];
  }> {
    // Get the specified agent
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent '${agentKey}' not found`);
    }

    // Get test dataset
    const testData = await this.evalDatasetRepo.findMany({
      split: 'test',
      limit: 50,
    });

    if (testData.length === 0) {
      throw new Error('No test data available for evaluation');
    }

    // Run evaluation
    const { score, error, rmse } = await this.testAgent(
      agent,
      testData
    );

    // Update agent metrics
    await this.agentRepo.updatePerformanceMetrics(agent.key, score);

    // Analyze strengths and weaknesses
    const analysis = await this.analyzePerformance(agent, testData);

    return {
      metrics: {
        averageScore: score,
        averageError: error,
        rmse,
        samplesEvaluated: testData.length,
      },
      weaknesses: analysis.weaknesses,
      strengths: analysis.strengths,
    };
  }

  /**
   * Generate agent variations for testing
   */
  private async generateVariations(
    baseAgent: Agent,
    variations?: OptimizationParams['variations']
  ): Promise<Array<Partial<NewAgent>>> {
    const agents: Array<Partial<NewAgent>> = [];

    const models = variations?.models || [baseAgent.model];
    const temperatures = variations?.temperatures || [baseAgent.temperature];
    let promptIds = variations?.promptIds || [baseAgent.promptId];

    // Generate new prompts if requested
    if (variations?.generatePrompts && variations?.promptStrategies) {
      const newPromptIds = await this.generatePromptVariations(
        baseAgent.promptId,
        variations.promptStrategies
      );
      promptIds = [...promptIds, ...newPromptIds];
    }

    for (const model of models) {
      for (const temperature of temperatures) {
        for (const promptId of promptIds) {
          agents.push({
            model,
            temperature,
            promptId,
            maxTokens: baseAgent.maxTokens || undefined,
            outputType: baseAgent.outputType,
            outputSchema: baseAgent.outputSchema,
          });
        }
      }
    }

    return agents;
  }

  /**
   * Test an agent against a dataset
   */
  private async testAgent(
    agent: Partial<NewAgent> | Agent,
    testData: EvalDataset[]
  ): Promise<{ score: number; error: number; rmse: number }> {
    let totalScore = 0;
    let totalError = 0;
    let totalSquaredError = 0;
    let count = 0;

    // Check if this is an existing agent or a new one
    const isExistingAgent = 'id' in agent && 'key' in agent;
    let agentKey: string;
    let shouldCleanup = false;

    if (isExistingAgent) {
      // Use existing agent directly
      agentKey = (agent as Agent).key;
    } else {
      // Create temporary agent for testing
      const tempKey = `temp_${Date.now()}`;
      await this.agentRepo.create({
        ...agent as Partial<NewAgent>,
        key: tempKey,
        name: 'Temporary Test Agent',
        type: 'scorer',
        model: agent.model || 'gpt-4o-mini',
        temperature: agent.temperature || 0.3,
        promptId: agent.promptId || 'v1',
      });
      agentKey = tempKey;
      shouldCleanup = true;
    }

    try {
      for (const data of testData) {
        const result = await this.agentService.run(
          data.input,
          { agentKey }
        );

        // Extract score from output
        const score = typeof result.output === 'object' && result.output.score !== undefined
          ? result.output.score
          : 0;

        const error = score - data.correctedScore;

        totalScore += score;
        totalError += error;
        totalSquaredError += error * error;
        count++;
      }
    } finally {
      // Clean up temporary agent if we created one
      if (shouldCleanup) {
        await this.agentRepo.deleteByKey(agentKey);
      }
    }

    if (count === 0) return { score: 0, error: 0, rmse: 0 };

    return {
      score: totalScore / count,
      error: totalError / count,
      rmse: Math.sqrt(totalSquaredError / count),
    };
  }

  /**
   * Analyze performance for strengths and weaknesses
   */
  private async analyzePerformance(
    agent: Agent,
    testData: EvalDataset[]
  ): Promise<{ weaknesses: string[]; strengths: string[] }> {
    const weaknesses: string[] = [];
    const strengths: string[] = [];

    // Group errors by content type
    const errorsByType: Record<string, number[]> = {};

    for (const data of testData) {
      const result = await this.agentService.run(
        data.input,
        { agentKey: agent.key }
      );

      // Extract score from output
      const score = typeof result.output === 'object' && result.output.score !== undefined
        ? result.output.score
        : 0;
      const error = Math.abs(score - data.correctedScore);
      const type = data.metadata.inputType || 'general';

      if (!errorsByType[type]) errorsByType[type] = [];
      errorsByType[type].push(error);
    }

    // Analyze by type
    for (const [type, errors] of Object.entries(errorsByType)) {
      const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

      if (avgError > 0.2) {
        weaknesses.push(`High error rate for ${type} content (avg: ${avgError.toFixed(2)})`);
      } else if (avgError < 0.1) {
        strengths.push(`Excellent accuracy for ${type} content (avg: ${avgError.toFixed(2)})`);
      }
    }

    // Analyze by score range
    const lowScoreErrors = testData
      .filter(d => d.correctedScore < 0.3)
      .length;

    const highScoreErrors = testData
      .filter(d => d.correctedScore > 0.7)
      .length;

    if (lowScoreErrors > testData.length * 0.3) {
      weaknesses.push('Struggles with low-quality content identification');
    }

    if (highScoreErrors > testData.length * 0.3) {
      weaknesses.push('Overscores content (too generous)');
    }

    return { weaknesses, strengths };
  }

  /**
   * Generate recommendation based on optimization results
   */
  private generateRecommendation(
    results: OptimizationResult['results'],
    baseAgent: Agent
  ): string {
    const best = results[0];
    const baseline = results.find(r =>
      r.agent.model === baseAgent.model &&
      r.agent.temperature === baseAgent.temperature &&
      r.agent.promptId === baseAgent.promptId
    );

    if (!baseline) {
      return `Best agent configuration: ${JSON.stringify(best.agent)} with RMSE: ${best.rmse.toFixed(3)}`;
    }

    const improvement = ((baseline.rmse - best.rmse) / baseline.rmse) * 100;

    if (improvement > 10) {
      return `Significant improvement found! New agent configuration reduces error by ${improvement.toFixed(1)}%. Consider adopting: ${JSON.stringify(best.agent)}`;
    } else if (improvement > 0) {
      return `Minor improvement found (${improvement.toFixed(1)}% error reduction). Current agent is reasonably optimized.`;
    } else {
      return 'Current agent is already optimal for the test dataset.';
    }
  }

  /**
   * Generate prompt variations using AI
   */
  private async generatePromptVariations(
    basePromptId: string,
    strategies: PromptGenerationStrategy[]
  ): Promise<string[]> {
    const generatedPromptIds: string[] = [];

    for (const strategy of strategies) {
      try {
        const newPrompt = await this.promptService.generateVariation(
          basePromptId,
          strategy,
          this.agentService
        );
        generatedPromptIds.push(newPrompt.id);
      } catch (error) {
        console.warn(`Failed to generate prompt variation with strategy ${strategy.type}:`, error);
      }
    }

    return generatedPromptIds;
  }

  /**
   * Identify the issue type based on error
   */
  private identifyIssue(error: number): string {
    if (error > 0.3) return 'Significant overscoring';
    if (error > 0.1) return 'Mild overscoring';
    if (error < -0.3) return 'Significant underscoring';
    if (error < -0.1) return 'Mild underscoring';
    return 'Minor deviation';
  }

  /**
   * Generate prompt improvement suggestions
   */
  private generatePromptSuggestions(
    stats: any,
    problems: any[],
    depth?: 'basic' | 'detailed'
  ): string[] {
    const suggestions: string[] = [];

    // Basic suggestions
    if (stats.averageError > 0.1) {
      suggestions.push('Prompt tends to overscore - consider adding stricter criteria');
    }

    if (stats.averageError < -0.1) {
      suggestions.push('Prompt tends to underscore - consider relaxing criteria');
    }

    if (stats.rmse > 0.2) {
      suggestions.push('High variance in scoring - prompt may need clearer guidelines');
    }

    // Detailed suggestions
    if (depth === 'detailed') {
      const issueTypes = problems.map(p => p.issue);
      const uniqueIssues = [...new Set(issueTypes)];

      for (const issue of uniqueIssues) {
        const count = issueTypes.filter(i => i === issue).length;
        if (count >= 2) {
          suggestions.push(`Multiple instances of ${issue} detected - review scoring criteria`);
        }
      }

      suggestions.push('Consider adding examples of edge cases to the prompt');
      suggestions.push('Review dimension weights and their impact on final score');
    }

    return suggestions;
  }
}