// @ts-nocheck
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
    let query = this.db.select().from(evalDatasets);
    
    const conditions = [];
    
    if (filters?.source) {
      conditions.push(eq(evalDatasets.groundTruthSource, filters.source));
    }
    
    if (filters?.split) {
      conditions.push(eq(evalDatasets.datasetSplit, filters.split));
    }
    
    if (filters?.version) {
      conditions.push(eq(evalDatasets.datasetVersion, filters.version));
    }
    
    if (filters?.quality) {
      conditions.push(eq(evalDatasets.datasetQuality, filters.quality));
    }
    
    if (filters?.minScore !== undefined) {
      conditions.push(gte(evalDatasets.groundTruthScore, filters.minScore));
    }
    
    if (filters?.maxScore !== undefined) {
      conditions.push(lte(evalDatasets.groundTruthScore, filters.maxScore));
    }
    
    // Note: Tags filtering would require JSON operations
    // For now, we'll filter in memory after the query
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(evalDatasets.addedAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    let results = await query;
    
    // Filter by tags in memory if specified
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter(record => {
        if (!record.datasetTags) return false;
        return filters.tags!.some(tag => record.datasetTags?.includes(tag));
      });
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
        avgScore: sql<number>`avg(${evalDatasets.groundTruthScore})`,
      })
      .from(evalDatasets);
    
    const splitStats = await this.db
      .select({
        split: evalDatasets.datasetSplit,
        count: sql<number>`count(*)`,
      })
      .from(evalDatasets)
      .groupBy(evalDatasets.datasetSplit);
    
    const sourceStats = await this.db
      .select({
        source: evalDatasets.groundTruthSource,
        count: sql<number>`count(*)`,
      })
      .from(evalDatasets)
      .groupBy(evalDatasets.groundTruthSource);
    
    const qualityStats = await this.db
      .select({
        quality: evalDatasets.datasetQuality,
        count: sql<number>`count(*)`,
      })
      .from(evalDatasets)
      .groupBy(evalDatasets.datasetQuality);
    
    const versions = await this.db
      .selectDistinct({ version: evalDatasets.datasetVersion })
      .from(evalDatasets)
      .where(sql`${evalDatasets.datasetVersion} is not null`);
    
    const stats = statsQuery[0];
    
    const bySplit: Record<string, number> = {};
    for (const stat of splitStats) {
      if (stat.split) bySplit[stat.split] = stat.count;
    }
    
    const bySource: Record<string, number> = {};
    for (const stat of sourceStats) {
      bySource[stat.source] = stat.count;
    }
    
    const byQuality: Record<string, number> = {};
    for (const stat of qualityStats) {
      if (stat.quality) byQuality[stat.quality] = stat.count;
    }
    
    return {
      totalRecords: stats.totalRecords || 0,
      bySplit,
      bySource,
      byQuality,
      averageScore: stats.avgScore || 0,
      versions: versions.map(v => v.version!).filter(Boolean),
    };
  }
  
  /**
   * Clear dataset by filters
   */
  async clearDataset(filters?: DatasetFilters): Promise<number> {
    const toDelete = await this.findMany(filters);
    
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id);
      await this.db
        .delete(evalDatasets)
        .where(inArray(evalDatasets.id, ids));
    }
    
    return toDelete.length;
  }
}