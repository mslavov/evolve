import { Database } from '../db/client.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { GridSearchService, type GridSearchParams, type TestResult } from './grid-search.service.js';
import type { Agent } from '../db/schema/agents.js';

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
}

/**
 * EvaluationService - Dedicated service for evaluating agent performance
 * 
 * This service provides comprehensive evaluation capabilities:
 * - Agent performance evaluation against test datasets
 * - Strength and weakness analysis
 * - Performance tracking and metrics
 */
export class EvaluationService {
  private agentRepo: AgentRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  private gridSearchService: GridSearchService;

  constructor(private db: Database) {
    this.agentRepo = new AgentRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
    this.gridSearchService = new GridSearchService(db);
  }

  /**
   * Evaluate an agent's performance against test data
   */
  async evaluateAgent(
    agentKey: string,
    options?: {
      datasetVersion?: string;
      limit?: number;
      split?: 'train' | 'validation' | 'test';
    }
  ): Promise<EvaluationResult> {
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent '${agentKey}' not found`);
    }

    // Get test data for evaluation
    // Note: Current database doesn't have proper split metadata, so we just get any available data
    const testData = await this.evalDatasetRepo.findMany({
      version: options?.datasetVersion,
      limit: options?.limit ?? 50,
    });

    if (testData.length === 0) {
      throw new Error(`No ${options?.split || 'test'} data available for evaluation`);
    }

    // Use grid search service for evaluation with a dummy variation
    // GridSearchService requires at least one variation, so we pass the current config
    const evalParams: GridSearchParams = {
      baseAgentKey: agentKey,
      variations: {
        models: [agent.model], // Use current model as the only "variation"
      },
      dataset: {
        limit: testData.length,
        version: options?.datasetVersion
      },
    };

    const gridResult = await this.gridSearchService.runGridSearch(evalParams);
    const result = gridResult.results[0]; // Single result since only one configuration

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