import { Database } from '../db/client.js';
import { RunRepository } from '../repositories/run.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { PromptService } from './prompt.service.js';
import { providerFactory, type LLMMessage } from '../providers/index.js';
import type { Agent, NewAgent } from '../db/schema/agents.js';
import type { Run, NewRun } from '../db/schema/runs.js';
import type { AgentVersion, NewAgentVersion } from '../db/schema/agent-versions.js';
import { agentVersions } from '../db/schema/agent-versions.js';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';

export interface RunOptions {
  agentKey?: string; // Agent to use
  parentRunId?: string; // For tracking agent chains
}

export interface RunResult {
  output: any;
  metadata?: Record<string, any>;
  runId?: string;
}

export class AgentService {
  private db: Database;
  private runRepo: RunRepository;
  private agentRepo: AgentRepository;
  private promptService: PromptService;
  
  constructor(db: Database) {
    this.db = db;
    this.runRepo = new RunRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.promptService = new PromptService(db);
  }
  
  /**
   * Run the agent with given input
   */
  async run(
    input: string | Record<string, any>,
    options?: RunOptions
  ): Promise<RunResult> {
    // Agent key is now required
    const agentKey = options?.agentKey;
    if (!agentKey) {
      throw new Error('Agent key is required. Please specify an agent using --agent <key>');
    }
    
    // Load the specified agent
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent '${agentKey}' not found. Use 'pnpm cli agent list' to see available agents`);
    }
    
    const currentPrompt = await this.promptService.getPrompt(agent.promptId);
    const provider = providerFactory.createProvider(agent.model);
    
    if (!provider || !currentPrompt) {
      throw new Error(`Failed to initialize agent '${agentKey}'`);
    }
    
    // Apply prompt template with dictionary-based replacement
    let promptText = currentPrompt.template;
    
    if (typeof input === 'object' && input !== null) {
      // Replace individual keys from the input object
      for (const [key, value] of Object.entries(input)) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        promptText = promptText.replace(placeholder, valueStr);
      }
      
      // Also replace {{input}} with the full JSON for backwards compatibility
      const fullInputStr = JSON.stringify(input, null, 2);
      promptText = promptText.replace(/\{\{input\}\}/g, fullInputStr);
    } else {
      // String input - keep current behavior
      const inputStr = typeof input === 'string' ? input : String(input);
      promptText = promptText.replace(/\{\{input\}\}/g, inputStr);
    }
    
    // Build messages for LLM
    const messages: LLMMessage[] = [{
      role: 'user',
      content: promptText,
    }];
    
    // Run the LLM
    const startTime = Date.now();
    let result: any;
    let parsedOutput: any;
    
    if (agent.outputType === 'structured' && agent.outputSchema) {
      // Check if provider has generateStructured method
      if ('generateStructured' in provider && typeof provider.generateStructured === 'function') {
        try {
          // Simple JSON Schema to Zod converter for common cases
          const createZodSchema = (jsonSchema: any): z.ZodType<any> => {
            if (jsonSchema.type === 'object' && jsonSchema.properties) {
              const shape: Record<string, z.ZodType<any>> = {};
              for (const [key, value] of Object.entries(jsonSchema.properties as any)) {
                const prop = createZodSchema(value);
                shape[key] = jsonSchema.required?.includes(key) ? prop : prop.optional();
              }
              return z.object(shape);
            } else if (jsonSchema.type === 'string') {
              return z.string();
            } else if (jsonSchema.type === 'number' || jsonSchema.type === 'integer') {
              return z.number();
            } else if (jsonSchema.type === 'boolean') {
              return z.boolean();
            } else if (jsonSchema.type === 'array' && jsonSchema.items) {
              return z.array(createZodSchema(jsonSchema.items));
            } else {
              return z.any();
            }
          };
          
          const zodSchema = createZodSchema(agent.outputSchema);
          
          result = await provider.generateStructured(
            messages,
            zodSchema,
            {
              temperature: agent.temperature,
              maxTokens: agent.maxTokens || undefined,
            }
          );
          parsedOutput = result.content;
        } catch (error) {
          console.warn('Structured output with provider failed, falling back to text generation:', error);
          // Set result to null to trigger fallback
          result = null;
        }
      }
      
      // Fallback to text generation with schema instruction if structured output not available
      if (!result) {
        messages.unshift({
          role: 'system',
          content: `You must respond with valid JSON that matches this schema:\n${JSON.stringify(agent.outputSchema, null, 2)}\n\nDo not include any text before or after the JSON.`,
        });
        
        result = await provider.generateText(messages, {
          temperature: agent.temperature,
          maxTokens: agent.maxTokens || undefined,
        });
        
        // Try to parse JSON from text output
        try {
          const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/) || 
                           result.content.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? 
            (jsonMatch[1] || jsonMatch[0]) : 
            result.content;
          
          parsedOutput = JSON.parse(jsonStr);
          
          // Validate against schema using Zod
          const createZodSchema = (jsonSchema: any): z.ZodType<any> => {
            if (jsonSchema.type === 'object' && jsonSchema.properties) {
              const shape: Record<string, z.ZodType<any>> = {};
              for (const [key, value] of Object.entries(jsonSchema.properties as any)) {
                const prop = createZodSchema(value);
                shape[key] = jsonSchema.required?.includes(key) ? prop : prop.optional();
              }
              return z.object(shape);
            } else if (jsonSchema.type === 'string') {
              return z.string();
            } else if (jsonSchema.type === 'number' || jsonSchema.type === 'integer') {
              return z.number();
            } else if (jsonSchema.type === 'boolean') {
              return z.boolean();
            } else if (jsonSchema.type === 'array' && jsonSchema.items) {
              return z.array(createZodSchema(jsonSchema.items));
            } else {
              return z.any();
            }
          };
          
          const zodSchema = createZodSchema(agent.outputSchema);
          parsedOutput = zodSchema.parse(parsedOutput);
        } catch (error) {
          console.warn('Failed to parse or validate structured output:', error);
          parsedOutput = result.content;
        }
      }
    } else {
      // Regular text generation
      result = await provider.generateText(messages, {
        temperature: agent.temperature,
        maxTokens: agent.maxTokens || undefined,
      });
      parsedOutput = result.content;
    }
    
    const executionTime = Date.now() - startTime;
    
    // Save the run
    const runData: NewRun = {
      agentId: agent.id,
      parentRunId: options?.parentRunId,
      input: typeof input === 'string' ? input : JSON.stringify(input, null, 2),
      output: typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput),
      rawOutput: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      configSnapshot: {
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        promptVersion: currentPrompt.version,
      },
      executionTimeMs: executionTime,
      tokenCount: result.usage?.totalTokens,
      modelUsed: agent.model,
      temperatureUsed: agent.temperature,
      metadata: {
        provider: provider.name,
      },
    };
    
    const run = await this.runRepo.create(runData);
    
    return {
      output: parsedOutput,
      metadata: {
        runId: run.id,
        executionTime,
        tokenCount: result.usage?.totalTokens,
      },
      runId: run.id,
    };
  }
  
  /**
   * Create or update an agent
   */
  async saveAgent(key: string, agent: Omit<NewAgent, 'key'>): Promise<Agent> {
    const existing = await this.agentRepo.findByKey(key);
    
    if (existing) {
      // Update existing agent
      return await this.agentRepo.update(existing.id, agent);
    }
    
    return await this.agentRepo.create({
      ...agent,
      key,
    });
  }
  
  /**
   * Create an agent with a prompt
   */
  async createAgent(
    key: string,
    name: string,
    promptTemplate: string,
    options?: {
      type?: Agent['type'];
      model?: string;
      temperature?: number;
      maxTokens?: number;
      outputType?: 'structured' | 'text';
      outputSchema?: Record<string, any>;
      description?: string;
      isDefault?: boolean;
    }
  ): Promise<Agent> {
    // Create a prompt for this agent
    const promptVersion = `${key}_prompt_v1`;
    const prompt = await this.promptService.createPrompt({
      version: promptVersion,
      name: `${name} Prompt`,
      template: promptTemplate,
      description: `Prompt for ${name}`,
    });
    
    // Create the agent
    return await this.agentRepo.create({
      key,
      name,
      type: options?.type || 'user',
      model: options?.model || 'gpt-4o-mini',
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
      promptId: prompt.version,
      outputType: options?.outputType || 'structured',
      outputSchema: options?.outputSchema,
      description: options?.description,
      isSystemAgent: false,
    });
  }
  
  
  /**
   * Get pending runs for assessment
   */
  async getPendingRuns(limit?: number): Promise<Run[]> {
    return await this.runRepo.findPending(limit);
  }
  
  /**
   * List all agents
   */
  async listAgents(options?: { includeSystem?: boolean }): Promise<Agent[]> {
    if (options?.includeSystem === false) {
      return await this.agentRepo.findMany({ isSystemAgent: false });
    }
    return await this.agentRepo.findAll();
  }
  
  /**
   * Get a specific agent
   */
  async getAgent(key: string): Promise<Agent | null> {
    return await this.agentRepo.findByKey(key);
  }
  
  
  /**
   * Delete an agent
   */
  async deleteAgent(key: string): Promise<void> {
    const agent = await this.agentRepo.findByKey(key);
    if (!agent) {
      throw new Error(`Agent '${key}' not found`);
    }
    
    if (agent.isSystemAgent) {
      throw new Error('Cannot delete system agents');
    }
    
    await this.agentRepo.deleteByKey(key);
  }
  
  /**
   * Create a new version of an agent
   */
  async createAgentVersion(agentKey: string, changes: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    promptId?: string;
    outputSchema?: Record<string, any>;
    improvementReason?: string;
  }): Promise<Agent> {
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent with key '${agentKey}' not found`);
    }
    
    // Save current version to history
    const versionData: NewAgentVersion = {
      agentId: agent.id,
      version: agent.version,
      parentVersion: agent.version > 1 ? agent.version - 1 : null,
      name: agent.name,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      promptId: agent.promptId,
      outputType: agent.outputType,
      outputSchema: agent.outputSchema,
      averageScore: agent.averageScore,
      evaluationCount: agent.evaluationCount,
      improvementReason: changes.improvementReason,
      changesMade: {
        model: changes.model !== undefined && changes.model !== agent.model,
        temperature: changes.temperature !== undefined && changes.temperature !== agent.temperature,
        maxTokens: changes.maxTokens !== undefined && changes.maxTokens !== agent.maxTokens,
        prompt: changes.promptId !== undefined && changes.promptId !== agent.promptId,
        outputSchema: changes.outputSchema !== undefined,
      },
    };
    
    await this.db.insert(agentVersions).values(versionData);
    
    // Update agent with new version
    const updatedAgent = await this.agentRepo.update(agent.id, {
      version: agent.version + 1,
      model: changes.model ?? agent.model,
      temperature: changes.temperature ?? agent.temperature,
      maxTokens: changes.maxTokens ?? agent.maxTokens,
      promptId: changes.promptId ?? agent.promptId,
      outputSchema: changes.outputSchema ?? agent.outputSchema,
      averageScore: null, // Reset score for new version
      evaluationCount: 0, // Reset count for new version
      updatedAt: new Date(),
    });
    
    return updatedAgent;
  }
  
  /**
   * Get version history for an agent
   */
  async getAgentVersionHistory(agentKey: string): Promise<AgentVersion[]> {
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent with key '${agentKey}' not found`);
    }
    
    const versions = await this.db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agent.id))
      .orderBy(desc(agentVersions.version));
    
    return versions;
  }
  
  /**
   * Rollback agent to a previous version
   */
  async rollbackAgent(agentKey: string, targetVersion: number): Promise<Agent> {
    const agent = await this.agentRepo.findByKey(agentKey);
    if (!agent) {
      throw new Error(`Agent with key '${agentKey}' not found`);
    }
    
    // Find the target version
    const [versionRecord] = await this.db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.agentId, agent.id),
          eq(agentVersions.version, targetVersion)
        )
      )
      .limit(1);
    
    if (!versionRecord) {
      throw new Error(`Version ${targetVersion} not found for agent '${agentKey}'`);
    }
    
    // Save current state as a version before rollback
    await this.createAgentVersion(agentKey, {
      improvementReason: `Rollback from v${agent.version} to v${targetVersion}`,
    });
    
    // Restore the agent to the target version
    const restoredAgent = await this.agentRepo.update(agent.id, {
      model: versionRecord.model,
      temperature: versionRecord.temperature,
      maxTokens: versionRecord.maxTokens,
      promptId: versionRecord.promptId,
      outputSchema: versionRecord.outputSchema,
      averageScore: versionRecord.averageScore,
      evaluationCount: versionRecord.evaluationCount,
      version: agent.version + 1, // Increment version even for rollback
      updatedAt: new Date(),
    });
    
    return restoredAgent;
  }
}