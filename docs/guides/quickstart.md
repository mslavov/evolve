# Quick Start Guide

## Overview

Evolve helps you create self-improving AI agents that get better with each interaction. This guide will walk you through the core workflow:

1. **Define** - Create your custom agent
2. **Run** - Execute the agent with your data
3. **Assess** - Evaluate the agent's outputs
4. **Improve** - Optimize through iterative refinement

## Prerequisites

- Node.js 18+ and pnpm
- OpenAI or Anthropic API key

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd evolve

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
```

Edit `.env` and add your API key:
```env
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
# Initialize database (creates system agents only)
pnpm db:migrate
```

## Step 1: Define Your Agent

Unlike traditional static configurations, Evolve starts with you defining your own agent. The system comes with only system agents pre-installed.

### Create a Simple Scorer Agent

```bash
pnpm cli agent set content_scorer \
  --name "Content Quality Scorer" \
  --type scorer \
  --model gpt-4o \
  --temperature 0.3 \
  --prompt "Rate the quality of the following content on a scale of 0-1.
  
  Consider:
  - Clarity and coherence
  - Factual accuracy
  - Usefulness to readers
  - Proper structure
  
  Content: {{input}}
  
  Respond with a JSON object:
  {\"score\": 0.0-1.0, \"reasoning\": \"explanation\"}"
```

### Set as Default

```bash
pnpm cli agent default content_scorer
```

### Verify Your Agent

```bash
pnpm cli agent list
# Shows all agents including your new one

pnpm cli agent show content_scorer
# Shows detailed configuration
```

## Step 2: Run Your Agent

### Run with Direct Input

```bash
pnpm cli run "The Earth orbits around the Sun once every 365.25 days."
```

### Run with JSON Input

Create `input.json`:
```json
{
  "content": "The Earth orbits around the Sun once every 365.25 days.",
  "metadata": {
    "source": "science_textbook",
    "topic": "astronomy"
  }
}
```

```bash
pnpm cli run --input-file input.json
```

### Batch Processing

```bash
# Process multiple inputs and save results
pnpm cli run "First content" --output-file results1.json
pnpm cli run "Second content" --output-file results2.json
pnpm cli run "Third content" --output-file results3.json
```

## Step 3: Assess Performance

After running your agent, assess whether its outputs are correct:

### View Pending Assessments

```bash
pnpm cli assess pending
```

This shows all runs that haven't been assessed yet, including:
- Run ID
- Input snippet
- Agent output
- Timestamp

### Add Assessments

```bash
# Mark as correct
pnpm cli assess add <runId> correct

# Mark as incorrect with corrected score
pnpm cli assess add <runId> incorrect --score 0.7 --reason "Score too high for content quality"
```

### Build Evaluation Dataset

Once you have several assessments:

```bash
pnpm cli dataset build
# Creates a dataset from all assessments

pnpm cli dataset export -o eval_dataset.json
# Export for external use
```

## Step 4: Improve Your Agent

### Run Basic Optimization

```bash
pnpm cli improve optimize content_scorer
```

This will:
1. Evaluate current performance
2. Generate improvement strategies
3. Create an optimized version
4. Test the new version

### Run Iterative Optimization

For more thorough improvement:

```bash
pnpm cli improve optimize content_scorer \
  --iterations 10 \
  --target 0.9 \
  --strategy hybrid
```

Parameters:
- `--iterations`: Maximum optimization cycles
- `--target`: Target score to achieve (0-1)
- `--strategy`: Evaluation strategy (numeric, fact-based, hybrid)

### Monitor Progress

```bash
# View optimization history
pnpm cli improve stats

# Analyze specific version
pnpm cli improve analyze content_scorer_v2
```

## Complete Example: Content Moderation Agent

Let's build a content moderation agent from scratch:

### 1. Create the Agent

```bash
pnpm cli agent set moderator \
  --name "Content Moderator" \
  --type evaluator \
  --model gpt-4o-mini \
  --temperature 0.2 \
  --prompt "Evaluate if the following content is appropriate for a professional forum.
  
  Check for:
  - Offensive language
  - Spam or promotional content
  - Off-topic discussions
  - Personal attacks
  
  Content: {{input}}
  
  Respond with:
  {
    \"appropriate\": true/false,
    \"reason\": \"explanation\",
    \"confidence\": 0.0-1.0
  }"
```

### 2. Test with Sample Data

```bash
# Test appropriate content
pnpm cli run "This is a thoughtful discussion about software architecture patterns."

# Test inappropriate content  
pnpm cli run "BUY NOW!!! AMAZING DEALS!!! CLICK HERE!!!"
```

### 3. Build Ground Truth

```bash
# Get run IDs
pnpm cli assess pending

# Add assessments
pnpm cli assess add run_123 correct
pnpm cli assess add run_456 incorrect --score 0 --reason "Spam not detected"
```

### 4. Optimize

```bash
pnpm cli improve optimize moderator --iterations 5
```

### 5. Compare Versions

```bash
# Run both versions on same input
pnpm cli run "Check out this cool framework!" --agent moderator
pnpm cli run "Check out this cool framework!" --agent moderator_v2

# View performance metrics
pnpm cli improve stats
```

## Advanced Features

### Using Different Models

```bash
# Create agent with Claude
pnpm cli agent set claude_agent \
  --name "Claude Analyzer" \
  --model claude-3-5-sonnet-20241022 \
  --temperature 0.5 \
  --prompt "Your prompt here"
```

### Structured Output

```bash
# Define output schema
pnpm cli agent set structured_agent \
  --name "Structured Extractor" \
  --output-type structured \
  --output-schema '{
    "type": "object",
    "properties": {
      "entities": {"type": "array"},
      "sentiment": {"type": "string"},
      "topics": {"type": "array"}
    }
  }'
```

### AI-Driven Optimization

```bash
# Run iterative optimization with AI agents
pnpm cli improve myagent \
  --target 0.9 \
  --max-iterations 10
```

## System Agents

Evolve uses two specialized AI agents for optimization:

- **prompt_researcher**: Analyzes performance and researches improvements
- **prompt_engineer**: Implements prompt improvements based on research

You can view these with:
```bash
pnpm cli agent list --system
```

## Next Steps

1. **Explore evaluation strategies** - Learn about numeric, fact-based, and hybrid evaluation in the [Evaluation Guide](./evaluation-strategies.md)

2. **Understand the optimization process** - Deep dive into how agents improve in the [Optimization System](../advanced-optimization-system.md)

3. **Build complex agents** - Create multi-step agents with the [Advanced Agents Guide](./advanced-agents.md)

4. **Integrate with your application** - Use the [API Reference](../api/module-reference.md) for programmatic access

## Troubleshooting

### Database Issues

```bash
# Check migration status
pnpm cli migrate status

# Reset database
pnpm db:reset

# Validate schema
pnpm cli migrate validate
```

### Agent Not Found

```bash
# List all agents
pnpm cli agent list

# Check if agent is active
pnpm cli agent show <agent-key>
```

### Optimization Not Converging

Try:
- Increasing iterations: `--iterations 20`
- Adjusting target score: `--target 0.8`
- Changing evaluation strategy: `--strategy fact-based`
- Enabling research: `--enable-research`

## Summary

You've learned the core Evolve workflow:

1. **Define** agents with custom prompts and configurations
2. **Run** agents on your data
3. **Assess** outputs to build ground truth
4. **Improve** through iterative optimization

Your agents will continuously evolve and improve based on real-world performance data, creating a feedback loop that leads to better results over time.