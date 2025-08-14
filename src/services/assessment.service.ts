import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AssessmentRepository } from '../repositories/assessment.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import type { Run } from '../db/schema/runs.js';
import type { Assessment, NewAssessment } from '../db/schema/assessments.js';
import type { EvalDataset, NewEvalDataset } from '../db/schema/eval-datasets.js';
import { getDatasetConfig } from '../config/dataset.config.js';
import {
  extractScoreFromOutput,
  determineExpectedOutput,
  generateDatasetVersion,
  determineDatasetSplit,
  determineQuality,
  generateDatasetTags,
  formatOutputForDataset,
} from '../utils/data-extraction.js';

export interface AddAssessmentParams {
  runId: string;
  verdict: 'correct' | 'incorrect';
  expectedOutput?: any;
  reasoning?: string;
  assessedBy?: 'human' | 'llm' | 'consensus';
  assessorId?: string;
  confidence?: number;
}

export interface BuildDatasetParams {
  source?: 'assessment' | 'human' | 'consensus';
  minConfidence?: number;
  samplingRate?: number;
  version?: string;
  split?: 'train' | 'validation' | 'test';
  quality?: 'high' | 'medium' | 'low';
}

export interface DatasetExportOptions {
  version?: string;
  split?: 'train' | 'validation' | 'test';
  format?: 'json' | 'jsonl' | 'csv';
}

export class AssessmentService {
  private runRepo: RunRepository;
  private assessmentRepo: AssessmentRepository;
  private evalDatasetRepo: EvalDatasetRepository;
  
  constructor(private readonly db: Database) {
    this.runRepo = new RunRepository(db);
    this.assessmentRepo = new AssessmentRepository(db);
    this.evalDatasetRepo = new EvalDatasetRepository(db);
  }
  
  /**
   * Add an assessment for a run
   */
  async addAssessment(params: AddAssessmentParams): Promise<string> {
    // Verify the run exists
    const run = await this.runRepo.findById(params.runId);
    if (!run) {
      throw new Error(`Run with ID ${params.runId} not found`);
    }
    
    // Create the assessment
    const assessmentData: NewAssessment = {
      runId: params.runId,
      verdict: params.verdict,
      expectedOutput: params.expectedOutput ? JSON.stringify(params.expectedOutput) : undefined,
      reasoning: params.reasoning,
      assessedBy: params.assessedBy || 'human',
      assessorId: params.assessorId,
      confidence: params.confidence,
    };
    
    const assessment = await this.assessmentRepo.create(assessmentData);
    
    // Check configuration for auto-create
    const config = getDatasetConfig();
    
    // Automatically add to eval dataset if configured and high confidence
    if (config.autoCreate.enabled && 
        params.confidence && 
        params.confidence >= config.autoCreate.confidenceThreshold) {
      const quality = determineQuality(params.confidence, config.qualityThresholds);
      await this.addToDataset(run, assessment, {
        quality,
        version: generateDatasetVersion('auto'),
      });
    }
    
    return assessment.id;
  }
  
  /**
   * Get assessment statistics
   */
  async getAssessmentStats() {
    return this.assessmentRepo.getStats();
  }
  
