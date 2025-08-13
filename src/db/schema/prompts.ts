import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  version: text('version').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  
  // Prompt content
  template: text('template').notNull(),
  variables: text('variables', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Performance metrics
  mae: real('mae'),
  correlation: real('correlation'),
  rmse: real('rmse'),
  evaluationCount: integer('evaluation_count').default(0),
  lastEvaluatedAt: integer('last_evaluated_at', { mode: 'timestamp' }),
  
  // Lineage
  parentVersion: text('parent_version'),
  createdBy: text('created_by', { enum: ['human', 'ai'] }).notNull().default('human'),
  generationStrategy: text('generation_strategy'),
  
  // Metadata
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Status
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  isTested: integer('is_tested', { mode: 'boolean' }).notNull().default(false),
  isProduction: integer('is_production', { mode: 'boolean' }).notNull().default(false),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  versionIdx: uniqueIndex('prompt_version_idx').on(table.version),
  activeIdx: index('prompt_active_idx').on(table.isActive),
  productionIdx: index('prompt_production_idx').on(table.isProduction),
  parentIdx: index('prompt_parent_idx').on(table.parentVersion),
}));

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;