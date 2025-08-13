import { eq, desc, and, sql, inArray, gte } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { prompts, type Prompt, type NewPrompt } from '../db/schema/prompts.js';
import { Database } from '../db/client.js';

export interface PromptFilters {
  isActive?: boolean;
  isTested?: boolean;
  isProduction?: boolean;
  createdBy?: 'human' | 'ai';
  parentVersion?: string;
  tags?: string[];
  limit?: number;
}

export interface PromptStats {
  totalPrompts: number;
  humanCreated: number;
  aiGenerated: number;
  tested: number;
  production: number;
  averageMae: number;
  bestPrompt: {
    version: string;
    mae: number;
  } | null;
}

export class PromptRepository extends BaseRepository {
  constructor(db: Database) {
    super(db);
  }
  
  /**
   * Create a new prompt
   */
  async create(data: NewPrompt): Promise<Prompt> {
    const [prompt] = await this.db
      .insert(prompts)
      .values(data)
      .returning();
    
    return prompt;
  }
  
  /**
   * Find a prompt by version
   */
  async findByVersion(version: string): Promise<Prompt | null> {
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(eq(prompts.version, version))
      .limit(1);
    
    return prompt || null;
  }
  
  /**
   * Find the best performing prompt
   */
  async findBest(): Promise<Prompt | null> {
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(and(
        eq(prompts.isActive, true),
        eq(prompts.isTested, true),
        sql`${prompts.mae} is not null`
      ))
      .orderBy(prompts.mae)
      .limit(1);
    
    return prompt || null;
  }
  
  /**
   * Find prompts with filters
   */
  async findMany(filters?: PromptFilters): Promise<Prompt[]> {
    const conditions = [];
    
    if (filters?.isActive !== undefined) {
      conditions.push(eq(prompts.isActive, filters.isActive));
    }
    
    if (filters?.isTested !== undefined) {
      conditions.push(eq(prompts.isTested, filters.isTested));
    }
    
    if (filters?.isProduction !== undefined) {
      conditions.push(eq(prompts.isProduction, filters.isProduction));
    }
    
    if (filters?.createdBy) {
      conditions.push(eq(prompts.createdBy, filters.createdBy));
    }
    
    if (filters?.parentVersion) {
      conditions.push(eq(prompts.parentVersion, filters.parentVersion));
    }
    
    const baseQuery = this.db.select().from(prompts);
    
    const queryWithWhere = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    const queryWithOrder = queryWithWhere.orderBy(desc(prompts.createdAt));
    
    const finalQuery = filters?.limit
      ? queryWithOrder.limit(filters.limit)
      : queryWithOrder;
    
    let results = await finalQuery;
    
    // Filter by tags in memory if specified
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter(prompt => {
        if (!prompt.tags) return false;
        return filters.tags!.some(tag => prompt.tags?.includes(tag));
      });
    }
    
    return results;
  }
  
  /**
   * Update performance metrics
   */
  async updatePerformance(
    version: string,
    metrics: {
      mae?: number;
      correlation?: number;
      rmse?: number;
      incrementEvalCount?: boolean;
    }
  ): Promise<void> {
    const prompt = await this.findByVersion(version);
    if (!prompt) return;
    
    const updateData: any = {
      isTested: true,
      testedAt: new Date(),
      updatedAt: new Date(),
    };
    
    if (metrics.mae !== undefined) updateData.mae = metrics.mae;
    if (metrics.correlation !== undefined) updateData.correlation = metrics.correlation;
    if (metrics.rmse !== undefined) updateData.rmse = metrics.rmse;
    
    if (metrics.incrementEvalCount) {
      updateData.evaluationCount = (prompt.evaluationCount || 0) + 1;
    }
    
    updateData.lastEvaluatedAt = new Date();
    
    await this.db
      .update(prompts)
      .set(updateData)
      .where(eq(prompts.version, version));
  }
  
  /**
   * Create a variation of an existing prompt
   */
  async createVariation(
    parentVersion: string,
    data: Omit<NewPrompt, 'parentVersion'>
  ): Promise<Prompt> {
    const variationData: NewPrompt = {
      ...data,
      parentVersion,
      createdBy: 'ai',
    };
    
    return this.create(variationData);
  }
  
  /**
   * Mark a prompt as production-ready
   */
  async setProduction(version: string, isProduction: boolean = true): Promise<void> {
    // If setting as production, clear other production flags
    if (isProduction) {
      await this.db
        .update(prompts)
        .set({ 
          isProduction: false,
          updatedAt: new Date(),
        })
        .where(eq(prompts.isProduction, true));
    }
    
    await this.db
      .update(prompts)
      .set({ 
        isProduction,
        updatedAt: new Date(),
      })
      .where(eq(prompts.version, version));
  }
  
  /**
   * Get statistics about prompts
   */
  async getStats(): Promise<PromptStats> {
    const statsQuery = await this.db
      .select({
        totalPrompts: sql<number>`count(*)`,
        humanCount: sql<number>`sum(case when ${prompts.createdBy} = 'human' then 1 else 0 end)`,
        aiCount: sql<number>`sum(case when ${prompts.createdBy} = 'ai' then 1 else 0 end)`,
        testedCount: sql<number>`sum(case when ${prompts.isTested} = 1 then 1 else 0 end)`,
        productionCount: sql<number>`sum(case when ${prompts.isProduction} = 1 then 1 else 0 end)`,
        avgMae: sql<number>`avg(${prompts.mae})`,
      })
      .from(prompts);
    
    const bestPrompt = await this.findBest();
    
    const stats = statsQuery[0];
    
    return {
      totalPrompts: stats.totalPrompts || 0,
      humanCreated: stats.humanCount || 0,
      aiGenerated: stats.aiCount || 0,
      tested: stats.testedCount || 0,
      production: stats.productionCount || 0,
      averageMae: stats.avgMae || 0,
      bestPrompt: bestPrompt ? {
        version: bestPrompt.version,
        mae: bestPrompt.mae || 0,
      } : null,
    };
  }
  
  /**
   * Get all active prompt versions
   */
  async getAllVersions(): Promise<string[]> {
    const results = await this.db
      .select({ version: prompts.version })
      .from(prompts)
      .where(eq(prompts.isActive, true))
      .orderBy(desc(prompts.createdAt));
    
    return results.map(r => r.version);
  }
  
  /**
   * Delete a prompt by version
   */
  async deleteByVersion(version: string): Promise<void> {
    await this.db
      .delete(prompts)
      .where(eq(prompts.version, version));
  }
}