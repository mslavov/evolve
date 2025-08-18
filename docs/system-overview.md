# System Overview

## Project Summary

**Evolve** is a framework for building self-improving AI agents that evolve with every interaction. It enables agents to continuously improve their performance through automated evaluation, prompt optimization, and model parameter tuning. While currently implemented with Mastra framework, Evolve's architecture supports any TypeScript-based agent framework.

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

### 1. Agent System (`/src/services/agents/`)
Specialized AI agents for prompt optimization:
- **Prompt Research Agent**: Analyzes prompt weaknesses and researches improvement strategies
- **Prompt Engineer Agent**: Implements prompt improvements based on research findings
- Configurable model selection (GPT-4, Claude)
- Temperature and token control
- Structured output with JSON schemas

### 2. Repository Layer (`/src/repositories/`)
Data access layer using Drizzle ORM:
- **Agent Repository**: Manages agent configurations and defaults
- **Run Repository**: Stores execution history and results
- **Assessment Repository**: Tracks human assessments of runs
- **Dataset Repository**: Manages evaluation datasets
- **Prompt Repository**: Version control for prompts

### 3. Service Layer (`/src/services/`)
Business logic and orchestration:
- **Agent Service**: Manages agent lifecycle and execution
- **Assessment Service**: Handles run assessments and dataset building
- **Improvement Service**: Coordinates both grid search and iterative optimization
- **Iterative Optimization Service**: Implements AI-driven prompt improvement loop
- **Grid Search Service**: Parameter exploration and configuration optimization
- **Cost Tracker Service**: Budget management and cost estimation
- **Prompt Service**: Dynamic prompt management and versioning

### 4. Evaluation System (`/src/services/evaluation/`)
Streamlined evaluation system:
- **Evaluation Service**: Core agent performance testing
- **Output Evaluator**: Compares actual vs expected outputs
- Performance metrics (MAE, RMSE, similarity scores)
- Support for different output types (structured, text)

### 5. Optimization Services
Two main optimization approaches:
- **Iterative Optimization**: AI-driven prompt improvement with convergence detection
- **Grid Search**: Systematic parameter exploration (models, temperatures, prompts)
- Both services include budget enforcement and cost tracking
- Automatic agent versioning and database persistence

### 6. Prompt Library (`/src/prompts/prompt-library.ts`)
Manages scoring prompts:
- Version control for prompts
- Performance tracking per prompt
- Chain-of-thought variations
- Few-shot examples

### 7. CLI Interface (`/src/cli/`)
Command-line interface for all operations:
- `run` - Execute agents with various inputs
- `agent` - Manage agent configurations
- `assess` - Human assessment of runs
- `improve` - Iterative optimization
- `prompt` - Prompt management
- `dataset` - Dataset operations

## Data Flow

1. **Input Phase**
   - User provides content via CLI or JSON file
   - Support for structured data and metadata
   - Content validation with Zod schemas

2. **Execution Phase**
   - Agent processes content with current configuration
   - Generates structured output
   - Records run in database

3. **Assessment Phase**
   - Human assessment of run results
   - Build evaluation datasets from assessments
   - Track performance metrics

4. **Evaluation Phase**
   - Multiple evaluation strategies
   - Pattern analysis and failure identification
   - Feedback synthesis

5. **Optimization Phase**
   - AI-driven prompt research and engineering
   - Iterative refinement with convergence detection
   - Grid search for parameter optimization
   - Automatic agent versioning and updates

## Environment Configuration

### Required Environment Variables
```env
# LLM API Keys
OPENAI_API_KEY=sk-...          # For GPT models
ANTHROPIC_API_KEY=sk-ant-...   # For Claude models
```

### Storage Configuration
The system uses a unified SQLite database managed with Drizzle ORM:
- **Database File**: `./scoring-data.db`
- **Tables**: 
  - `agents` - Agent configurations and system agents
  - `runs` - Execution history and results
  - `assessments` - Human assessments of runs
  - `eval_datasets` - Evaluation datasets
  - `prompts` - Prompt versions and templates

Agents are persisted and survive process restarts. Use CLI commands to manage:
```bash
pnpm cli agent list              # List all agents
pnpm cli agent set <key>         # Create or update an agent
pnpm cli agent default <key>     # Set default agent
pnpm cli agent clone <src> <dst> # Clone an existing agent
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