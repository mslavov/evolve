import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { runs } from './runs';

export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  
  // Assessment verdict
  verdict: text('verdict', { enum: ['correct', 'incorrect'] }).notNull(),
  correctedScore: real('corrected_score'),
  reasoning: text('reasoning'),
  
  // Metadata
  assessedBy: text('assessed_by', { enum: ['human', 'llm', 'consensus'] }).notNull().default('human'),
  assessorId: text('assessor_id'),
  confidence: real('confidence'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Timestamps
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  runIdIdx: index('assessment_run_id_idx').on(table.runId),
  verdictIdx: index('assessment_verdict_idx').on(table.verdict),
  assessorIdx: index('assessment_assessor_idx').on(table.assessorId),
}));

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;