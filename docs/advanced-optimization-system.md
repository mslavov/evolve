# Evolve - Advanced Optimization System

## Overview

**Evolve** implements a streamlined, AI-driven optimization approach that enables agents to continuously improve through intelligent prompt engineering. The system features two primary optimization modes: iterative AI-driven improvement and systematic grid search, both with built-in budget controls and cost tracking.

## Architecture

### Core Components

#### 1. Iterative Optimization Service (`src/services/iterative-optimization.service.ts`)
- Manages AI-driven optimization loops
- Coordinates prompt research and engineering agents
- Implements convergence detection
- Creates versioned prompts and agents

#### 2. Grid Search Service (`src/services/grid-search.service.ts`) 
- Systematic parameter exploration
- Tests combinations of models, temperatures, and prompts
- Parallel configuration testing
- Performance metric tracking

#### 3. AI Agent System
- **Prompt Research Agent** (`src/services/agents/prompt-research.agent.ts`): Analyzes weaknesses and researches improvements
- **Prompt Engineer Agent** (`src/services/agents/prompt-engineer.agent.ts`): Implements improvements based on research

#### 4. Cost Management (`src/services/cost-tracker.service.ts`)
- Pre-flight cost estimation
- Budget enforcement (default $10 limit)
- Real-time cost tracking
- Budget alerts and warnings

## Features

### AI-Driven Iterative Optimization

The system performs intelligent optimization through research and engineering cycles:

```typescript
const result = await improvementService.runIterativeOptimization({
  baseAgentKey: 'my-agent',
  targetScore: 0.9,
  maxIterations: 10,
  verbose: true
});
```

#### How It Works:
1. **Evaluate** current agent performance
2. **Research** improvement strategies using AI
3. **Engineer** improved prompts based on research
4. **Test** new configuration
5. **Repeat** until convergence or target reached

### Grid Search Optimization

Systematic exploration of parameter space:

```typescript
const result = await improvementService.optimizeConfiguration({
  baseAgentKey: 'my-agent',
  variations: {
    models: ['gpt-4o', 'gpt-4o-mini'],
    temperatures: [0.3, 0.5, 0.7],
    promptIds: ['v1', 'v2']
  },
  sampleSize: 100
});
```

### Convergence Detection

The system automatically detects when optimization has plateaued:

```typescript
interface ConvergenceConfig {
  targetScore: number;                    // Stop when this score is reached
  maxIterations: number;                  // Maximum iterations allowed
  maxConsecutiveNoImprovement: number;    // Stop after N iterations without improvement
  minImprovementThreshold: number;        // Minimum improvement to continue
}
```

### Budget Management

All optimization operations include budget controls:

```typescript
// With budget enforcement (default)
await improvementService.runIterativeOptimization({
  baseAgentKey: 'agent',
  maxBudget: 5.00  // Override default $10 limit
});

// Disable budget checks (use with caution!)
await improvementService.runIterativeOptimization({
  baseAgentKey: 'agent',
  noBudget: true
});
```

## Usage

### Basic Iterative Optimization

```typescript
import { ImprovementService } from './services/improvement.service.js';
import { getDatabase } from './db/client.js';

const db = getDatabase();
const service = new ImprovementService(db);

// Run AI-driven optimization
const result = await service.runIterativeOptimization({
  baseAgentKey: 'scorer-agent',
  targetScore: 0.85,
  maxIterations: 5,
  verbose: true
});

console.log(`Final score: ${result.finalScore}`);
console.log(`Iterations: ${result.iterations.length}`);
console.log(`Converged: ${result.converged}`);
```

### Parameter Exploration with Grid Search

```typescript
// Explore different configurations
const result = await service.optimizeConfiguration({
  baseAgentKey: 'base-agent',
  variations: {
    models: ['gpt-4o', 'claude-3-haiku'],
    temperatures: [0.1, 0.3, 0.5, 0.7],
    promptIds: ['concise', 'detailed', 'cot']
  },
  sampleSize: 50
});

console.log(`Best configuration:`);
console.log(`  Model: ${result.bestAgent.model}`);
console.log(`  Temperature: ${result.bestAgent.temperature}`);
console.log(`  Score: ${result.results[0].score}`);
```

### CLI Usage

```bash
# Iterative AI-driven optimization
pnpm cli improve <agent-key> --target 0.9 --max-iterations 10

# Grid search exploration
pnpm cli improve <agent-key> --explore \
  --models gpt-4o,gpt-4o-mini \
  --temperatures 0.3,0.5,0.7 \
  --sample-size 100

# With budget override
pnpm cli improve <agent-key> --max-budget 20

# Disable budget checks (dangerous!)
pnpm cli improve <agent-key> --no-budget
```

## Configuration

