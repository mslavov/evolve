# Self-Improving Content Scorer

A self-improving AI system that scores content usefulness, learns from human assessments, and builds evaluation datasets from real-world usage.

## Architecture

The system follows a clean 3-layer architecture:

```
┌─────────────┐
│     CLI     │  Commands & User Interface
├─────────────┤
│  Services   │  Business Logic
├─────────────┤
│ Repositories│  Data Access Layer (Drizzle ORM)
└─────────────┘
```

### Layer Responsibilities

- **CLI Layer** (`src/cli/`): Command parsing, user I/O, formatting
- **Service Layer** (`src/services/`): All business logic
  - `AgentService`: AI scoring and configuration management
  - `AssessmentService`: Human assessments and dataset building
  - `ImprovementService`: Performance optimization
- **Repository Layer** (`src/repositories/`): Database operations using Drizzle ORM
- **Database Schema** (`src/db/schema/`): Type-safe table definitions

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
# Add your OpenAI or Anthropic API keys
```

3. Initialize database:
```bash
npm run db:migrate
```

## Usage

### Score Content
```bash
npm run cli score "Your content to score"

# With collection for assessment
npm run cli score "Your content" --collect
```

### Manage Assessments
```bash
# List pending runs
npm run cli assess pending

# Add assessment
npm run cli assess add <runId> correct
npm run cli assess add <runId> incorrect --score 0.7 --reasoning "Should be higher"

# View statistics
npm run cli assess stats
```

### Build Datasets
```bash
# Build from assessments
npm run cli dataset build

# Export dataset
npm run cli dataset export -o dataset.json

# View statistics
npm run cli dataset stats
```

### Configuration Management
```bash
# List configurations
npm run cli config list

# Create new config
npm run cli config set myconfig --model gpt-4o --temperature 0.3

# Set as default
npm run cli config default myconfig
```

### Improve Performance
```bash
# Optimize configuration
npm run cli improve optimize baseconfig

# Evaluate current performance
npm run cli improve evaluate

# Analyze prompt performance
npm run cli improve analyze v1
```

## Database Management

```bash
# Generate migrations after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio for database inspection
npm run db:studio
```

## Database Schema

- **runs**: Agent execution records with scores and reasoning
- **assessments**: Human/LLM assessments of scoring accuracy
- **eval_datasets**: Training/evaluation datasets built from assessments
- **configs**: Scorer configurations (model, temperature, prompts)
- **scoring_records**: Historical scoring data for analysis

## Development

```bash
# Build TypeScript
npm run build

# Run CLI in development
npm run cli --help
```

## Clean Architecture Benefits

- **Separation of Concerns**: Each layer has clear responsibilities
- **Testability**: Services can be tested independently
- **Maintainability**: Business logic is centralized in services
- **Type Safety**: Full TypeScript support with Drizzle ORM
- **Single Database Instance**: Connection managed via singleton pattern