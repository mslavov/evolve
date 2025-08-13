import { Database } from '../db/client.js';
import { agents } from '../db/schema/agents.js';
import { eq, and, desc } from 'drizzle-orm';
import type { Agent, NewAgent } from '../db/schema/agents.js';

export interface AgentFilters {
  isActive?: boolean;
  isSystemAgent?: boolean;
  type?: string;
  model?: string;
}

export class AgentRepository {
  constructor(private readonly db: Database) {}
  
  /**
   * Create a new agent
   */
  async create(data: NewAgent): Promise<Agent> {
    const [agent] = await this.db.insert(agents).values(data).returning();
    return agent;
  }
  
  /**
   * Find an agent by ID
   */
  async findById(id: string): Promise<Agent | null> {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);
    return agent || null;
  }
  
  /**
   * Find an agent by key
   */
  async findByKey(key: string): Promise<Agent | null> {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(eq(agents.key, key))
      .limit(1);
    return agent || null;
  }
  
  
  /**
   * Find all agents
   */
  async findAll(): Promise<Agent[]> {
    return await this.db
      .select()
      .from(agents)
      .orderBy(desc(agents.createdAt));
  }
  
  /**
   * Find agents by type
   */
  async findByType(type: string): Promise<Agent[]> {
    return await this.db
      .select()
      .from(agents)
      .where(eq(agents.type, type as any))
      .orderBy(desc(agents.averageScore));
  }
  
  /**
   * Find system agents
   */
  async findSystemAgents(): Promise<Agent[]> {
    return await this.db
      .select()
      .from(agents)
      .where(eq(agents.isSystemAgent, true))
      .orderBy(agents.key);
  }
  
  /**
   * Find active agents
   */
  async findActive(): Promise<Agent[]> {
    return await this.db
      .select()
      .from(agents)
      .where(eq(agents.isActive, true))
      .orderBy(desc(agents.createdAt));
  }
  
  /**
   * Find agents with filters
   */
  async findMany(filters?: AgentFilters): Promise<Agent[]> {
    let query = this.db.select().from(agents);
    
    const conditions = [];
    
    if (filters?.isActive !== undefined) {
      conditions.push(eq(agents.isActive, filters.isActive));
    }
    
    if (filters?.isSystemAgent !== undefined) {
      conditions.push(eq(agents.isSystemAgent, filters.isSystemAgent));
    }
    
    if (filters?.type) {
      conditions.push(eq(agents.type, filters.type as any));
    }
    
    if (filters?.model) {
      conditions.push(eq(agents.model, filters.model));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await (query.orderBy(desc(agents.createdAt)) as any);
  }
  
  /**
   * Update an agent
   */
  async update(id: string, data: Partial<NewAgent>): Promise<Agent> {
    const [updated] = await this.db
      .update(agents)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, id))
      .returning();
    return updated;
  }
  
  
  /**
   * Update performance metrics for an agent
   */
  async updatePerformanceMetrics(
    key: string,
    score: number,
    incrementEvalCount: boolean = true
  ): Promise<void> {
    const agent = await this.findByKey(key);
    if (!agent) return;
    
    const newCount = incrementEvalCount ? (agent.evaluationCount || 0) + 1 : (agent.evaluationCount || 0);
    const currentAvg = agent.averageScore || 0;
    const currentCount = agent.evaluationCount || 0;
    
    // Calculate new average
    const newAverage = incrementEvalCount
      ? (currentAvg * currentCount + score) / newCount
      : score;
    
    await this.db
      .update(agents)
      .set({
        averageScore: newAverage,
        evaluationCount: newCount,
        lastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.key, key));
  }
  
  /**
   * Delete an agent by key
   */
  async deleteByKey(key: string): Promise<void> {
    await this.db.delete(agents).where(eq(agents.key, key));
  }
  
  /**
   * Get agent statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    systemAgents: number;
    userAgents: number;
    averagePerformance: number;
  }> {
    const allAgents = await this.findAll();
    
    const byType: Record<string, number> = {};
    let totalScore = 0;
    let scoredCount = 0;
    
    for (const agent of allAgents) {
      byType[agent.type] = (byType[agent.type] || 0) + 1;
      
      if (agent.averageScore !== null) {
        totalScore += agent.averageScore;
        scoredCount++;
      }
    }
    
    return {
      total: allAgents.length,
      byType,
      systemAgents: allAgents.filter(a => a.isSystemAgent).length,
      userAgents: allAgents.filter(a => !a.isSystemAgent).length,
      averagePerformance: scoredCount > 0 ? totalScore / scoredCount : 0,
    };
  }
  
  /**
   * Find best performing agent by type
   */
  async findBestByType(type: string): Promise<Agent | null> {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(and(
        eq(agents.type, type as any),
        eq(agents.isActive, true)
      ))
      .orderBy(desc(agents.averageScore))
      .limit(1);
    return agent || null;
  }
}