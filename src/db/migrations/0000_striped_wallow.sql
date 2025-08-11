CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`verdict` text NOT NULL,
	`corrected_score` real,
	`reasoning` text,
	`assessed_by` text DEFAULT 'human' NOT NULL,
	`assessor_id` text,
	`confidence` real,
	`metadata` text,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assessment_run_id_idx` ON `assessments` (`run_id`);--> statement-breakpoint
CREATE INDEX `assessment_verdict_idx` ON `assessments` (`verdict`);--> statement-breakpoint
CREATE INDEX `assessment_assessor_idx` ON `assessments` (`assessor_id`);--> statement-breakpoint
CREATE TABLE `configs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`model` text NOT NULL,
	`temperature` real NOT NULL,
	`max_tokens` integer,
	`prompt_version` text NOT NULL,
	`average_score` real,
	`evaluation_count` integer DEFAULT 0,
	`last_evaluated_at` integer,
	`description` text,
	`tags` text,
	`metadata` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `configs_key_unique` ON `configs` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `config_key_idx` ON `configs` (`key`);--> statement-breakpoint
CREATE INDEX `config_default_idx` ON `configs` (`is_default`);--> statement-breakpoint
CREATE INDEX `config_active_idx` ON `configs` (`is_active`);--> statement-breakpoint
CREATE TABLE `eval_datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`assessment_id` text,
	`input_content` text NOT NULL,
	`input_type` text,
	`input_metadata` text,
	`ground_truth_score` real NOT NULL,
	`ground_truth_reasoning` text,
	`ground_truth_source` text NOT NULL,
	`ground_truth_dimensions` text,
	`dataset_version` text,
	`dataset_split` text,
	`dataset_tags` text,
	`dataset_quality` text,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `eval_run_id_idx` ON `eval_datasets` (`run_id`);--> statement-breakpoint
CREATE INDEX `eval_assessment_id_idx` ON `eval_datasets` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `eval_version_idx` ON `eval_datasets` (`dataset_version`);--> statement-breakpoint
CREATE INDEX `eval_split_idx` ON `eval_datasets` (`dataset_split`);--> statement-breakpoint
CREATE INDEX `eval_quality_idx` ON `eval_datasets` (`dataset_quality`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`input_content` text NOT NULL,
	`input_length` integer NOT NULL,
	`input_type` text,
	`input_metadata` text,
	`output_score` real NOT NULL,
	`output_reasoning` text NOT NULL,
	`output_dimensions` text,
	`config_model` text NOT NULL,
	`config_temperature` real NOT NULL,
	`config_prompt_version` text NOT NULL,
	`config_max_tokens` integer,
	`telemetry_duration` integer,
	`telemetry_input_tokens` integer,
	`telemetry_output_tokens` integer,
	`telemetry_total_tokens` integer,
	`telemetry_tool_calls` text,
	`assessment_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scoring_records` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`input_content` text NOT NULL,
	`input_length` integer NOT NULL,
	`input_type` text,
	`output_score` real NOT NULL,
	`output_reasoning` text NOT NULL,
	`output_dimensions` text,
	`config_model` text NOT NULL,
	`config_temperature` real NOT NULL,
	`config_prompt_version` text NOT NULL,
	`ground_truth_score` real,
	`ground_truth_source` text,
	`ground_truth_labeler_info` text,
	`performance_error` real,
	`performance_squared_error` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scoring_timestamp_idx` ON `scoring_records` (`timestamp`);--> statement-breakpoint
CREATE INDEX `scoring_model_idx` ON `scoring_records` (`config_model`);--> statement-breakpoint
CREATE INDEX `scoring_score_idx` ON `scoring_records` (`output_score`);