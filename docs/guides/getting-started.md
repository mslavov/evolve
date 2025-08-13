# Getting Started Guide

## Prerequisites

### Required Software
- **Node.js**: Version 18.0 or higher
- **pnpm**: Recommended package manager (or npm)
- **Git**: For version control

### API Keys Required
- **OpenAI API Key**: For GPT models (get from [platform.openai.com](https://platform.openai.com))
- **Anthropic API Key**: For Claude models (get from [console.anthropic.com](https://console.anthropic.com))

## Installation

### 1. Clone the Repository
```bash
git clone git@github.com:mslavov/evolve.git
cd evolve
```

### 2. Install Dependencies
```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

### 3. Configure Environment
```bash
# Create .env file with your API keys
```

Your `.env` file should contain:
```env
# Required API Keys
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-api...
```

Note: Agent configurations are stored in the SQLite database and persist across sessions. Use the `agent` commands to manage them.

### 4. Verify Installation
```bash
# Build the project
pnpm build

# Run a test command
pnpm dashboard
```

If successful, you should see the performance dashboard.

## First Steps

### 1. Score Your First Content

#### Simple Text Scoring
```bash
pnpm cli run "What is the capital of France?"
```

Expected output:
```
═══════════════════════════════
   USEFULNESS SCORE
═══════════════════════════════

Score: 0.15
Reasoning: Trivial fact, widely known, no actionable value

Model: gpt-4o-mini | Temp: 0.3
```

#### Score Complex Content
```bash
pnpm cli run "Here's how to implement OAuth2 in Node.js: First, install the required packages using npm install express passport passport-google-oauth20. Then configure your strategy..."
```

This should return a higher score (0.6-0.8) for useful technical content.

### 2. Interactive Mode

Start the interactive scorer:
```bash
pnpm dev interactive
```

Commands available:
- Type any text to score it
- `config` - Show current configuration
- `stats` - Display statistics
- `benchmark` - Run quick benchmark
- `exit` - Quit interactive mode

### 3. Run a Benchmark

Test the system against pre-labeled content:
```bash
pnpm benchmark -- -n 3
```

This will:
1. Score 3 benchmark items
2. Compare against ground truth
3. Calculate Mean Absolute Error (MAE)
4. Store results for evaluation

### 4. Collect Ground Truth

Score content and provide your own evaluation:
```bash
pnpm cli run -- -g "Machine learning is a subset of artificial intelligence"
```

After AI scoring, you'll be prompted:
```
HUMAN EVALUATION REQUIRED
────────────────────────────────
Content: Machine learning is a subset of...
────────────────────────────────
AI Score: 0.35

Scoring Guide:
0.0-0.2: Not useful
0.2-0.4: Slightly useful
0.4-0.6: Moderately useful
0.6-0.8: Very useful
0.8-1.0: Extremely useful

Your score (0-1): 0.3
```

## Understanding Scores

### Score Ranges
| Range | Meaning | Examples |
|-------|---------|----------|
| 0.0-0.2 | Not useful | Trivial facts, wrong info, spam |
| 0.2-0.4 | Slightly useful | Basic info, generic advice |
| 0.4-0.6 | Moderately useful | Standard quality, helpful |
| 0.6-0.8 | Very useful | Detailed, valuable, actionable |
| 0.8-1.0 | Extremely useful | Comprehensive, exceptional |

### Scoring Dimensions
Each score can include dimensional breakdown:
- **Relevance**: How well it addresses the topic
- **Accuracy**: Correctness of information
- **Completeness**: Coverage of the subject
- **Clarity**: Ease of understanding
- **Actionability**: Practical usefulness

## Viewing Performance

### Dashboard
```bash
pnpm dashboard
```

Shows:
- Current configuration
- Performance metrics (if available)
- Total scores collected
- Statistics

### Evaluation Report
```bash
pnpm evaluate
```

Generates detailed performance analysis:
- Mean Absolute Error (MAE)
- Root Mean Square Error (RMSE)
- Correlation with ground truth
- Recommendations

## Improving Accuracy

### Automatic Optimization
```bash
pnpm improve -- --auto
```

This will:
1. Analyze current performance
2. Test different configurations
3. Apply the best settings automatically

### Agent Management

Manage agents using CLI:
```bash
# Create a new agent
pnpm cli agent set my-agent --name "My Agent" --type scorer --model gpt-4o

# List all agents
pnpm cli agent list

# Set as default agent
pnpm cli agent default my-agent

# Clone an existing agent
pnpm cli agent clone default my-custom-agent
```

Agents are stored in the SQLite database and persist across sessions.

## File-based Input

### Text from File
```bash
# Create a JSON file with content
echo '{"content": "Your content here"}' > content.json

# Process it
pnpm cli run --input-file content.json
```

### JSON Input
Create a structured input file:
```json
{
  "content": "Main text to process",
  "metadata": {
    "source": "user",
    "category": "technical"
  },
  "context": {
    "previousScore": 0.8
  }
}
```

Run with JSON input:
```bash
pnpm cli run --input-file input.json

# Save output to file
pnpm cli run --input-file input.json --output-file results.json
```

### Batch Processing
Create multiple files and process them:
```bash
for file in *.txt; do
  pnpm cli run -- -f "$file"
done

# Or with JSON files
for file in *.json; do
  pnpm cli run --input-file "$file" --output-file "results/${file%.json}_output.json"
done
```

## Next Steps

### Build Your Dataset
1. Score diverse content types
2. Collect ground truth labels
3. Build up 50+ labeled examples
4. Run evaluation to see performance

### Optimize Configuration
1. Test different models
2. Adjust temperature settings
3. Try different prompt versions
4. Use `pnpm improve` to find best settings

### Integrate into Workflow
1. Use as a content quality gate
2. Score generated content
3. Filter low-quality results
4. Track quality over time

## Common Use Cases

### Content Moderation
```bash
# Score user-generated content
pnpm cli run "User comment text here"
# Reject if score < 0.3
```

### Quality Assurance
```bash
# Score AI-generated content
pnpm cli run -- -f generated-article.txt
# Require score > 0.6 for publication
```

### Training Data Collection
```bash
# Run agent and collect for assessment
pnpm cli run "Example content" --collect

# Assess runs
pnpm cli assess pending
pnpm cli assess add <runId> correct

# Build dataset from assessments
pnpm cli dataset build
```

## Troubleshooting

### "API Key Missing" Error
```bash
# Check your .env file
cat .env
# Ensure keys are set correctly
```

### "Database Locked" Error
```bash
# Kill any running processes
pkill -f "node.*cli"
# Try again
```

### Build Errors
```bash
# Clean and rebuild
rm -rf dist/
pnpm build
```

### Import Errors
Ensure all imports use `.js` extension:
```typescript
// Correct
import { UsefulnessScorer } from './agents/usefulness-scorer.js';

// Incorrect
import { UsefulnessScorer } from './agents/usefulness-scorer';
```

## Getting Help

### Check Documentation
- [System Overview](../system-overview.md) - Architecture details
- [CLI Reference](../api/cli-reference.md) - All commands
- [Development Guide](./development-guide.md) - Contributing

### Debug Mode
```bash
# Run with verbose output
DEBUG=* pnpm cli run "test content"
```

### View Logs
```bash
# Check recent runs
sqlite3 scoring-data.db "SELECT * FROM runs ORDER BY created_at DESC LIMIT 5;"
```