  /**
   * Build eval dataset from assessed runs (optimized)
   */
  async buildDataset(params: BuildDatasetParams = {}): Promise<{
    added: number;
    filtered: number;
    version: string;
  }> {
    const config = getDatasetConfig();
    const version = params.version || generateDatasetVersion();
    
    // Get all runs efficiently
    const allRuns = await this.runRepo.findMany({});
    if (allRuns.length === 0) {
      return { added: 0, filtered: 0, version };
    }
    
    // Batch fetch all assessments at once
    const runIds = allRuns.map(r => r.id);
    const assessmentsByRun = await this.assessmentRepo.findByRunIds(runIds);
    
    // Filter runs with assessments
    const runsWithAssessments = allRuns.filter(run => 
      assessmentsByRun.has(run.id) && assessmentsByRun.get(run.id)!.length > 0
    );
    
    let added = 0;
    let filtered = 0;
    const batchSize = config.performance.batchSize;
    
    // Process in batches to manage memory
    for (let i = 0; i < runsWithAssessments.length; i += batchSize) {
      const batch = runsWithAssessments.slice(i, i + batchSize);
      const datasetEntries: NewEvalDataset[] = [];
      
      for (const run of batch) {
        const assessments = assessmentsByRun.get(run.id) || [];
        
        // Filter by confidence if specified
        let validAssessments = assessments;
        if (params.minConfidence) {
          validAssessments = assessments.filter(
            a => a.confidence && a.confidence >= params.minConfidence!
          );
        }
        
        if (validAssessments.length === 0) {
          filtered++;
          continue;
        }
        
        // Apply sampling rate
        const samplingRate = params.samplingRate ?? config.defaults.samplingRate;
        if (samplingRate < 1 && Math.random() > samplingRate) {
          filtered++;
          continue;
        }
        
        // Use the most recent or highest confidence assessment
        const assessment = validAssessments.sort((a, b) => {
          if (a.confidence && b.confidence) {
            return b.confidence - a.confidence;
          }
          return b.timestamp.getTime() - a.timestamp.getTime();
        })[0];
        
        // Prepare dataset entry
        const quality = params.quality || determineQuality(
          assessment.confidence,
          config.qualityThresholds
        );
        
        const split = params.split || determineDatasetSplit(
          config.defaults.splitRatios
        );
        
        const datasetEntry = this.prepareDatasetEntry(run, assessment, {
          version,
          split,
          quality,
          source: params.source || 'assessment',
        });
        
        datasetEntries.push(datasetEntry);
      }
      
      // Batch insert/upsert dataset entries
      for (const entry of datasetEntries) {
        await this.evalDatasetRepo.upsert(entry);
        added++;
      }
    }
    
    return { added, filtered: allRuns.length - runsWithAssessments.length + filtered, version };
  }
  
  /**
   * Export dataset for training/evaluation
   */
  async exportDataset(options: DatasetExportOptions = {}) {
    const { records, metadata } = await this.evalDatasetRepo.exportDataset({
      version: options.version,
      split: options.split,
    });
    
    if (options.format === 'jsonl') {
      return records.map(r => JSON.stringify({
        input: r.input,
        expectedOutput: r.expectedOutput,
        reasoning: r.metadata?.reasoning,
        metadata: {
          id: r.id,
          source: r.metadata?.source,
          quality: r.metadata?.quality,
        },
      })).join('\n');
    }
    
    return { records, metadata };
  }
  
  /**
   * Get dataset statistics
   */
  async getDatasetStats() {
    return this.evalDatasetRepo.getStats();
  }
  
  /**
   * Get runs pending assessment
   */
  async getPendingRuns(limit?: number) {
    return this.runRepo.findPending(limit);
  }
  
  
  /**
   * Clear dataset by version or split
   */
  async clearDataset(filters?: {
    version?: string;
    split?: 'train' | 'validation' | 'test';
  }): Promise<number> {
    return this.evalDatasetRepo.clearDataset(filters);
  }
  
  /**
   * Add a run and assessment to the eval dataset
   */
  private async addToDataset(
    run: Run,
    assessment: Assessment,
    options: {
      version?: string;
      split?: 'train' | 'validation' | 'test';
      quality?: 'high' | 'medium' | 'low';
      source?: 'assessment' | 'human' | 'consensus';
    }
  ): Promise<void> {
    const config = getDatasetConfig();
    const datasetEntry = this.prepareDatasetEntry(run, assessment, {
      version: options.version || generateDatasetVersion(),
      split: options.split || determineDatasetSplit(config.defaults.splitRatios),
      quality: options.quality || determineQuality(
        assessment.confidence,
        config.qualityThresholds
      ),
      source: options.source || 'assessment',
    });
    
    // Use upsert to prevent duplicates
    await this.evalDatasetRepo.upsert(datasetEntry);
  }
  
  /**
   * Prepare a dataset entry from run and assessment
   */
  private prepareDatasetEntry(
    run: Run,
    assessment: Assessment,
    options: {
      version: string;
      split: 'train' | 'validation' | 'test';
      quality: 'high' | 'medium' | 'low';
      source: 'assessment' | 'human' | 'consensus';
    }
  ): NewEvalDataset {
    const tags = generateDatasetTags(run, assessment);
    
    return {
      runId: run.id,
      assessmentId: assessment.id,
      input: run.input,
      expectedOutput: assessment.expectedOutput || determineExpectedOutput(run),
      agentOutput: formatOutputForDataset(run.output),
      verdict: assessment.verdict,
      datasetType: 'evaluation',
      datasetVersion: options.version,
      metadata: {
        source: options.source,
        quality: options.quality,
        split: options.split,
        reasoning: assessment.reasoning,
        confidence: assessment.confidence,
        agentId: run.agentId,
        tags,
      },
      updatedAt: new Date(),
    };
  }
  
  // Removed deprecated private methods - now using utility functions
}