import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { agents } from './agents.js';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Agent relationship
  agentId: text('agent_id').notNull().references(() => agents.id),
  agentVersion: integer('agent_version').notNull().default(1),
  parentRunId: text('parent_run_id').references(() => runs.id),
  
  // Input/Output
  input: text('input').notNull(),
  output: text('output', { mode: 'json' }).$type<any>().notNull(),
  rawOutput: text('raw_output'),
  expectedOutput: text('expected_output', { mode: 'json' }).$type<any>(),
  
  // Configuration snapshot
  configSnapshot: text('config_snapshot', { mode: 'json' }).$type<Record<string, any>>().notNull(),
  
  // Execution details
  reasoning: text('reasoning'),
  executionTimeMs: integer('execution_time_ms'),
  tokenCount: integer('token_count'),
  modelUsed: text('model_used'),
  temperatureUsed: real('temperature_used'),
  
  // Run metadata
  iteration: integer('iteration').default(0),
  runType: text('run_type').notNull().default('standard'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  agentIdx: index('run_agent_idx').on(table.agentId),
  agentVersionIdx: index('run_agent_version_idx').on(table.agentId, table.agentVersion),
  parentIdx: index('run_parent_idx').on(table.parentRunId),
  typeIdx: index('run_type_idx').on(table.runType),
  iterationIdx: index('run_iteration_idx').on(table.iteration),
  createdIdx: index('run_created_idx').on(table.createdAt),
}));

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;