export * from './runs';
export * from './assessments';
export * from './eval-datasets';
export * from './prompts';
export * from './agents';

// Re-export relations
import { relations } from 'drizzle-orm';
import { runs } from './runs';
import { assessments } from './assessments';
import { evalDatasets } from './eval-datasets';
import { agents } from './agents';

// Define relationships
export const runsRelations = relations(runs, ({ one, many }) => ({
  assessments: many(assessments),
  evalDatasets: many(evalDatasets),
  agent: one(agents, {
    fields: [runs.agentId],
    references: [agents.id],
  }),
  parentRun: one(runs, {
    fields: [runs.parentRunId],
    references: [runs.id],
  }),
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

export const agentsRelations = relations(agents, ({ many }) => ({
  runs: many(runs),
}));