import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  key: text('key').notNull().unique(),
  
  // Agent identity
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  type: text('type', { 
    enum: ['system', 'user', 'scorer', 'evaluator', 'optimizer', 'researcher', 'generator', 'classifier', 'extractor', 'summarizer', 'translator'] 
  }).notNull().default('user'),
  
  // Agent configuration
  model: text('model').notNull(),
  temperature: real('temperature').notNull(),
  maxTokens: integer('max_tokens'),
  promptId: text('prompt_id').notNull(), // All agents use prompt templates
  
  // Output configuration
  outputType: text('output_type', { enum: ['structured', 'text'] }).notNull().default('structured'),
  outputSchema: text('output_schema', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Performance metrics
  averageScore: real('average_score'),
  evaluationCount: integer('evaluation_count').default(0),
  lastEvaluatedAt: integer('last_evaluated_at', { mode: 'timestamp' }),
  
  // Metadata
  description: text('description'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Status flags
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  isSystemAgent: integer('is_system_agent', { mode: 'boolean' }).notNull().default(false),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  keyIdx: uniqueIndex('agent_key_idx').on(table.key),
  typeIdx: index('agent_type_idx').on(table.type),
  systemIdx: index('agent_system_idx').on(table.isSystemAgent),
  activeIdx: index('agent_active_idx').on(table.isActive),
}));

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;