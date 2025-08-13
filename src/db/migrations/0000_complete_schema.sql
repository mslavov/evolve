-- Complete schema for Evolve
-- This consolidated migration creates all tables with the latest schema

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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prompt_version_idx` ON `prompts` (`version`);--> statement-breakpoint
CREATE INDEX `prompt_parent_idx` ON `prompts` (`parent_version`);--> statement-breakpoint
CREATE INDEX `prompt_active_idx` ON `prompts` (`is_active`);--> statement-breakpoint
CREATE INDEX `prompt_production_idx` ON `prompts` (`is_production`);--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_version_unique` ON `prompts` (`version`);--> statement-breakpoint

-- Create agents table (with versioning support)
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`version` integer NOT NULL DEFAULT 1,
	`type` text NOT NULL DEFAULT 'user' CHECK(type IN ('system', 'user', 'scorer', 'evaluator', 'optimizer', 'researcher', 'generator', 'classifier', 'extractor', 'summarizer', 'translator')),
	`model` text NOT NULL,
	`temperature` real NOT NULL,
	`max_tokens` integer,
	`prompt_id` text NOT NULL,
	`output_type` text NOT NULL DEFAULT 'structured' CHECK(output_type IN ('structured', 'text')),
	`output_schema` text,
	`average_score` real,
	`evaluation_count` integer DEFAULT 0,
	`last_evaluated_at` integer,
	`description` text,
	`tags` text,
	`metadata` text,
	`is_active` integer NOT NULL DEFAULT true,
	`is_system_agent` integer NOT NULL DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`version`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_key_idx` ON `agents` (`key`);--> statement-breakpoint
CREATE INDEX `agent_type_idx` ON `agents` (`type`);--> statement-breakpoint
CREATE INDEX `agent_system_idx` ON `agents` (`is_system_agent`);--> statement-breakpoint
CREATE INDEX `agent_active_idx` ON `agents` (`is_active`);--> statement-breakpoint
CREATE INDEX `agent_version_idx` ON `agents` (`version`);--> statement-breakpoint

-- Create agent_versions table for version history
CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` integer NOT NULL,
	`parent_version` integer,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`temperature` real NOT NULL,
	`max_tokens` integer,
	`prompt_id` text NOT NULL,
	`output_type` text NOT NULL DEFAULT 'structured',
	`output_schema` text,
	`average_score` real,
	`evaluation_count` integer DEFAULT 0,
	`improvement_reason` text,
	`changes_made` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`version`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `agent_version_agent_idx` ON `agent_versions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_version_version_idx` ON `agent_versions` (`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_version_unique` ON `agent_versions` (`agent_id`, `version`);--> statement-breakpoint

-- Create runs table (with agent version tracking)
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version` integer NOT NULL DEFAULT 1,
	`parent_run_id` text,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`raw_output` text,
	`expected_output` text,
	`config_snapshot` text NOT NULL,
	`reasoning` text,
	`execution_time_ms` integer,
	`token_count` integer,
	`model_used` text,
	`temperature_used` real,
	`iteration` integer DEFAULT 0,
	`run_type` text DEFAULT 'standard' NOT NULL,
	`metadata` text,
	`tags` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `run_agent_idx` ON `runs` (`agent_id`);--> statement-breakpoint
CREATE INDEX `run_agent_version_idx` ON `runs` (`agent_id`, `agent_version`);--> statement-breakpoint
CREATE INDEX `run_parent_idx` ON `runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `run_type_idx` ON `runs` (`run_type`);--> statement-breakpoint
CREATE INDEX `run_iteration_idx` ON `runs` (`iteration`);--> statement-breakpoint
CREATE INDEX `run_created_idx` ON `runs` (`created_at`);--> statement-breakpoint

-- Create assessments table
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

-- Create eval_datasets table
CREATE TABLE `eval_datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`input` text NOT NULL,
	`expected_output` text NOT NULL,
	`agent_output` text NOT NULL,
	`corrected_score` real,
	`verdict` text NOT NULL,
	`dataset_type` text DEFAULT 'evaluation' NOT NULL,
	`dataset_version` text,
	`metadata` text,
	`deleted_at` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `eval_dataset_type_idx` ON `eval_datasets` (`dataset_type`);--> statement-breakpoint
CREATE INDEX `eval_run_idx` ON `eval_datasets` (`run_id`);--> statement-breakpoint
CREATE INDEX `eval_assessment_idx` ON `eval_datasets` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `eval_dataset_version_idx` ON `eval_datasets` (`dataset_version`);--> statement-breakpoint
CREATE INDEX `eval_dataset_deleted_idx` ON `eval_datasets` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `eval_dataset_unique_idx` ON `eval_datasets` (`run_id`, `assessment_id`, `dataset_version`);--> statement-breakpoint

-- Insert system agent prompts
INSERT INTO prompts (id, version, name, description, template, is_active, is_production, metadata, created_at, updated_at)
VALUES 
  -- Prompt Generator Agent
  (
    'prompt_gen_v1_id',
    'prompt_generator_v1',
    'Prompt Generator',
    'System agent for generating prompt variations',
    'You are a prompt engineering expert. Your task is to create an improved variation of the given prompt that maintains the same intent but uses different wording, structure, and techniques to achieve better results.

Input prompt to improve:
{{input}}

Requirements:
- Maintain the same core objective and functionality
- Keep any scoring scales or output formats intact
- Improve clarity and reduce ambiguity
- Add helpful examples if appropriate
- Ensure the prompt is actionable and specific
- Use proven prompt engineering techniques (chain-of-thought, few-shot, etc.) where beneficial

Generate the improved prompt variation below:',
    1,
    1,
    json('{"systemAgent": true, "type": "generator"}'),
    unixepoch(),
    unixepoch()
  ),
  
  -- Research Agent
  (
    'research_agent_v1',
    'research_agent_v1',
    'Research Agent',
    'System agent for conducting research and finding improvement strategies',
    'You are a research specialist analyzing system performance and suggesting improvements.

Analyze the following feedback and evaluation results:
{{input}}

Your task:
1. Identify the root causes of any performance issues
2. Research best practices for addressing these issues
3. Suggest concrete, actionable improvement strategies
4. Prioritize suggestions by expected impact
5. Provide implementation guidance for each suggestion

Format your response as a structured analysis with:
- Key Issues Identified
- Root Cause Analysis
- Recommended Strategies (ordered by priority)
- Implementation Steps
- Expected Outcomes',
    1,
    1,
    json('{"systemAgent": true, "type": "researcher"}'),
    unixepoch(),
    unixepoch()
  ),
  
  -- Evaluation Agent
  (
    'evaluation_agent_v1',
    'evaluation_agent_v1',
    'Evaluation Agent',
    'System agent for evaluating other agents performance',
    'You are an evaluation specialist assessing the performance of AI agents.

Evaluate the following agent output:
{{input}}

Assessment criteria:
1. Accuracy: Does the output correctly address the input?
2. Completeness: Are all aspects of the task handled?
3. Quality: Is the output well-structured and clear?
4. Consistency: Does the output align with expected patterns?
5. Efficiency: Is the response appropriately concise?

Provide:
- Overall score (0-1 scale)
- Breakdown by criteria
- Specific strengths
- Areas for improvement
- Recommended adjustments',
    1,
    1,
    json('{"systemAgent": true, "type": "evaluator"}'),
    unixepoch(),
    unixepoch()
  ),
  
  -- Optimization Agent
  (
    'optimization_agent_v1',
    'optimization_agent_v1',
    'Optimization Agent',
    'System agent for optimizing configurations and parameters',
    'You are an optimization specialist focused on improving AI agent configurations.

Current configuration and performance data:
{{input}}

Analyze the configuration and suggest optimizations for:
1. Model selection (considering cost vs performance)
2. Temperature settings for the specific use case
3. Token limits optimization
4. Prompt structure improvements
5. Output format adjustments

Provide specific recommendations with:
- Current vs suggested values
- Expected improvement percentage
- Risk assessment for each change
- Implementation priority
- Testing approach',
    1,
    1,
    json('{"systemAgent": true, "type": "optimizer"}'),
    unixepoch(),
    unixepoch()
  ),
  
  -- Assessment Agent
  (
    'assessment_agent_v1',
    'assessment_agent_v1',
    'Assessment Agent',
    'System agent for assessing run quality and correctness',
    'You are a quality assessment specialist evaluating AI-generated outputs.

Input and output to assess:
{{input}}

Your assessment should determine:
1. Correctness: Is the output factually accurate?
2. Relevance: Does it properly address the input?
3. Coherence: Is the reasoning sound and logical?
4. Completeness: Are all requirements met?

Provide:
- Verdict: "correct" or "incorrect"
- Confidence score (0-1)
- Detailed reasoning for your assessment
- Corrected score if incorrect
- Specific issues identified',
    1,
    1,
    json('{"systemAgent": true, "type": "evaluator"}'),
    unixepoch(),
    unixepoch()
  );

-- Insert system agents (with version)
INSERT INTO agents (
  id,
  key,
  name,
  version,
  type,
  model,
  temperature,
  max_tokens,
  prompt_id,
  output_type,
  output_schema,
  description,
  is_active,
  is_system_agent,
  created_at,
  updated_at
)
VALUES
  -- Prompt Generator Agent
  (
    'agent_prompt_gen_id',
    'prompt_generator',
    'Prompt Generation Agent',
    1,
    'generator',
    'gpt-4o-mini',
    0.8,
    1000,
    'prompt_generator_v1',
    'text',
    NULL,
    'System agent for generating prompt variations and improvements',
    1,
    1,
    unixepoch(),
    unixepoch()
  ),
  
  -- Research Agent
  (
    'agent_research_id',
    'researcher',
    'Research Agent',
    1,
    'researcher',
    'gpt-4o-mini',
    0.7,
    1500,
    'research_agent_v1',
    'text',
    NULL,
    'System agent for conducting research and finding improvement strategies',
    1,
    1,
    unixepoch(),
    unixepoch()
  ),
  
  -- Evaluation Agent
  (
    'agent_eval_id',
    'evaluator',
    'Evaluation Agent',
    1,
    'evaluator',
    'gpt-4o-mini',
    0.3,
    1000,
    'evaluation_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"score": {"type": "number"}, "breakdown": {"type": "object"}, "strengths": {"type": "array"}, "improvements": {"type": "array"}}}'),
    'System agent for evaluating other agents performance',
    1,
    1,
    unixepoch(),
    unixepoch()
  ),
  
  -- Optimization Agent
  (
    'agent_optimize_id',
    'optimizer',
    'Optimization Agent',
    1,
    'optimizer',
    'gpt-4o-mini',
    0.5,
    1200,
    'optimization_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"recommendations": {"type": "array"}, "priority": {"type": "array"}, "expectedImprovement": {"type": "number"}}}'),
    'System agent for optimizing configurations and parameters',
    1,
    1,
    unixepoch(),
    unixepoch()
  ),
  
  -- Assessment Agent
  (
    'agent_assess_id',
    'assessor',
    'Assessment Agent',
    1,
    'evaluator',
    'gpt-4o-mini',
    0.2,
    800,
    'assessment_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"verdict": {"type": "string", "enum": ["correct", "incorrect"]}, "confidence": {"type": "number"}, "reasoning": {"type": "string"}, "correctedScore": {"type": "number"}, "issues": {"type": "array"}}}'),
    'System agent for assessing run quality and correctness',
    1,
    1,
    unixepoch(),
    unixepoch()
  );