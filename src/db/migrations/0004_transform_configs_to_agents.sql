-- Migration: Transform configs to agents
-- This migration creates the agents table and migrates data from configs

-- Create the agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'user' CHECK(type IN ('system', 'user', 'scorer', 'evaluator', 'optimizer', 'researcher', 'generator')),
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  max_tokens INTEGER,
  prompt_id TEXT NOT NULL,
  output_type TEXT NOT NULL DEFAULT 'structured' CHECK(output_type IN ('structured', 'text')),
  output_schema TEXT,
  schema_version TEXT,
  average_score REAL,
  evaluation_count INTEGER DEFAULT 0,
  last_evaluated_at INTEGER,
  description TEXT,
  tags TEXT,
  metadata TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  is_system_agent INTEGER NOT NULL DEFAULT 0 CHECK(is_system_agent IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create indexes for agents table
CREATE UNIQUE INDEX agent_key_idx ON agents(key);
CREATE INDEX agent_type_idx ON agents(type);
CREATE INDEX agent_system_idx ON agents(is_system_agent);
CREATE INDEX agent_default_idx ON agents(is_default);
CREATE INDEX agent_active_idx ON agents(is_active);

-- Migrate data from configs to agents
INSERT INTO agents (
  id,
  key,
  name,
  type,
  model,
  temperature,
  max_tokens,
  prompt_id,
  output_type,
  output_schema,
  schema_version,
  average_score,
  evaluation_count,
  last_evaluated_at,
  description,
  tags,
  metadata,
  is_default,
  is_active,
  is_system_agent,
  created_at,
  updated_at
)
SELECT 
  id,
  key,
  COALESCE(description, 'Migrated from config: ' || key) as name,
  'scorer' as type, -- Default existing configs to scorer type
  model,
  temperature,
  max_tokens,
  prompt_id,
  output_type,
  output_schema,
  schema_version,
  average_score,
  evaluation_count,
  last_evaluated_at,
  description,
  tags,
  metadata,
  is_default,
  is_active,
  0 as is_system_agent, -- User configs are not system agents
  created_at,
  updated_at
FROM configs;

-- Add agent_id and parent_run_id columns to runs table
ALTER TABLE runs ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id);

-- Update existing runs to reference the default agent
UPDATE runs 
SET agent_id = (
  SELECT id FROM agents WHERE is_default = 1 LIMIT 1
)
WHERE agent_id IS NULL;

-- If no default agent exists, set all runs to the first scorer agent
UPDATE runs 
SET agent_id = (
  SELECT id FROM agents WHERE type = 'scorer' LIMIT 1
)
WHERE agent_id IS NULL;

-- Create indexes for new runs columns
CREATE INDEX run_agent_id_idx ON runs(agent_id);
CREATE INDEX run_parent_run_id_idx ON runs(parent_run_id);