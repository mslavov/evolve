import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const configs = sqliteTable('configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  key: text('key').notNull().unique(),
  
  // Model configuration
  model: text('model').notNull(),
  temperature: real('temperature').notNull(),
  maxTokens: integer('max_tokens'),
  promptId: text('prompt_id').notNull(),
  
  // Performance metrics
  averageScore: real('average_score'),
  evaluationCount: integer('evaluation_count').default(0),
  lastEvaluatedAt: integer('last_evaluated_at', { mode: 'timestamp' }),
  
  // Metadata
  description: text('description'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Status
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  keyIdx: uniqueIndex('config_key_idx').on(table.key),
  defaultIdx: index('config_default_idx').on(table.isDefault),
  activeIdx: index('config_active_idx').on(table.isActive),
}));

export type Config = typeof configs.$inferSelect;
export type NewConfig = typeof configs.$inferInsert;