### Optimization Parameters

```typescript
interface IterativeOptimizationParams {
  baseAgentKey: string;      // Agent to optimize
  targetScore?: number;       // Target score (default: 0.8)
  maxIterations?: number;     // Max iterations (default: 5)
  verbose?: boolean;          // Detailed logging
}

interface GridSearchParams {
  baseAgentKey: string;
  variations: {
    models?: string[];        // Models to test
    temperatures?: number[];  // Temperature values
    promptIds?: string[];     // Prompt versions
    maxTokens?: number[];     // Token limits
  };
  dataset?: {
    limit?: number;          // Sample size for testing
  };
}
```

### AI Agent Requirements

The system requires two specialized agents to be configured in the database:
- `prompt_researcher`: Analyzes and researches improvements
- `prompt_engineer`: Implements prompt enhancements

These agents should be created with appropriate prompts for their respective tasks.

## How the AI Agents Work

### Prompt Research Agent

Analyzes current performance and identifies improvement opportunities:

```typescript
interface PromptResearchOutput {
  issues: string[];                    // Identified problems
  rootCauses: string[];                // Underlying causes
  recommendations: Array<{
    technique: string;                 // Improvement technique
    rationale: string;                 // Why it should work
    priority: 'high' | 'medium' | 'low';
  }>;
  implementationStrategy: string;      // How to apply improvements
}
```

### Prompt Engineer Agent

Implements the improvements suggested by research:

```typescript
interface PromptEngineeringOutput {
  improvedPrompt: string;              // New optimized prompt
  appliedTechniques: string[];        // What was changed
  changesSummary: string;             // Human-readable summary
  expectedImprovement: number;        // Predicted score increase
}
```

## Performance Characteristics

### Time Complexity
- **Iterative**: O(iterations × dataset_size)
- **Grid Search**: O(configurations × dataset_size)

### Cost Estimates
- **Iterative**: ~$0.50-2.00 per optimization run
- **Grid Search**: ~$0.01-0.05 per configuration tested

### Typical Performance
- Iterative optimization: 3-5 iterations to convergence
- Grid search: Tests all combinations systematically
- Evaluation: 20-100 samples per test (configurable)

## Best Practices

### 1. Start with Grid Search
Use grid search to find a good baseline configuration:
```bash
pnpm cli improve agent --explore --sample-size 50
```

### 2. Refine with Iterative Optimization
Use the best configuration from grid search as a starting point:
```bash
pnpm cli improve optimized-agent --target 0.9
```

### 3. Monitor Costs
Always check cost estimates before running:
```typescript
// The system will show estimates before proceeding
// Example: "Estimated cost: $1.23"
```

### 4. Use Appropriate Sample Sizes
- Development: 20-50 samples for quick iteration
- Production: 100-200 samples for reliable results

### 5. Set Realistic Targets
- 0.7-0.8: Good baseline performance
- 0.8-0.9: Excellent performance
- >0.9: May require many iterations

## Troubleshooting

### Common Issues

1. **"Agent not found" errors**
   - Ensure `prompt_researcher` and `prompt_engineer` agents exist
   - Check agent keys are spelled correctly

2. **Budget exceeded**
   - Reduce sample size or iteration count
   - Increase budget limit if needed
   - Use `--no-budget` only for testing

3. **No improvement after iterations**
   - Check if target score is realistic
   - Verify test dataset quality
   - Consider different base prompts

4. **Slow optimization**
   - Reduce sample size for faster iteration
   - Use fewer parameter variations in grid search
   - Consider using cheaper models for initial testing

## Implementation Details

### Prompt Versioning
Every optimization creates versioned prompts:
```
original_v1 → v1_optimized_1234567890 → v1_optimized_1234567891
```

### Agent Versioning
New agents are created with optimization metadata:
```
scorer → scorer_opt_1234567890 → scorer_opt_1234567891
```

### Database Persistence
All optimization results are saved:
- Agent configurations
- Prompt versions
- Performance metrics
- Optimization history

## Future Enhancements

### Near Term
- Parallel evaluation for faster testing
- Caching for repeated evaluations
- Rollback mechanism for failed optimizations
- More sophisticated convergence detection

### Long Term
- Multi-objective optimization
- Transfer learning between agents
- Automatic hyperparameter tuning
- Real-time performance monitoring

## Why This Approach?

The simplified architecture provides:

1. **Focused Optimization**: Two specialized AI agents working together
2. **Cost Control**: Built-in budget management prevents runaway costs
3. **Flexibility**: Choose between systematic exploration or intelligent improvement
4. **Transparency**: Clear versioning and history tracking
5. **Reliability**: Convergence detection prevents infinite loops

---

**Evolve** - Simple, intelligent, cost-effective agent optimization.