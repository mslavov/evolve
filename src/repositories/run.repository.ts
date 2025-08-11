// @ts-nocheck
import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { runs, type Run, type NewRun } from '../db/schema/runs.js';
import { Database } from '../db/client.js';

export interface RunFilters {
  assessmentStatus?: 'pending' | 'assessed' | 'skipped';
  model?: string;
  minScore?: number;
  maxScore?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface RunStats {
  totalRuns: number;
  pendingAssessment: number;
  assessed: number;
  skipped: number;
  averageScore: number;
  byModel: Record<string, { count: number; avgScore: number }>;
}

export class RunRepository extends BaseRepository {
  constructor(db: Database) {
    super(db);
  }
  
  /**
   * Create a new run
   */
  async create(data: NewRun): Promise<Run> {
    const [run] = await this.db.insert(runs).values(data).returning();
    return run;
  }
  
  /**
   * Get a run by ID
   */
  async findById(id: string): Promise<Run | null> {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);
    
    return run || null;
  }
  
  /**
   * Find runs with filters
   */
  async findMany(filters?: RunFilters): Promise<Run[]> {
    const conditions = [];
    
    if (filters?.assessmentStatus) {
      conditions.push(eq(runs.assessmentStatus, filters.assessmentStatus));
    }
    
    if (filters?.model) {
      conditions.push(eq(runs.configModel, filters.model));
    }
    
    if (filters?.minScore !== undefined) {
      conditions.push(gte(runs.outputScore, filters.minScore));
    }
    
    if (filters?.maxScore !== undefined) {
      conditions.push(lte(runs.outputScore, filters.maxScore));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(runs.timestamp, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(runs.timestamp, filters.endDate));
    }
    
    let query = this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.timestamp));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    return await query as any;
  }
  
  /**
   * Update a run's assessment status
   */
  async updateAssessmentStatus(
    id: string, 
    status: 'pending' | 'assessed' | 'skipped'
  ): Promise<void> {
    await this.db
      .update(runs)
      .set({ 
        assessmentStatus: status,
        updatedAt: new Date()
      })
      .where(eq(runs.id, id));
  }
  
  /**
   * Get runs pending assessment
   */
  async findPendingAssessment(limit?: number): Promise<Run[]> {
    return this.findMany({
      assessmentStatus: 'pending',
      limit
    });
  }
  
  /**
   * Get statistics about runs
   */
  async getStats(): Promise<RunStats> {
    const statsQuery = await this.db
      .select({
        totalRuns: sql<number>`count(*)`,
        pendingCount: sql<number>`sum(case when ${runs.assessmentStatus} = 'pending' then 1 else 0 end)`,
        assessedCount: sql<number>`sum(case when ${runs.assessmentStatus} = 'assessed' then 1 else 0 end)`,
        skippedCount: sql<number>`sum(case when ${runs.assessmentStatus} = 'skipped' then 1 else 0 end)`,
        avgScore: sql<number>`avg(${runs.outputScore})`,
      })
      .from(runs);
    
    const modelStats = await this.db
      .select({
        model: runs.configModel,
        count: sql<number>`count(*)`,
        avgScore: sql<number>`avg(${runs.outputScore})`,
      })
      .from(runs)
      .groupBy(runs.configModel);
    
    const stats = statsQuery[0];
    const byModel: Record<string, { count: number; avgScore: number }> = {};
    
    for (const modelStat of modelStats) {
      byModel[modelStat.model] = {
        count: modelStat.count,
        avgScore: modelStat.avgScore,
      };
    }
    
    return {
      totalRuns: stats.totalRuns || 0,
      pendingAssessment: stats.pendingCount || 0,
      assessed: stats.assessedCount || 0,
      skipped: stats.skippedCount || 0,
      averageScore: stats.avgScore || 0,
      byModel,
    };
  }
}