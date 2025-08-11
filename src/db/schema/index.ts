export * from './runs';
export * from './assessments';
export * from './eval-datasets';
export * from './configs';
export * from './prompts';

// Re-export relations
import { relations } from 'drizzle-orm';
import { runs } from './runs';
import { assessments } from './assessments';
import { evalDatasets } from './eval-datasets';

// Define relationships
export const runsRelations = relations(runs, ({ many }) => ({
  assessments: many(assessments),
  evalDatasets: many(evalDatasets),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  run: one(runs, {
    fields: [assessments.runId],
    references: [runs.id],
  }),
  evalDatasets: many(evalDatasets),
}));

export const evalDatasetsRelations = relations(evalDatasets, ({ one }) => ({
  run: one(runs, {
    fields: [evalDatasets.runId],
    references: [runs.id],
  }),
  assessment: one(assessments, {
    fields: [evalDatasets.assessmentId],
    references: [assessments.id],
  }),
}));