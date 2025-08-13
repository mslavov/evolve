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

    const baseQuery = this.db
      .select()
      .from(assessments);
    
    const queryWithWhere = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    const queryWithOrder = queryWithWhere.orderBy(desc(assessments.timestamp));
    
    const finalQuery = filters?.limit
      ? queryWithOrder.limit(filters.limit)
      : queryWithOrder;

    return await finalQuery;
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

  /**
   * Batch fetch assessments for multiple runs
   * Returns a Map for efficient lookup
   */
  async findByRunIds(runIds: string[]): Promise<Map<string, Assessment[]>> {
    if (runIds.length === 0) {
      return new Map();
    }

    const results = await this.db
      .select()
      .from(assessments)
      .where(inArray(assessments.runId, runIds))
      .orderBy(desc(assessments.timestamp));

    // Group assessments by runId
    const assessmentsByRun = new Map<string, Assessment[]>();
    for (const assessment of results) {
      const runAssessments = assessmentsByRun.get(assessment.runId) || [];
      runAssessments.push(assessment);
      assessmentsByRun.set(assessment.runId, runAssessments);
    }

    return assessmentsByRun;
  }

  /**
   * Get assessments with pagination support
   */
  async findPaginated(options: {
    filters?: AssessmentFilters;
    cursor?: string;
    limit?: number;
  }): Promise<{
    data: Assessment[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const limit = options.limit || 20;
    const conditions = [];

    // Apply filters
    if (options.filters?.runId) {
      conditions.push(eq(assessments.runId, options.filters.runId));
    }
    if (options.filters?.verdict) {
      conditions.push(eq(assessments.verdict, options.filters.verdict));
    }
    if (options.filters?.minConfidence !== undefined) {
      conditions.push(gte(assessments.confidence, options.filters.minConfidence));
    }

    // Apply cursor for pagination
    if (options.cursor) {
      conditions.push(lte(assessments.id, options.cursor));
    }

    const query = this.db
      .select()
      .from(assessments)
      .orderBy(desc(assessments.id))
      .limit(limit + 1); // Fetch one extra to check if there's more

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const results = await query;
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, -1) : results;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    return { data, nextCursor, hasMore };
  }
}