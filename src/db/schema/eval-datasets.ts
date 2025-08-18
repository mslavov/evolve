import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { runs } from './runs.js';
import { assessments } from './assessments.js';
import { agents } from './agents.js';

export const evalDatasets = sqliteTable('eval_datasets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'restrict' }),
  assessmentId: text('assessment_id').notNull().references(() => assessments.id, { onDelete: 'restrict' }),
  
  // Agent association
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'restrict' }),
  agentVersion: integer('agent_version').default(1),
  
  // Data fields
  input: text('input').notNull(),
  expectedOutput: text('expected_output', { mode: 'json' }).$type<any>().notNull(),
  agentOutput: text('agent_output').notNull(),
  verdict: text('verdict').notNull(),
  
  // Dataset metadata
  datasetType: text('dataset_type').notNull().default('evaluation'),
  datasetVersion: text('dataset_version'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Soft delete support
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Performance indexes
  datasetTypeIdx: index('eval_dataset_type_idx').on(table.datasetType),
  runIdx: index('eval_run_idx').on(table.runId),
  assessmentIdx: index('eval_assessment_idx').on(table.assessmentId),
  agentIdx: index('eval_agent_idx').on(table.agentId),
  agentVersionIdx: index('eval_agent_version_idx').on(table.agentId, table.agentVersion),
  versionIdx: index('eval_dataset_version_idx').on(table.datasetVersion),
  deletedAtIdx: index('eval_dataset_deleted_idx').on(table.deletedAt),
  
  // Unique constraint to prevent duplicates
  uniqueDatasetEntry: uniqueIndex('eval_dataset_unique_idx').on(
    table.runId, 
    table.assessmentId, 
    table.datasetVersion
  ),
}));

export type EvalDataset = typeof evalDatasets.$inferSelect;
export type NewEvalDataset = typeof evalDatasets.$inferInsert;