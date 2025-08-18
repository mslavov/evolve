import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { AgentService } from './agent.service.js';
import { OutputEvaluator } from './evaluation/output-evaluator.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { EvalDataset } from '../db/schema/eval-datasets.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EvaluationService') as any;

/**
 * Single test result for a dataset item
 */
export interface SampleResult {
  input: string;
  expected: any;
  actual: any;
  similarity: number;
  error: number;
}

/**
 * Test result for an agent configuration
 */
export interface TestResult {
  /** Agent configuration that was tested */
  config: Partial<NewAgent>;
  
  /** Performance metrics */
  metrics: {
    score: number; // average similarity score (0-1)
    error: number; // average error rate
    rmse: number; // root mean squared error
    sampleCount: number;
  };
  
  /** Test duration in milliseconds */
  duration: number;
  
  /** Individual sample results (for detailed analysis) */
  sampleResults?: SampleResult[];
}

/**
 * Evaluation result with detailed metrics and analysis
 */
export interface EvaluationResult {
  /** Performance metrics */
  metrics: {
    averageScore: number;
    averageError: number;
    rmse: number;
    samplesEvaluated: number;
  };
  /** Identified weaknesses */
  weaknesses: string[];
  /** Identified strengths */
  strengths: string[];
  /** Timestamp of evaluation */
  timestamp: Date;
  /** Agent configuration that was evaluated */
  agentConfig: {
    key: string;
    model: string;
    temperature: number;
    promptId: string;
  };
  /** Detailed sample results if requested */
  sampleResults?: SampleResult[];
}

/**
 * EvaluationService - Core service for evaluating agent performance
 * 
 * This is the foundational service for all agent testing and evaluation.
 * Other services (GridSearch, IterativeOptimization) use this for testing.
 */
export class EvaluationService {
  private agentRepo: AgentRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private agentService: AgentService;
  private outputEvaluator: OutputEvaluator;

  constructor(private db: Database) {
    this.agentRepo = new AgentRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.agentService = new AgentService(db);
    this.outputEvaluator = new OutputEvaluator(db);
  }

  /**
   * Core method: Test an agent configuration against a dataset
   * This is the fundamental testing method used by all other services
   */
  async testAgentConfiguration(
    config: Partial<NewAgent>,
    dataset: EvalDataset[],
    options?: {
      includeDetails?: boolean;
      agentKey?: string; // Use existing agent if provided
    }
  ): Promise<TestResult> {
    logger.info('Starting agent configuration test', {
      config: {
        model: config.model,
        temperature: config.temperature,
        promptId: config.promptId,
        outputType: config.outputType,
      },
      datasetSize: dataset.length,
      includeDetails: options?.includeDetails,
      existingAgent: options?.agentKey,
    });
    
    const startTime = Date.now();
    const outputType = OutputEvaluator.inferOutputType(config);
    const sampleResults: SampleResult[] = [];
    
    let totalSimilarity = 0;
    let totalSquaredError = 0;

    // Use existing agent or create temporary one
    let agentKey = options?.agentKey;
    let tempAgent: Agent | null = null;

    if (!agentKey) {
      // Create a temporary agent for testing
      const tempKey = `temp_eval_${Date.now()}_${Math.random()}`;
      logger.debug('Creating temporary agent for evaluation', { tempKey });
      tempAgent = await this.agentRepo.create({
        key: tempKey,
        name: 'Temporary Evaluation Agent',
        type: config.type || 'scorer',
        model: config.model || 'gpt-4o-mini',
        temperature: config.temperature ?? 0.3,
        maxTokens: config.maxTokens || 1000,
        promptId: config.promptId || 'v1',
        outputType: config.outputType || 'structured',
        outputSchema: config.outputSchema,
        description: 'Temporary agent for evaluation',
      });
      agentKey = tempAgent.key;
    }

    try {
      // Test each sample
      for (let i = 0; i < dataset.length; i++) {
        const data = dataset[i];
        logger.debug(`\n${'='.repeat(80)}`);
        logger.debug(`TESTING SAMPLE ${i + 1}/${dataset.length}`);
        logger.debug(`${'='.repeat(80)}`);
        
        logger.debug({
          fullInput: data.input,
          inputLength: data.input.length,
        }, '📥 INPUT');
        
        logger.debug({
          expected: typeof data.expectedOutput === 'string' 
            ? data.expectedOutput 
            : JSON.stringify(data.expectedOutput, null, 2),
          type: typeof data.expectedOutput,
        }, '✅ EXPECTED OUTPUT');
        
        try {
          // Run the agent
          logger.debug(`🤖 Running agent: ${agentKey}`);
          const result = await this.agentService.run(data.input, { 
            agentKey
          });
          
          logger.debug({
            output: result.output,
            outputType: typeof result.output,
            runId: result.runId,
          }, '📤 ACTUAL OUTPUT');

          // Parse expected output
          const expected = typeof data.expectedOutput === 'string' 
            ? JSON.parse(data.expectedOutput)
            : data.expectedOutput;

          // Parse actual output if it's a string (to ensure consistent format)
          const actual = typeof result.output === 'string' 
            ? (() => {
                try {
                  // Try to extract JSON from markdown code blocks first
                  const jsonMatch = result.output.match(/```json\n?([\s\S]*?)\n?```/) || 
                                   result.output.match(/```\n?([\s\S]*?)\n?```/);
                  const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.output;
                  return JSON.parse(jsonStr);
                } catch {
                  return result.output; // Keep as string if not valid JSON
                }
              })()
            : result.output;

          logger.debug({
            expected,
            actual,
            comparisonType: outputType,
          }, '🔍 COMPARING OUTPUTS');

          // Compare outputs
          const comparison = await this.outputEvaluator.compare(actual, expected, outputType);
          
          logger.debug({
            similarity: comparison.similarity.toFixed(4),
            error: (1 - comparison.similarity).toFixed(4),
            reasoning: comparison.reasoning,
            passed: comparison.similarity >= 0.7 ? '✅ PASS' : '❌ FAIL',
          }, '📊 COMPARISON RESULT');
          
          totalSimilarity += comparison.similarity;
          const error = 1 - comparison.similarity;
          totalSquaredError += error * error;

          // Store sample result
          if (options?.includeDetails) {
            sampleResults.push({
              input: data.input,
              expected,
              actual,
              similarity: comparison.similarity,
              error,
            });
          }

        } catch (error) {
          logger.error(`❌ FAILED TO TEST SAMPLE ${i + 1}`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            input: data.input,
            expectedOutput: data.expectedOutput,
          });
          // Add failed sample with 0 score
          totalSquaredError += 1; // Maximum error for failed cases
          if (options?.includeDetails) {
            sampleResults.push({
              input: data.input,
              expected: data.expectedOutput,
              actual: null,
              similarity: 0,
              error: 1,
            });
          }
        }
      }
    } finally {
      // Clean up temporary agent if created
      if (tempAgent) {
        await this.agentRepo.deleteByKey(tempAgent.key);
      }
    }

