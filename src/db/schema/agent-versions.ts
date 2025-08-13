import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { agents } from './agents.js';
import { prompts } from './prompts.js';

export const agentVersions = sqliteTable('agent_versions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  parentVersion: integer('parent_version'),
  
  // Configuration snapshot
  name: text('name').notNull(),
  model: text('model').notNull(),
  temperature: real('temperature').notNull(),
  maxTokens: integer('max_tokens'),
  promptId: text('prompt_id').notNull().references(() => prompts.version, { onDelete: 'restrict' }),
  
  // Output configuration
  outputType: text('output_type', { enum: ['structured', 'text'] }).notNull().default('structured'),
  outputSchema: text('output_schema', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Performance metrics at time of versioning
  averageScore: real('average_score'),
  evaluationCount: integer('evaluation_count').default(0),
  
  // Version metadata
  improvementReason: text('improvement_reason'),
  changesMade: text('changes_made', { mode: 'json' }).$type<{
    model?: boolean;
    temperature?: boolean;
    maxTokens?: boolean;
    prompt?: boolean;
    outputSchema?: boolean;
    other?: string[];
  }>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Timestamp
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  agentIdx: index('agent_version_agent_idx').on(table.agentId),
  versionIdx: index('agent_version_version_idx').on(table.version),
  agentVersionUnique: uniqueIndex('agent_version_unique').on(table.agentId, table.version),
}));

export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;