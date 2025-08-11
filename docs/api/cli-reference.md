# CLI API Reference

## Overview

The Self-Improving Scorer CLI provides a comprehensive command-line interface for content scoring, evaluation, and optimization tasks.

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

### `score [content]`

Score content usefulness on a 0-1 scale.

**Usage:**
```bash
pnpm score "Your content here"
pnpm score -- -f content.txt
pnpm score -- -g "Content with ground truth"
```

**Options:**
- `-g, --ground-truth` - Collect ground truth label after scoring
- `-f, --file <path>` - Read content from file instead of inline

**Output:**
- Numerical score (0-1)
- Reasoning explanation
- Dimensional breakdown (optional)
- Model metadata

**Example:**
```bash
$ pnpm score "How to implement OAuth2 in Node.js"

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

### `benchmark`

Run standardized benchmark evaluation.

**Usage:**
```bash
pnpm benchmark
pnpm benchmark -- -n 10
```

**Options:**
- `-n, --number <count>` - Number of benchmark items (default: 5)

**Features:**
- Tests against pre-labeled dataset
- Calculates error metrics
- Stores results with ground truth
- Provides performance assessment

### `dashboard`

Display performance statistics dashboard.

**Usage:**
```bash
pnpm dashboard
```

**Displays:**
- Current configuration
- Performance metrics
- Historical statistics
- Model usage breakdown

**Example Output:**
```
┌─────────────────────────────────────────────┐
│        Usefulness Scorer Performance         │
├─────────────────────────────────────────────┤
│ Current Configuration:                       │
│   Model: gpt-4o-mini                        │
│   Temperature: 0.3                          │
│   Prompt: v3_chain_of_thought              │
├─────────────────────────────────────────────┤
│ Performance Metrics:                         │
│   MAE: 0.087                               │
│   RMSE: 0.112                              │
│   Correlation: 0.823                       │
│   Consistency: 0.901                       │
├─────────────────────────────────────────────┤
│ Statistics:                                  │
│   Total Scores: 1247                       │
│   With Ground Truth: 89                    │
│   Average Score: 0.534                     │
│   Models Used: 3                           │
└─────────────────────────────────────────────┘
```

### `interactive`

Enter interactive scoring mode for continuous scoring.

**Usage:**
```bash
pnpm dev interactive
```

**Commands in Interactive Mode:**
- `exit/quit` - Exit interactive mode
- `config` - Show current configuration
- `stats` - Display statistics
- `benchmark` - Run quick benchmark
- `[any text]` - Score the provided text

## Script Shortcuts

The package.json provides convenient shortcuts:

```json
{
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "build": "tsc",
    "score": "tsx src/cli/index.ts score",
    "evaluate": "tsx src/cli/index.ts evaluate",
    "improve": "tsx src/cli/index.ts improve",
    "benchmark": "tsx src/cli/index.ts benchmark",
    "dashboard": "tsx src/cli/index.ts dashboard"
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
pnpm score "What is the capital of France?"
# Output: Score: 0.15 (trivial, widely known)
```

### File-based Scoring
```bash
echo "Complete guide to React hooks" > content.txt
pnpm score -- -f content.txt
```

### Ground Truth Collection
```bash
pnpm score -- -g "Advanced TypeScript patterns"
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