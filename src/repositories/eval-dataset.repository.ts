import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { evalDatasets, type EvalDataset, type NewEvalDataset } from '../db/schema/eval-datasets.js';
import { Database } from '../db/client.js';

export interface DatasetFilters {
  source?: 'assessment' | 'human' | 'consensus' | 'synthetic';
  split?: 'train' | 'validation' | 'test';
  version?: string;
  tags?: string[];
  quality?: 'high' | 'medium' | 'low';
  minScore?: number;
  maxScore?: number;
  limit?: number;
}

export interface DatasetStats {
  totalRecords: number;
  bySplit: Record<string, number>;
  bySource: Record<string, number>;
  byQuality: Record<string, number>;
  averageScore: number;
  versions: string[];
}

export class EvalDatasetRepository extends BaseRepository {
  constructor(db: Database) {
    super(db);
  }
  
  /**
   * Create a new eval dataset record
   */
  async create(data: NewEvalDataset): Promise<EvalDataset> {
    const [record] = await this.db
      .insert(evalDatasets)
      .values(data)
      .returning();
    
    return record;
  }
  
  /**
   * Find eval dataset records with filters
   */
  async findMany(filters?: DatasetFilters): Promise<EvalDataset[]> {
    const conditions = [];
    
    // Exclude soft-deleted records by default
    conditions.push(sql`${evalDatasets.deletedAt} IS NULL`);
    
    // Note: source, split, version, quality are stored in metadata JSON
    // SQL filters on JSON fields are limited in SQLite
    // We'll do post-query filtering for these
    
    if (filters?.minScore !== undefined) {
      conditions.push(gte(evalDatasets.correctedScore, filters.minScore));
    }
    
    if (filters?.maxScore !== undefined) {
      conditions.push(lte(evalDatasets.correctedScore, filters.maxScore));
    }
    
    const baseQuery = this.db.select().from(evalDatasets);
    
    const queryWithWhere = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    const queryWithOrder = queryWithWhere.orderBy(desc(evalDatasets.createdAt));
    
    const finalQuery = filters?.limit
      ? queryWithOrder.limit(filters.limit)
      : queryWithOrder;
    
    let results = await finalQuery;
    
    // Filter by metadata fields in memory if specified
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter(record => {
        const tags = record.metadata?.tags as string[] | undefined;
        if (!tags) return false;
        return filters.tags!.some(tag => tags.includes(tag));
      });
    }
    
    if (filters?.source) {
      results = results.filter(record => record.metadata?.source === filters.source);
    }
    
    if (filters?.split) {
      results = results.filter(record => record.metadata?.split === filters.split);
    }
    
    if (filters?.version) {
      results = results.filter(record => record.datasetVersion === filters.version);
    }
    
    if (filters?.quality) {
      results = results.filter(record => record.metadata?.quality === filters.quality);
    }
    
