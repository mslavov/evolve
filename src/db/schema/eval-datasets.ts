import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { runs } from './runs';
import { assessments } from './assessments';

export const evalDatasets = sqliteTable('eval_datasets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
  assessmentId: text('assessment_id').references(() => assessments.id, { onDelete: 'set null' }),
  
  // Input data
  inputContent: text('input_content').notNull(),
  inputType: text('input_type'),
  inputMetadata: text('input_metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Ground truth
  groundTruthScore: real('ground_truth_score').notNull(),
  groundTruthReasoning: text('ground_truth_reasoning'),
  groundTruthSource: text('ground_truth_source', { 
    enum: ['assessment', 'human', 'consensus', 'synthetic'] 
  }).notNull(),
  groundTruthDimensions: text('ground_truth_dimensions', { mode: 'json' }).$type<{
    clarity?: number;
    relevance?: number;
    completeness?: number;
    actionability?: number;
    accuracy?: number;
  }>(),
  
  // Dataset metadata
  datasetVersion: text('dataset_version'),
  datasetSplit: text('dataset_split', { enum: ['train', 'validation', 'test'] }),
  datasetTags: text('dataset_tags', { mode: 'json' }).$type<string[]>(),
  datasetQuality: text('dataset_quality', { enum: ['high', 'medium', 'low'] }),
  
  // Timestamps
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  runIdIdx: index('eval_run_id_idx').on(table.runId),
  assessmentIdIdx: index('eval_assessment_id_idx').on(table.assessmentId),
  versionIdx: index('eval_version_idx').on(table.datasetVersion),
  splitIdx: index('eval_split_idx').on(table.datasetSplit),
  qualityIdx: index('eval_quality_idx').on(table.datasetQuality),
}));

export type EvalDataset = typeof evalDatasets.$inferSelect;
export type NewEvalDataset = typeof evalDatasets.$inferInsert;