    const count = dataset.length;
    const avgScore = count > 0 ? totalSimilarity / count : 0;
    const avgError = count > 0 ? (count - totalSimilarity) / count : 0;
    const rmse = count > 0 ? Math.sqrt(totalSquaredError / count) : 0;

    logger.debug(`${'='.repeat(80)}`);
    logger.info({
      metrics: {
        averageScore: avgScore,
        averageError: avgError,
        rmse: rmse,
        samplesEvaluated: count,
      },
      duration: `${Date.now() - startTime}ms`,
      performance: avgScore >= 0.7 ? '✅ GOOD' : avgScore >= 0.5 ? '⚠️ MODERATE' : '❌ POOR',
    }, '📈 TEST CONFIGURATION COMPLETED');
    logger.debug(`${'='.repeat(80)}`);

    return {
      config,
      metrics: {
        score: avgScore,
        error: avgError,
        rmse,
        sampleCount: count,
      },
      duration: Date.now() - startTime,
      sampleResults: options?.includeDetails ? sampleResults : undefined,
    };
  }

  /**
   * Evaluate an existing agent's performance
   */
  async evaluateAgent(
    agentKey: string,
    options?: {
      datasetVersion?: string;
      limit?: number;
      split?: 'train' | 'validation' | 'test';
      includeDetails?: boolean;
    }
  ): Promise<EvaluationResult> {
    logger.info('Starting agent evaluation', {
      agentKey,
      options,
    });
    
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      logger.error('Agent not found', { agentKey });
      throw new Error(`Agent '${agentKey}' not found`);
    }
    
    logger.debug('Agent loaded', { agent });

    // Get test data for evaluation - filter by agent
    logger.debug('Fetching evaluation dataset', {
      agentId: agent.id,
      version: options?.datasetVersion,
      split: options?.split,
      limit: options?.limit ?? 50,
    });
    
    const testData = await this.evalDatasetRepo.findMany({
      agentId: agent.id,
      version: options?.datasetVersion,
      split: options?.split,
      limit: options?.limit ?? 50,
    });

    logger.info('Dataset loaded', { 
      datasetSize: testData.length,
      version: options?.datasetVersion || 'default',
      split: options?.split || 'test',
    });

    if (testData.length === 0) {
      logger.error('No test data available', {
        agentId: agent.id,
        version: options?.datasetVersion,
        split: options?.split || 'test',
      });
      throw new Error(`No ${options?.split || 'test'} data available for evaluation`);
    }

    // Test the agent configuration
    const result = await this.testAgentConfiguration(
      {
        model: agent.model,
        temperature: agent.temperature,
        promptId: agent.promptId,
        maxTokens: agent.maxTokens,
        outputType: agent.outputType,
        outputSchema: agent.outputSchema,
      },
      testData,
      {
        includeDetails: options?.includeDetails,
        agentKey: agent.key, // Use existing agent
      }
    );

    // Update agent's performance metrics
    await this.agentRepo.updatePerformanceMetrics(agent.key, result.metrics.score);

    // Analyze performance to identify strengths and weaknesses
    const analysis = await this.analyzeAgentPerformance(agent, result);

    return {
      metrics: {
        averageScore: result.metrics.score,
        averageError: result.metrics.error,
        rmse: result.metrics.rmse,
        samplesEvaluated: result.metrics.sampleCount,
      },
      weaknesses: analysis.weaknesses,
      strengths: analysis.strengths,
      timestamp: new Date(),
      agentConfig: {
        key: agent.key,
        model: agent.model,
        temperature: agent.temperature,
        promptId: agent.promptId,
      },
      sampleResults: result.sampleResults,
    };
  }

  /**
   * Analyze agent performance to identify strengths and weaknesses
   */
  private async analyzeAgentPerformance(
    agent: Agent,
    result: TestResult
  ): Promise<{ weaknesses: string[]; strengths: string[] }> {
    const weaknesses: string[] = [];
    const strengths: string[] = [];

    // Analyze overall accuracy
    if (result.metrics.score > 0.9) {
      strengths.push('Excellent overall accuracy (>90%)');
    } else if (result.metrics.score > 0.8) {
      strengths.push('Good overall accuracy (>80%)');
    } else if (result.metrics.score > 0.7) {
      strengths.push('Decent overall accuracy (>70%)');
    } else if (result.metrics.score < 0.6) {
      weaknesses.push('Low overall accuracy (<60%) - needs significant improvement');
    } else if (result.metrics.score < 0.5) {
      weaknesses.push('Very poor accuracy (<50%) - agent is performing worse than random');
    }

    // Analyze consistency (RMSE)
    if (result.metrics.rmse > 0.3) {
      weaknesses.push('High variance in outputs (RMSE > 0.3) - inconsistent performance');
    } else if (result.metrics.rmse > 0.2) {
      weaknesses.push('Moderate variance in outputs (RMSE > 0.2)');
    } else if (result.metrics.rmse < 0.1) {
      strengths.push('Very consistent output quality (RMSE < 0.1)');
    } else if (result.metrics.rmse < 0.15) {
      strengths.push('Good output consistency (RMSE < 0.15)');
    }

    // Analyze sample results if available
    if (result.sampleResults && result.sampleResults.length > 0) {
      const failures = result.sampleResults.filter(s => s.similarity < 0.5);
      const poorResults = result.sampleResults.filter(s => s.similarity < 0.7);
      const goodResults = result.sampleResults.filter(s => s.similarity > 0.8);
      const perfectResults = result.sampleResults.filter(s => s.similarity > 0.95);

      // Report failures
      if (failures.length > result.sampleResults.length * 0.3) {
        weaknesses.push(`${failures.length}/${result.sampleResults.length} samples failed (similarity < 50%)`);
      } else if (failures.length > result.sampleResults.length * 0.2) {
        weaknesses.push(`${failures.length} samples had poor similarity scores`);
      }

      // Report poor results
      if (poorResults.length > result.sampleResults.length * 0.5) {
        weaknesses.push(`Over half of samples had subpar results (similarity < 70%)`);
      }

      // Report good results
      if (goodResults.length > result.sampleResults.length * 0.7) {
        strengths.push(`${goodResults.length}/${result.sampleResults.length} samples had good results (>80% similarity)`);
      }

      // Report perfect results
      if (perfectResults.length > result.sampleResults.length * 0.5) {
        strengths.push(`${perfectResults.length} samples had near-perfect similarity (>95%)`);
      } else if (perfectResults.length > result.sampleResults.length * 0.3) {
        strengths.push(`${perfectResults.length} samples achieved excellent results`);
      }
    }

    // Model-specific insights
    if (agent.model.includes('gpt-4') && !agent.model.includes('mini')) {
      if (result.metrics.score < 0.8) {
        weaknesses.push('GPT-4 model underperforming - consider prompt optimization');
      }
    } else if (agent.model.includes('gpt-3.5') || agent.model.includes('mini')) {
      if (result.metrics.score > 0.85) {
        strengths.push('Achieving excellent results with cost-effective model');
      } else if (result.metrics.score < 0.6) {
        weaknesses.push('Consider upgrading to a more capable model for better accuracy');
      }
    }

    // Temperature-related insights
    if (agent.temperature > 0.7) {
      if (result.metrics.score < 0.7) {
        weaknesses.push('High temperature (>0.7) may be causing inconsistent outputs');
      } else {
        strengths.push('Good performance despite high temperature setting');
      }
    } else if (agent.temperature < 0.3) {
      strengths.push('Low temperature (<0.3) provides consistent, deterministic outputs');
      if (result.metrics.rmse > 0.2) {
        weaknesses.push('Unexpected variance despite low temperature - check prompt or data quality');
      }
    }

    // Sample size insights
    if (result.metrics.sampleCount < 10) {
      weaknesses.push(`Limited evaluation data (${result.metrics.sampleCount} samples) - results may not be representative`);
    } else if (result.metrics.sampleCount < 30) {
      weaknesses.push(`Small sample size (${result.metrics.sampleCount} samples) - consider evaluating with more data`);
    } else if (result.metrics.sampleCount > 100) {
      strengths.push(`Robust evaluation with ${result.metrics.sampleCount} samples`);
    }

    return { weaknesses, strengths };
  }
}