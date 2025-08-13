// @ts-nocheck
import { eq, desc, and, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { configs, type Config, type NewConfig } from '../db/schema/configs.js';
import { Database } from '../db/client.js';

export interface ConfigFilters {
  isActive?: boolean;
  isDefault?: boolean;
  model?: string;
  promptId?: string;
}

export class ConfigRepository extends BaseRepository {
  constructor(db: Database) {
    super(db);
  }
  
  /**
   * Create a new configuration
   */
  async create(data: NewConfig): Promise<Config> {
    // Ensure only one default config
    if (data.isDefault) {
      await this.clearDefault();
    }
    
    const [config] = await this.db
      .insert(configs)
      .values(data)
      .returning();
    
    return config;
  }
  
  /**
   * Get a configuration by key
   */
  async findByKey(key: string): Promise<Config | null> {
    const [config] = await this.db
      .select()
      .from(configs)
      .where(eq(configs.key, key))
      .limit(1);
    
    return config || null;
  }
  
  /**
   * Get the default configuration
   */
  async findDefault(): Promise<Config | null> {
    const [config] = await this.db
      .select()
      .from(configs)
      .where(eq(configs.isDefault, true))
      .limit(1);
    
    return config || null;
  }
  
  /**
   * Find configurations with filters
   */
  async findMany(filters?: ConfigFilters): Promise<Config[]> {
    let query = this.db.select().from(configs);
    
    const conditions = [];
    
    if (filters?.isActive !== undefined) {
      conditions.push(eq(configs.isActive, filters.isActive));
    }
    
    if (filters?.isDefault !== undefined) {
      conditions.push(eq(configs.isDefault, filters.isDefault));
    }
    
    if (filters?.model) {
      conditions.push(eq(configs.model, filters.model));
    }
    
    if (filters?.promptId) {
      conditions.push(eq(configs.promptId, filters.promptId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(configs.createdAt));
    
    return await query;
  }
  
  /**
   * Update a configuration by key
   */
  async updateByKey(key: string, data: Partial<NewConfig>): Promise<Config | null> {
    // Ensure only one default config
    if (data.isDefault) {
      await this.clearDefault();
    }
    
    const [updated] = await this.db
      .update(configs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(configs.key, key))
      .returning();
    
    return updated || null;
  }
  
  /**
   * Set a configuration as default
   */
  async setDefault(key: string): Promise<void> {
    await this.clearDefault();
    
    await this.db
      .update(configs)
      .set({ 
        isDefault: true,
        updatedAt: new Date(),
      })
      .where(eq(configs.key, key));
  }
  
  /**
   * Clear the default flag from all configs
   */
  async clearDefault(): Promise<void> {
    await this.db
      .update(configs)
      .set({ 
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(eq(configs.isDefault, true));
  }
  
  /**
   * Delete a configuration by key
   */
  async deleteByKey(key: string): Promise<void> {
    await this.db
      .delete(configs)
      .where(eq(configs.key, key));
  }
  
  /**
   * Update a configuration by ID
   */
  async update(id: string, data: Partial<NewConfig>): Promise<Config> {
    // Ensure only one default config
    if (data.isDefault) {
      await this.clearDefault();
    }
    
    const [updated] = await this.db
      .update(configs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(configs.id, id))
      .returning();
    
    return updated;
  }
  
  /**
   * Get all configurations
   */
  async findAll(): Promise<Config[]> {
    return await this.findMany();
  }
  
  /**
   * Update performance metrics for a configuration
   */
  async updatePerformanceMetrics(
    key: string,
    averageScore: number,
    incrementEvalCount: boolean = true
  ): Promise<void> {
    const config = await this.findByKey(key);
    if (!config) return;
    
    const newEvalCount = incrementEvalCount 
      ? (config.evaluationCount || 0) + 1 
      : config.evaluationCount;
    
    await this.db
      .update(configs)
      .set({
        averageScore,
        evaluationCount: newEvalCount,
        lastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(configs.key, key));
  }
  
  /**
   * Update output schema for a configuration
   */
  async updateOutputSchema(
    key: string,
    outputSchema: Record<string, any>,
    schemaVersion?: string
  ): Promise<Config | null> {
    const [updated] = await this.db
      .update(configs)
      .set({
        outputSchema,
        schemaVersion,
        updatedAt: new Date(),
      })
      .where(eq(configs.key, key))
      .returning();
    
    return updated || null;
  }
  
  /**
   * Update output type for a configuration
   */
  async updateOutputType(
    key: string,
    outputType: 'structured' | 'text'
  ): Promise<Config | null> {
    const [updated] = await this.db
      .update(configs)
      .set({
        outputType,
        updatedAt: new Date(),
      })
      .where(eq(configs.key, key))
      .returning();
    
    return updated || null;
  }
  
  /**
   * Find configurations by schema version
   */
  async findBySchemaVersion(schemaVersion: string): Promise<Config[]> {
    return await this.db
      .select()
      .from(configs)
      .where(eq(configs.schemaVersion, schemaVersion))
      .orderBy(desc(configs.createdAt));
  }
  
  /**
   * Clone a configuration with a new key
   */
  async clone(sourceKey: string, targetKey: string, overrides?: Partial<NewConfig>): Promise<Config> {
    const source = await this.findByKey(sourceKey);
    if (!source) {
      throw new Error(`Source configuration ${sourceKey} not found`);
    }
    
    const { id, key, createdAt, updatedAt, ...configData } = source;
    
    const [cloned] = await this.db
      .insert(configs)
      .values({
        ...configData,
        ...overrides,
        key: targetKey,
        isDefault: false, // Never clone as default
      })
      .returning();
    
    return cloned;
  }
}