import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  
  // Input fields
  inputContent: text('input_content').notNull(),
  inputLength: integer('input_length').notNull(),
  inputType: text('input_type'),
  inputMetadata: text('input_metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Output fields
  outputScore: real('output_score').notNull(),
  outputReasoning: text('output_reasoning').notNull(),
  outputDimensions: text('output_dimensions', { mode: 'json' }).$type<{
    clarity?: number;
    relevance?: number;
    completeness?: number;
    actionability?: number;
    accuracy?: number;
  }>(),
  
  // Config fields
  configModel: text('config_model').notNull(),
  configTemperature: real('config_temperature').notNull(),
  configPromptId: text('config_prompt_id').notNull(),
  configMaxTokens: integer('config_max_tokens'),
  
  // Telemetry fields
  telemetryDuration: integer('telemetry_duration'),
  telemetryInputTokens: integer('telemetry_input_tokens'),
  telemetryOutputTokens: integer('telemetry_output_tokens'),
  telemetryTotalTokens: integer('telemetry_total_tokens'),
  telemetryToolCalls: text('telemetry_tool_calls', { mode: 'json' }).$type<Array<{
    name: string;
    duration: number;
    success: boolean;
  }>>(),
  
  // Assessment tracking
  assessmentStatus: text('assessment_status', { 
    enum: ['pending', 'assessed', 'skipped'] 
  }).notNull().default('pending'),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;