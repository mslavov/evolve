# CLI API Reference

## Overview

The Evolve CLI provides a comprehensive command-line interface for running agents, managing configurations, assessing results, and optimizing performance through iterative improvement.

## Installation & Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run in development
pnpm dev [command]

# Build for production
pnpm build
node dist/cli/index.js [command]
```

## Commands

### `run [content]`

Run an agent with given input (text or structured data).

**Usage:**
```bash
pnpm cli run "Your content here"
pnpm cli run --input-file input.json
pnpm cli run "Content" --output-file results.json
```

**Options:**
- `-a, --agent <key>` - Agent key to use
- `-c, --config <key>` - Configuration key (deprecated, use --agent)
- `-i, --input-file <path>` - Path to JSON file containing structured input
- `-o, --output-file <path>` - Path to save output as JSON
- `--collect` - Collect this run for assessment
- `--verbose` - Show detailed output

### `score [content]` (Removed)

This command has been removed. Use `run` instead.

**Output:**
- Numerical score (0-1)
- Reasoning explanation
- Dimensional breakdown (optional)
- Model metadata

**Example:**
```bash
$ pnpm cli run "How to implement OAuth2 in Node.js"

═══════════════════════════════
   USEFULNESS SCORE
═══════════════════════════════

Score: 0.72
Reasoning: Practical technical question with clear value
Dimensions:
  relevance: ████████░░ 0.80
  accuracy: ███████░░░ 0.70
  completeness: ██████░░░░ 0.60
  clarity: ████████░░ 0.80
  actionability: ███████░░░ 0.70

Model: gpt-4o-mini | Temp: 0.3
```

**JSON Input Format:**
```json
{
  "content": "Main input text or structured data",
  "metadata": {
    "source": "user",
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "context": {
    "previousScore": 0.8,
    "category": "technical"
  }
}
```

**Example with JSON:**
```bash
# Create input file
echo '{
  "content": "How to implement OAuth2?",
  "metadata": {"source": "stackoverflow"}
}' > input.json

# Run with JSON input
$ pnpm cli run --input-file input.json --output-file result.json

# Check output
$ cat result.json
```

### `evaluate`

Evaluate scoring performance against ground truth data.

**Usage:**
```bash
pnpm evaluate
pnpm evaluate -- -l 100
```

**Options:**
- `-l, --limit <number>` - Number of records to evaluate (default: 100)

**Output:**
- Overall metrics (MAE, RMSE, correlation)
- Configuration-specific performance
- Recommendations for improvement

**Metrics Calculated:**
- **MAE**: Mean Absolute Error
- **RMSE**: Root Mean Square Error
- **Correlation**: Pearson correlation coefficient
- **Bias**: Systematic over/under-scoring
- **Consistency**: Score variance for similar content

### `improve`

Run optimization cycle to find better configurations.

**Usage:**
```bash
pnpm improve
pnpm improve -- --auto
```

**Options:**
- `-a, --auto` - Automatically apply best configuration

**Process:**
1. Analyzes current performance
2. Tests alternative models
3. Optimizes temperature settings
4. Evaluates prompt variations
5. Recommends improvements

**Output:**
- Current best configuration
- Configurations to test
- Expected improvement percentage

### `agent`

Manage agent configurations.

**Usage:**
```bash
pnpm cli agent list                    # List all agents
pnpm cli agent get <key>               # Show agent details
pnpm cli agent set <key> [options]     # Create/update agent
pnpm cli agent default <key>           # Set default agent
pnpm cli agent clone <src> <dst>        # Clone agent
pnpm cli agent delete <key>            # Delete agent
```

**Set Options:**
- `--name <name>` - Agent display name
- `--type <type>` - Agent type (scorer, classifier, extractor, etc.)
- `--model <model>` - LLM model to use
- `--temperature <temp>` - Temperature setting (0-1)
- `--max-tokens <tokens>` - Maximum tokens
- `--prompt <prompt>` - Agent prompt template
- `--prompt-file <path>` - Load prompt from file

### `assess`

Manage human assessments of agent runs.

**Usage:**
```bash
pnpm cli assess pending                # List runs pending assessment
pnpm cli assess list                   # List all assessments
pnpm cli assess add <runId> <result>   # Add assessment
pnpm cli assess stats                  # Show assessment statistics
```

**Assessment Results:**
- `correct` - Output was correct
- `incorrect` - Output was incorrect
- `partial` - Output was partially correct

**Options for add:**
- `--score <score>` - Numeric score (0-1)
- `--notes <notes>` - Additional notes

### `prompt`

Manage prompt templates.

**Usage:**
```bash
pnpm cli prompt list                   # List all prompts
pnpm cli prompt get <key>              # Show prompt details
pnpm cli prompt set <key> <content>    # Create/update prompt
pnpm cli prompt delete <key>           # Delete prompt
```

### `dataset`

Manage evaluation datasets.

**Usage:**
```bash
pnpm cli dataset list                  # List datasets
pnpm cli dataset build                 # Build from assessments
pnpm cli dataset show <name>           # Show dataset details
pnpm cli dataset delete <name>         # Delete dataset
```

## Script Shortcuts

The package.json provides convenient shortcuts:

```json
{
  "scripts": {
    "cli": "tsx src/cli/index.ts",
    "build": "tsc",
    "db:migrate": "tsx src/scripts/migrate.ts",
    "test": "vitest",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix"
  }
}
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Required API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional Defaults
DEFAULT_MODEL=gpt-4o-mini
DEFAULT_TEMPERATURE=0.3
DEFAULT_MAX_TOKENS=500
```

### Supported Models

- `gpt-4o-mini` - Fast, cost-effective OpenAI model
- `gpt-4o` - Advanced OpenAI model
- `claude-3-haiku` - Fast Anthropic model
- `claude-3-sonnet` - Advanced Anthropic model

### Temperature Settings

- `0.0` - Deterministic, consistent scoring
- `0.3` - Balanced (recommended default)
- `0.7` - More creative interpretation
- `1.0` - Maximum variability

## Error Handling

The CLI provides detailed error messages:

- **Missing API Keys**: Prompts to set environment variables
- **Invalid Content**: Validates input before processing
- **Database Errors**: Handles SQLite connection issues
- **API Failures**: Retries with exponential backoff

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Missing configuration
- `4` - Database error
- `5` - API error

## Examples

### Basic Scoring
```bash
pnpm cli run "What is the capital of France?"
# Output: Score: 0.15 (trivial, widely known)
```

### File-based Scoring
```bash
echo "Complete guide to React hooks" > content.txt
pnpm cli run -- -f content.txt
```

### Ground Truth Collection
```bash
pnpm cli run -- -g "Advanced TypeScript patterns"
# Prompts for human evaluation after AI scoring
```

### Performance Check
```bash
pnpm evaluate -- -l 50
# Evaluates last 50 records with ground truth
```

### Configuration Optimization
```bash
pnpm improve -- --auto
# Tests configurations and applies best one
```

### Quick Benchmark
```bash
pnpm benchmark -- -n 3
# Runs 3 benchmark tests
```