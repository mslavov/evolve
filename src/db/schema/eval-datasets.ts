import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { runs } from './runs';
import { assessments } from './assessments';

export const evalDatasets = sqliteTable('eval_datasets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  assessmentId: text('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  
  // Data fields
  input: text('input').notNull(),
  expectedOutput: text('expected_output').notNull(),
  agentOutput: text('agent_output').notNull(),
  correctedScore: real('corrected_score'),
  verdict: text('verdict').notNull(),
  
  // Dataset metadata
  datasetType: text('dataset_type').notNull().default('evaluation'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  datasetTypeIdx: index('eval_dataset_type_idx').on(table.datasetType),
  runIdx: index('eval_run_idx').on(table.runId),
  assessmentIdx: index('eval_assessment_idx').on(table.assessmentId),
}));

export type EvalDataset = typeof evalDatasets.$inferSelect;
export type NewEvalDataset = typeof evalDatasets.$inferInsert;