    return results;
  }
  
  /**
   * Export dataset for training/evaluation
   */
  async exportDataset(filters?: DatasetFilters): Promise<{
    records: EvalDataset[];
    metadata: {
      count: number;
      version?: string;
      exportedAt: Date;
    };
  }> {
    const records = await this.findMany(filters);
    
    return {
      records,
      metadata: {
        count: records.length,
        version: filters?.version,
        exportedAt: new Date(),
      },
    };
  }
  
  /**
   * Get statistics about the dataset
   */
  async getStats(): Promise<DatasetStats> {
    const statsQuery = await this.db
      .select({
        totalRecords: sql<number>`count(*)`,
        avgScore: sql<number>`avg(${evalDatasets.correctedScore})`,
      })
      .from(evalDatasets);
    
    // Since metadata fields are in JSON, we need to extract them
    // SQLite JSON functions are limited, so we'll get all records and process in memory
    const allRecords = await this.db.select().from(evalDatasets);
    
    const splitStats = new Map<string, number>();
    const sourceStats = new Map<string, number>();
    const qualityStats = new Map<string, number>();
    const versionsSet = new Set<string>();
    
    for (const record of allRecords) {
      const split = record.metadata?.split as string;
      const source = record.metadata?.source as string;
      const quality = record.metadata?.quality as string;
      const version = record.metadata?.version as string;
      
      if (split) {
        splitStats.set(split, (splitStats.get(split) || 0) + 1);
      }
      if (source) {
        sourceStats.set(source, (sourceStats.get(source) || 0) + 1);
      }
      if (quality) {
        qualityStats.set(quality, (qualityStats.get(quality) || 0) + 1);
      }
      if (version) {
        versionsSet.add(version);
      }
    }
    
    const stats = statsQuery[0];
    
    const bySplit: Record<string, number> = Object.fromEntries(splitStats);
    const bySource: Record<string, number> = Object.fromEntries(sourceStats);
    const byQuality: Record<string, number> = Object.fromEntries(qualityStats);
    const versions = Array.from(versionsSet);
    
    return {
      totalRecords: stats.totalRecords || 0,
      bySplit,
      bySource,
      byQuality,
      averageScore: stats.avgScore || 0,
      versions,
    };
  }
  
  /**
   * Clear dataset by filters (soft delete)
   */
  async clearDataset(filters?: DatasetFilters): Promise<number> {
    const toDelete = await this.findMany(filters);
    
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id);
      // Soft delete by setting deletedAt timestamp
      await this.db
        .update(evalDatasets)
        .set({ 
          deletedAt: new Date(),
          archived: true,
          updatedAt: new Date()
        })
        .where(inArray(evalDatasets.id, ids));
    }
    
    return toDelete.length;
  }

  /**
   * Find dataset records with pagination
   */
  async findPaginated(options: {
    filters?: DatasetFilters;
    cursor?: string;
    limit?: number;
  }): Promise<{
    data: EvalDataset[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const limit = options.limit || 50;
    const conditions = [];
    
    // Exclude soft-deleted records by default
    conditions.push(sql`${evalDatasets.deletedAt} IS NULL`);
    
    // Apply filters
    if (options.filters?.minScore !== undefined) {
      conditions.push(gte(evalDatasets.correctedScore, options.filters.minScore));
    }
    if (options.filters?.maxScore !== undefined) {
      conditions.push(lte(evalDatasets.correctedScore, options.filters.maxScore));
    }
    
    // Apply cursor for pagination
    if (options.cursor) {
      conditions.push(lte(evalDatasets.id, options.cursor));
    }
    
    const query = this.db
      .select()
      .from(evalDatasets)
      .orderBy(desc(evalDatasets.id))
      .limit(limit + 1); // Fetch one extra to check if there's more
    
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }
    
    let results = await query;
    
    // Apply metadata filters in memory
    if (options.filters?.source) {
      results = results.filter(r => r.metadata?.source === options.filters?.source);
    }
    if (options.filters?.split) {
      results = results.filter(r => r.metadata?.split === options.filters?.split);
    }
    if (options.filters?.version) {
      results = results.filter(r => r.datasetVersion === options.filters?.version);
    }
    if (options.filters?.quality) {
      results = results.filter(r => r.metadata?.quality === options.filters?.quality);
    }
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, -1) : results;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;
    
    return { data, nextCursor, hasMore };
  }

  /**
   * Create or update a dataset record (upsert)
   */
  async upsert(data: NewEvalDataset): Promise<EvalDataset> {
    // Check if record exists
    const existing = await this.db
      .select()
      .from(evalDatasets)
      .where(
        and(
          eq(evalDatasets.runId, data.runId),
          eq(evalDatasets.assessmentId, data.assessmentId),
          data.datasetVersion 
            ? eq(evalDatasets.datasetVersion, data.datasetVersion)
            : sql`${evalDatasets.datasetVersion} IS NULL`
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing record
      const [updated] = await this.db
        .update(evalDatasets)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(evalDatasets.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Create new record
      return this.create(data);
    }
  }

  /**
   * Permanently delete soft-deleted records older than specified days
   */
  async purgeSoftDeleted(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const toDelete = await this.db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(
        and(
          lte(evalDatasets.deletedAt, cutoffDate),
          eq(evalDatasets.archived, true)
        )
      );
    
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id);
      await this.db
        .delete(evalDatasets)
        .where(inArray(evalDatasets.id, ids));
    }
    
    return toDelete.length;
  }
}