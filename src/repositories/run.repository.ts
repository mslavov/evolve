import { Database } from '../db/client.js';
import { runs, assessments } from '../db/schema/index.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';

export interface RunFilters {
  agentId?: string;
  parentRunId?: string;
  runType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface RunStats {
  totalRuns: number;
  pendingCount: number;
  assessedCount: number;
  byAgent: Record<string, number>;
}

export class RunRepository {
  constructor(private readonly db: Database) {}
  
  /**
   * Create a new run
   */
  async create(data: NewRun): Promise<Run> {
    const result = await this.db.insert(runs).values(data).returning();
    return result[0];
  }
  
  /**
   * Find a run by ID
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
    
    if (filters?.agentId) {
      conditions.push(eq(runs.agentId, filters.agentId));
    }
    
    if (filters?.parentRunId) {
      conditions.push(eq(runs.parentRunId, filters.parentRunId));
    }
    
    if (filters?.runType) {
      conditions.push(eq(runs.runType, filters.runType));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(runs.createdAt, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(runs.createdAt, filters.endDate));
    }
    
    const baseQuery = this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt));
    
    const queryWithWhere = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    const finalQuery = filters?.limit
      ? queryWithWhere.limit(filters.limit)
      : queryWithWhere;
    
    return await finalQuery;
  }
  
  /**
   * Find runs pending assessment (runs without assessments)
   */
  async findPending(limit?: number): Promise<Run[]> {
    const baseQuery = this.db
      .select({
        run: runs,
      })
      .from(runs)
      .leftJoin(assessments, eq(runs.id, assessments.runId))
      .where(isNull(assessments.id))
      .orderBy(desc(runs.createdAt));
    
    const finalQuery = limit
      ? baseQuery.limit(limit)
      : baseQuery;
    
    const results = await finalQuery;
    return results.map(r => r.run);
  }
  
  /**
   * Find all runs
   */
  async findAll(): Promise<Run[]> {
    return await this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt));
  }
  
  /**
   * Find runs by agent
   */
  async findByAgent(agentId: string): Promise<Run[]> {
    return await this.db
      .select()
      .from(runs)
      .where(eq(runs.agentId, agentId))
      .orderBy(desc(runs.createdAt));
  }
  
  /**
   * Find child runs
   */
  async findChildren(parentRunId: string): Promise<Run[]> {
    return await this.db
      .select()
      .from(runs)
      .where(eq(runs.parentRunId, parentRunId))
      .orderBy(runs.iteration);
  }
  
  /**
   * Update a run
   */
  async update(id: string, data: Partial<NewRun>): Promise<Run> {
    const result = await this.db
      .update(runs)
      .set(data)
      .where(eq(runs.id, id))
      .returning();
    return result[0];
  }
  
  /**
   * Delete a run
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(runs).where(eq(runs.id, id));
  }
  
  /**
   * Get run statistics
   */
  async getStats(): Promise<RunStats> {
    // Get total runs
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(runs);
    
    // Get assessed count
    const [{ assessed }] = await this.db
      .select({ assessed: sql<number>`count(distinct ${assessments.runId})` })
      .from(assessments);
    
    // Get runs by agent
    const byAgentResults = await this.db
      .select({
        agentId: runs.agentId,
        count: sql<number>`count(*)`,
      })
      .from(runs)
      .groupBy(runs.agentId);
    
    const byAgent: Record<string, number> = {};
    for (const row of byAgentResults) {
      if (row.agentId) {
        byAgent[row.agentId] = row.count;
      }
    }
    
    return {
      totalRuns: total,
      pendingCount: total - assessed,
      assessedCount: assessed,
      byAgent,
    };
  }
  
  /**
   * Get the latest run for an agent
   */
  async findLatestByAgent(agentId: string): Promise<Run | null> {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(eq(runs.agentId, agentId))
      .orderBy(desc(runs.createdAt))
      .limit(1);
    return run || null;
  }
}