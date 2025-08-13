-- Migration: Add system agents and their prompts
-- This migration creates prompt templates and agent entries for system agents

-- Insert prompt templates for system agents
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

-- Insert system agent entries
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
  description,
  is_default,
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
    'generator',
    'gpt-4o-mini',
    0.8,
    1000,
    'prompt_generator_v1',
    'text',
    NULL,
    NULL,
    'System agent for generating prompt variations and improvements',
    0,
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
    'researcher',
    'gpt-4o-mini',
    0.7,
    1500,
    'research_agent_v1',
    'text',
    NULL,
    NULL,
    'System agent for conducting research and finding improvement strategies',
    0,
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
    'evaluator',
    'gpt-4o-mini',
    0.3,
    1000,
    'evaluation_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"score": {"type": "number"}, "breakdown": {"type": "object"}, "strengths": {"type": "array"}, "improvements": {"type": "array"}}}'),
    'evaluation-v1',
    'System agent for evaluating other agents performance',
    0,
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
    'optimizer',
    'gpt-4o-mini',
    0.5,
    1200,
    'optimization_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"recommendations": {"type": "array"}, "priority": {"type": "array"}, "expectedImprovement": {"type": "number"}}}'),
    'optimization-v1',
    'System agent for optimizing configurations and parameters',
    0,
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
    'evaluator',
    'gpt-4o-mini',
    0.2,
    800,
    'assessment_agent_v1',
    'structured',
    json('{"type": "object", "properties": {"verdict": {"type": "string", "enum": ["correct", "incorrect"]}, "confidence": {"type": "number"}, "reasoning": {"type": "string"}, "correctedScore": {"type": "number"}, "issues": {"type": "array"}}}'),
    'assessment-v1',
    'System agent for assessing run quality and correctness',
    0,
    1,
    1,
    unixepoch(),
    unixepoch()
  );