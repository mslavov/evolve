// @ts-nocheck
import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { assessments, type Assessment, type NewAssessment } from '../db/schema/assessments.js';
import { Database } from '../db/client.js';

export interface AssessmentFilters {
  runId?: string;
  verdict?: 'correct' | 'incorrect';
  assessedBy?: 'human' | 'llm' | 'consensus';
  assessorId?: string;
  minConfidence?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface AssessmentStats {
  totalAssessments: number;
  correctCount: number;
  incorrectCount: number;
  accuracyRate: number;
  averageCorrection: number;
  byAssessor: Record<string, {
    count: number;
    accuracyRate: number;
  }>;
}

export class AssessmentRepository extends BaseRepository {
  constructor(db: Database) {
    super(db);
  }
  
  /**
   * Create a new assessment
   */
  async create(data: NewAssessment): Promise<Assessment> {
    const [assessment] = await this.db
      .insert(assessments)
      .values(data)
      .returning();
    
    return assessment;
  }
  
  /**
   * Find assessments with filters
   */
  async findMany(filters?: AssessmentFilters): Promise<Assessment[]> {
    let query = this.db.select().from(assessments);
    
    const conditions = [];
    
    if (filters?.runId) {
      conditions.push(eq(assessments.runId, filters.runId));
    }
    
    if (filters?.verdict) {
      conditions.push(eq(assessments.verdict, filters.verdict));
    }
    
    if (filters?.assessedBy) {
      conditions.push(eq(assessments.assessedBy, filters.assessedBy));
    }
    
    if (filters?.assessorId) {
      conditions.push(eq(assessments.assessorId, filters.assessorId));
    }
    
    if (filters?.minConfidence !== undefined) {
      conditions.push(gte(assessments.confidence, filters.minConfidence));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(assessments.timestamp, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(assessments.timestamp, filters.endDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(assessments.timestamp));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    return await query;
  }
  
  /**
   * Get assessments for a specific run
   */
  async findByRunId(runId: string): Promise<Assessment[]> {
    return this.findMany({ runId });
  }
  
  /**
   * Get statistics about assessments
   */
  async getStats(): Promise<AssessmentStats> {
    const statsQuery = await this.db
      .select({
        totalAssessments: sql<number>`count(*)`,
        correctCount: sql<number>`sum(case when ${assessments.verdict} = 'correct' then 1 else 0 end)`,
        incorrectCount: sql<number>`sum(case when ${assessments.verdict} = 'incorrect' then 1 else 0 end)`,
        avgCorrection: sql<number>`avg(case when ${assessments.verdict} = 'incorrect' and ${assessments.correctedScore} is not null then abs(${assessments.correctedScore} - 0.5) else null end)`,
      })
      .from(assessments);
    
    const assessorStats = await this.db
      .select({
        assessorId: assessments.assessorId,
        assessedBy: assessments.assessedBy,
        count: sql<number>`count(*)`,
        correctCount: sql<number>`sum(case when ${assessments.verdict} = 'correct' then 1 else 0 end)`,
      })
      .from(assessments)
      .groupBy(assessments.assessorId, assessments.assessedBy);
    
    const stats = statsQuery[0];
    const byAssessor: Record<string, { count: number; accuracyRate: number }> = {};
    
    for (const assessorStat of assessorStats) {
      const key = assessorStat.assessorId || assessorStat.assessedBy;
      byAssessor[key] = {
        count: assessorStat.count,
        accuracyRate: assessorStat.count > 0 
          ? assessorStat.correctCount / assessorStat.count 
          : 0,
      };
    }
    
    const total = stats.totalAssessments || 0;
    
    return {
      totalAssessments: total,
      correctCount: stats.correctCount || 0,
      incorrectCount: stats.incorrectCount || 0,
      accuracyRate: total > 0 ? (stats.correctCount || 0) / total : 0,
      averageCorrection: stats.avgCorrection || 0,
      byAssessor,
    };
  }
  
  /**
   * Delete assessments by IDs
   */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    await this.db
      .delete(assessments)
      .where(inArray(assessments.id, ids));
  }
  
  /**
   * Update an assessment
   */
  async update(id: string, data: Partial<NewAssessment>): Promise<Assessment | null> {
    const [updated] = await this.db
      .update(assessments)
      .set(data)
      .where(eq(assessments.id, id))
      .returning();
    
    return updated || null;
  }
  
  /**
   * Check if a run has been assessed
   */
  async hasRunBeenAssessed(runId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assessments)
      .where(eq(assessments.runId, runId));
    
    return result.count > 0;
  }
}