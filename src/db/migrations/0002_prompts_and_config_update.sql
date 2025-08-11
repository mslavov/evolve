-- Create prompts table
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`template` text NOT NULL,
	`variables` text,
	`mae` real,
	`correlation` real,
	`rmse` real,
	`evaluation_count` integer DEFAULT 0,
	`last_evaluated_at` integer,
	`parent_version` text,
	`created_by` text DEFAULT 'human' NOT NULL,
	`generation_strategy` text,
	`tags` text,
	`metadata` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_tested` integer DEFAULT false NOT NULL,
	`is_production` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`tested_at` integer
);

-- Create indexes for prompts
CREATE UNIQUE INDEX `prompt_version_idx` ON `prompts` (`version`);
CREATE INDEX `prompt_active_idx` ON `prompts` (`is_active`);
CREATE INDEX `prompt_production_idx` ON `prompts` (`is_production`);
CREATE INDEX `prompt_parent_idx` ON `prompts` (`parent_version`);

-- Rename columns in configs and runs tables
ALTER TABLE `configs` RENAME COLUMN `prompt_version` TO `prompt_id`;
ALTER TABLE `runs` RENAME COLUMN `config_prompt_version` TO `config_prompt_id`;