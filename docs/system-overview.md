# System Overview

## Project Summary

The **Self-Improving Content Usefulness Scorer** is an AI-powered system that evaluates text content usefulness on a 0-1 scale. It continuously improves its scoring accuracy through automated evaluation, prompt optimization, and model parameter tuning using Mastra framework integration.

## Technology Stack

- **Runtime**: Node.js with TypeScript (ES2022 target)
- **Framework**: [Mastra](https://mastra.ai) - AI agent orchestration framework
- **LLM Providers**: 
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Anthropic (Claude 3 Haiku, Claude 3.5 Sonnet)
- **Storage**: Unified SQLite database via LibSQL client
  - Scoring records and agent configurations in same database
  - Abstracted storage interfaces for flexibility
  - Support for alternative backends (JSON, in-memory for testing)
- **CLI Framework**: Commander.js
- **Build Tools**: TypeScript compiler (tsc), tsx for development
- **Package Manager**: pnpm (recommended) or npm

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────┐
│                   CLI Interface                  │
│              (Commander.js based)                │
└─────────────────────────────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
┌───▼────┐      ┌───────▼───────┐    ┌─────▼──────┐
│ Agents │      │  Collectors   │    │ Evaluators │
│        │      │               │    │            │
│ Scoring│◄────►│   Storage     │◄──►│Performance │
│  Agent │      │  Abstraction  │    │  Analysis  │
└────────┘      └───────┬───────┘    └────────────┘
    │                   │                    │
    │           ┌───────▼───────┐           │
    └──────────►│ Unified SQLite│◄──────────┘
                │   Database     │
                │ • Scoring Data │
                │ • Configs      │
                │ • Ground Truth │
                └────────────────┘
```

### Key Features

1. **Multi-dimensional Scoring**
   - Evaluates content across 5 dimensions: relevance, accuracy, completeness, clarity, and actionability
   - Provides overall score (0-1) with detailed reasoning

2. **Self-Improvement Loop**
   - Records all scoring operations with metadata
   - Evaluates performance against ground truth
   - Optimizes model selection, temperature, and prompts
   - A/B tests improvements

3. **Human-in-the-Loop**
   - Collects ground truth labels from humans
   - Builds benchmark datasets
   - Validates model improvements

4. **Performance Metrics**
   - Mean Absolute Error (MAE)
   - Root Mean Square Error (RMSE)
   - Pearson correlation
   - Consistency scoring
   - Bias detection

## Core Components

### 1. Usefulness Scorer Agent (`/src/agents/usefulness-scorer.ts`)
The main AI agent that performs content scoring using Mastra framework:
- Configurable model selection (GPT-4, Claude)
- Temperature and token control
- Prompt version management
- Structured output with Zod schemas

### 2. Storage Layer (`/src/storage/`)
Flexible storage abstraction with multiple implementations:
- **Interfaces** (`interfaces.ts`): Storage contracts for scoring and configuration
- **SQLite Storage** (`sqlite/`): Production storage using unified database
- **JSON Storage** (`json/`): Optional lightweight config storage for development
- **Memory Storage** (`memory/`): In-memory implementation for testing
- **Factory Pattern** (`factory.ts`): Configurable storage backend selection

### 3. Scoring Collector (`/src/collectors/scoring-collector.ts`)
Facade over storage layer:
- Maintains backward compatibility
- Delegates to storage interfaces
- Records scoring history with full metadata
- Tracks ground truth labels
- Provides statistical aggregations

### 4. Scoring Evaluator (`/src/evaluators/scoring-evaluator.ts`)
Analyzes scoring performance:
- Calculates accuracy metrics (MAE, RMSE)
- Measures correlation with ground truth
- Assesses scoring consistency
- Generates performance reports

### 5. Configuration Optimizer (`/src/optimizers/config-optimizer.ts`)
Improves scoring accuracy:
- Tests different model configurations
- Optimizes temperature settings
- Analyzes error patterns
- Recommends improvements
- **Saves optimal configurations to database**

### 6. Prompt Library (`/src/prompts/prompt-library.ts`)
Manages scoring prompts:
- Version control for prompts
- Performance tracking per prompt
- Chain-of-thought variations
- Few-shot examples

### 7. CLI Interface (`/src/cli/index.ts`)
Command-line interface for all operations:
- Interactive scoring mode
- Benchmark evaluation
- Performance dashboard
- Ground truth collection
- **Configuration management commands**

## Data Flow

1. **Input Phase**
   - User provides content via CLI or file
   - Content type detection (code, text, list)
   - Length and metadata extraction

2. **Scoring Phase**
   - Agent processes content with current configuration
   - Generates structured score with reasoning
   - Records dimensional breakdown

3. **Collection Phase**
   - Stores scoring record in SQLite
   - Optionally collects human ground truth
   - Calculates performance metrics

4. **Evaluation Phase**
   - Aggregates scoring records
   - Computes accuracy metrics
   - Identifies error patterns

5. **Optimization Phase**
   - Tests alternative configurations
   - Validates improvements
   - Updates optimal settings

## Environment Configuration

### Required Environment Variables
```env
# LLM API Keys
OPENAI_API_KEY=sk-...          # For GPT models
ANTHROPIC_API_KEY=sk-ant-...   # For Claude models
```

### Storage Configuration
The system uses a unified SQLite database for both scoring records and configurations:
- **Database File**: `./scoring-data.db`
- **Tables**: 
  - `scoring_records` - Scoring history and ground truth
  - `agent_configs` - Saved configurations
  - `config_defaults` - Default configuration setting

Configurations are persisted and survive process restarts. Use CLI commands to manage:
```bash
npm run config save <name>     # Save current configuration
npm run config load <name>     # Load saved configuration
npm run config set-default <name>  # Set default configuration
```

### MCP Server Integration
The project supports Model Context Protocol (MCP) servers:
- **context7**: Context management and retrieval
- **mastra-docs**: Access to Mastra documentation and examples

## Security Considerations

- API keys stored in environment variables
- Local SQLite database (no remote connections)
- No sensitive data logging
- Input sanitization for database operations
- Type-safe interfaces with Zod validation

## Performance Targets

- **MAE**: < 0.1 (10% average error)
- **Correlation**: > 0.85 with ground truth
- **Consistency**: > 0.9 for similar content
- **Response Time**: < 2 seconds per scoring
- **Database Size**: Optimized for 100K+ records

## Development Workflow

1. **Setup**: Install dependencies with `pnpm install`
2. **Development**: Run with `pnpm dev` (uses tsx)
3. **Build**: Compile with `pnpm build` (TypeScript)
4. **Test**: Run benchmarks with `pnpm benchmark`
5. **Deploy**: Build and run from `dist/` folder

## Future Enhancements

- Web UI dashboard
- Batch processing capabilities
- Multi-language support
- Custom scoring dimensions
- Export/import functionality
- API endpoint deployment
- Real-time collaboration features