# Evolve - Self-Improving AI Agents Development Workflow

## 🚀 Project Overview
Evolve is a self-improving AI agent optimization framework that enables continuous performance improvement through iterative learning, pattern recognition, and intelligent adaptation. The system is framework-agnostic and can enhance AI agents built with Mastra, LangChain, or any TypeScript-based agent framework.

## Development Workflow

### 1️⃣ Understanding the System
Before implementing any changes:
- Review `README.md` for comprehensive project overview
- Check `docs/system-overview.md` for architecture details
- Read `docs/advanced-optimization-system.md` for optimization strategies
- Review existing agent implementations in `src/agents/`

### 2️⃣ Working with Agents
The system uses specialized AI agents for different tasks:
- **Evaluation Agent**: Assesses performance with pluggable strategies
- **Research Agent**: Finds improvement strategies from knowledge sources
- **Optimization Agent**: Implements enhancements based on research
- **Flow Orchestrator**: Coordinates the evolution process

### 3️⃣ Common Development Tasks

#### Running the CLI
```bash
# View all available commands
pnpm cli --help

# Agent management
pnpm cli agent list
pnpm cli agent create <key>
pnpm cli agent show <key>

# Run agent with content
pnpm cli run "Your content" --agent <agent-key>

# Assess runs and build datasets
pnpm cli assess pending
pnpm cli dataset build

# Run optimization
pnpm cli improve optimize <agent-key> --iterations 10
```

#### Database Operations
```bash
# Run migrations
pnpm db:migrate

# Check migration status
pnpm db:status

# Open database studio
pnpm db:studio

# Reset database
pnpm db:reset
```

### 4️⃣ Testing & Quality Checks
Before committing changes:
```bash
# Build TypeScript
pnpm build

# Run tests
pnpm test

# Run linting (if configured)
pnpm lint
```

### 5️⃣ Documentation Updates
After implementing changes:
- Update relevant documentation in `docs/` directory
- Keep API references current in `docs/api/`
- Update CLI reference if commands change
- Document new features or components

## 📁 Project Structure

```
evolve/
├── src/
│   ├── cli/           # Command-line interface
│   ├── agents/        # AI agent implementations
│   ├── services/      # Business logic & orchestration
│   ├── repositories/  # Data access layer (Drizzle ORM)
│   ├── db/           # Database schema & migrations
│   └── types/        # TypeScript type definitions
├── docs/             # Project documentation
├── data/            # Database files
└── examples/        # Example inputs and outputs
```

## 🔑 Key Technologies
- **TypeScript**: Primary language
- **Drizzle ORM**: Database operations with SQLite
- **Commander**: CLI framework
- **AI SDKs**: OpenAI and Anthropic integrations
- **Vitest**: Testing framework

## 🎯 Development Focus Areas

### Current Implementation
- Agent management system with versioning
- Iterative optimization flow with convergence detection
- Pattern recognition and analysis
- Pluggable evaluation strategies
- Multi-agent collaboration

### Architecture Principles
- Framework-agnostic design for future adapter support
- Modular agent system for extensibility
- Clear separation between CLI, services, and data layers
- Type-safe database operations with Drizzle ORM

## Environment Setup
1. Copy `.env.example` to `.env`
2. Add your API keys (OpenAI or Anthropic)
3. Run `pnpm install` to install dependencies
4. Run `pnpm db:migrate` to initialize database

## Important Notes
- The system is designed to be framework-agnostic but currently uses a custom implementation
- Agent keys are required for all operations (no default agent concept)
- All agents have versioning support with history tracking
- The optimization process is iterative and research-driven