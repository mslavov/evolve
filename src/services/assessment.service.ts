import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AssessmentRepository } from '../repositories/assessment.repository.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import type { Run } from '../db/schema/runs.js';
import type { Assessment, NewAssessment } from '../db/schema/assessments.js';
import type { EvalDataset, NewEvalDataset } from '../db/schema/eval-datasets.js';

export interface AddAssessmentParams {
  runId: string;
  verdict: 'correct' | 'incorrect';
  correctedScore?: number;
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
      correctedScore: params.correctedScore,
      reasoning: params.reasoning,
      assessedBy: params.assessedBy || 'human',
      assessorId: params.assessorId,
      confidence: params.confidence,
    };
    
    const assessment = await this.assessmentRepo.create(assessmentData);
    
    // Automatically add to eval dataset if assessment is high confidence
    if (params.confidence && params.confidence >= 0.8) {
      await this.addToDataset(run, assessment, {
        quality: params.confidence >= 0.9 ? 'high' : 'medium',
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
   * Build eval dataset from assessed runs
   */
  async buildDataset(params: BuildDatasetParams = {}): Promise<{
    added: number;
    skipped: number;
    version: string;
  }> {
    // Get all runs and filter for those with assessments
    const allRuns = await this.runRepo.findMany({});
    const runs = [];
    
    // Filter runs that have assessments
    for (const run of allRuns) {
      const assessments = await this.assessmentRepo.findByRunId(run.id);
      if (assessments.length > 0) {
        runs.push(run);
      }
    }
    
    const version = params.version || `v${Date.now()}`;
    let added = 0;
    let skipped = 0;
    
    for (const run of runs) {
      // Get assessments for this run (we know it has assessments from filtering above)
      const assessments = await this.assessmentRepo.findByRunId(run.id);
      
      if (assessments.length === 0) {
        skipped++;
        continue;
      }
      
      // Filter by confidence if specified
      let validAssessments = assessments;
      if (params.minConfidence) {
        validAssessments = assessments.filter(
          a => a.confidence && a.confidence >= params.minConfidence!
        );
      }
      
      if (validAssessments.length === 0) {
        skipped++;
        continue;
      }
      
      // Apply sampling rate
      if (params.samplingRate && Math.random() > params.samplingRate) {
        skipped++;
        continue;
      }
      
      // Use the most recent or highest confidence assessment
      const assessment = validAssessments.sort((a, b) => {
        if (a.confidence && b.confidence) {
          return b.confidence - a.confidence;
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      })[0];
      
      // Add to dataset
      await this.addToDataset(run, assessment, {
        version,
        split: params.split,
        quality: params.quality || this.determineQuality(assessment),
        source: params.source || 'assessment',
      });
      
      added++;
    }
    
    return { added, skipped, version };
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
        groundTruth: r.correctedScore,
        reasoning: r.metadata.reasoning,
        metadata: {
          id: r.id,
          source: r.metadata.source,
          quality: r.metadata.quality,
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
   * Mark runs as skipped for assessment
   */
  async skipRuns(runIds: string[]): Promise<void> {
    // Note: Since runs don't have assessment status field,
    // we're using the absence of assessment records to indicate skipped status
    // In the future, we could add metadata to runs or create a separate tracking table
    for (const runId of runIds) {
      // For now, we just log that these runs are being skipped
      // The absence of assessment records will indicate they were skipped
      console.log(`Marking run ${runId} as skipped for assessment`);
    }
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
    // Extract score from output if it's structured
    let outputScore = 0;
    if (typeof run.output === 'object' && run.output.score !== undefined) {
      outputScore = run.output.score;
    }
    
    const datasetRecord: NewEvalDataset = {
      runId: run.id,
      assessmentId: assessment.id,
      input: run.input,
      expectedOutput: run.expectedOutput || JSON.stringify(run.output),
      agentOutput: JSON.stringify(run.output),
      correctedScore: assessment.verdict === 'correct' 
        ? undefined 
        : assessment.correctedScore,
      verdict: assessment.verdict,
      datasetType: 'evaluation',
      metadata: {
        source: options.source || 'assessment',
        quality: options.quality,
        split: options.split || 'train',
        version: options.version,
        reasoning: assessment.reasoning,
        confidence: assessment.confidence,
        agentId: run.agentId,
      },
    };
    
    await this.evalDatasetRepo.create(datasetRecord);
  }
  
  /**
   * Determine the quality of an assessment
   */
  private determineQuality(assessment: Assessment): 'high' | 'medium' | 'low' {
    if (!assessment.confidence) return 'medium';
    if (assessment.confidence >= 0.9) return 'high';
    if (assessment.confidence >= 0.7) return 'medium';
    return 'low';
  }
  
  /**
   * Determine dataset split (train/validation/test)
   */
  private determineSplit(): 'train' | 'validation' | 'test' {
    const rand = Math.random();
    if (rand < 0.7) return 'train';
    if (rand < 0.85) return 'validation';
    return 'test';
  }
  
  /**
   * Generate tags for a dataset record
   */
  private generateTags(run: Run, assessment: Assessment): string[] {
    const tags: string[] = [];
    
    // Add model tag
    tags.push(`model:${run.configModel}`);
    
    // Add verdict tag
    tags.push(`verdict:${assessment.verdict}`);
    
    // Add assessor tag
    tags.push(`assessor:${assessment.assessedBy}`);
    
    // Add content type tag
    if (run.metadata.inputType) {
      tags.push(`type:${run.metadata.inputType}`);
    }
    
    // Add score range tag
    const score = assessment.verdict === 'correct' 
      ? run.outputScore 
      : (assessment.correctedScore || run.outputScore);
    
    if (score >= 0.8) tags.push('high-score');
    else if (score >= 0.5) tags.push('medium-score');
    else tags.push('low-score');
    
    return tags;
  }
}