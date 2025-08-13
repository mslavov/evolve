# Evolve Documentation

Welcome to **Evolve** - the framework for building self-improving AI agents that evolve with every interaction. This documentation covers the complete system architecture, APIs, and integration guides.

## 📚 Core Documentation

### [System Overview](./system-overview.md)
Complete architectural overview of the Evolve framework, including multi-agent orchestration, evolution strategies, and data flow.

### [Advanced Optimization System](./advanced-optimization-system.md)
Deep dive into the iterative optimization engine, pluggable evaluation strategies, and multi-agent collaboration.

## 🛠 Technical Documentation

### API References
- **[CLI Reference](./api/cli-reference.md)** - Complete command-line interface documentation with examples
- **[Module Reference](./api/module-reference.md)** - Detailed API documentation for all TypeScript modules

### Database
- **[Database Reference](./tech/database-reference.md)** - SQLite schema, queries, and maintenance guide

## 🚀 Quick Start Guides

### Getting Started
```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Add your OpenAI/Anthropic API keys

# Run first agent
pnpm cli run "Your content here"
# Or with JSON input:
pnpm cli run --input-file input.json

# View dashboard
pnpm dashboard
```

### Essential Commands
- `pnpm cli run [content]` - Run agent with input (text or JSON)
- `pnpm cli run --input-file [path]` - Run with structured JSON input
- `pnpm evaluate` - Evaluate performance
- `pnpm improve` - Optimize configuration
- `pnpm benchmark` - Run benchmark tests
- `pnpm dashboard` - View statistics

## 📂 Project Structure

```
evolve/
├── src/
│   ├── cli/             # Command-line interface
│   │   └── commands/    # CLI commands (run, agent, assess, improve)
│   ├── services/        # Business logic services
│   │   ├── agents/      # AI agents (evaluation, research, optimization)
│   │   └── orchestration/ # Flow orchestrator and state management
│   ├── repositories/    # Data access layer
│   ├── db/              # Database schema and migrations
│   ├── schemas/         # Zod validation schemas
│   └── types/           # TypeScript definitions
├── docs/
│   ├── api/             # API documentation
│   ├── guides/          # User guides
│   └── system-overview.md
├── .claude/
│   └── rules/           # Project-specific rules
│       ├── build-and-compile.md
│       └── mcp-servers.md
└── dist/                # Compiled JavaScript
```

## 🔧 Configuration

### Environment Variables
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=gpt-4o-mini
DEFAULT_TEMPERATURE=0.3
DEFAULT_MAX_TOKENS=500
```

### Available Models
- `gpt-4o-mini` - Fast OpenAI model
- `gpt-4o` - Advanced OpenAI model  
- `claude-3-haiku` - Fast Anthropic model
- `claude-3-sonnet` - Advanced Anthropic model

## 📊 Key Features

### Content Scoring
- **0-1 scale** usefulness evaluation
- **Multi-dimensional** analysis (relevance, accuracy, completeness, clarity, actionability)
- **Multiple LLM** support
- **Structured output** with reasoning

### Self-Improvement
- **Automated evaluation** against ground truth
- **Configuration optimization** (model, temperature, prompts)
- **Error pattern analysis**
- **A/B testing** of improvements

### Performance Metrics
- **MAE** (Mean Absolute Error) - Target < 0.1
- **RMSE** (Root Mean Square Error)
- **Correlation** - Target > 0.85
- **Consistency** - Target > 0.9
- **Bias detection**

## 🧬 Evolution Framework

### What Makes Evolve Different

Evolve transforms static AI agents into continuously learning systems that:

- **Learn** - Analyze performance patterns and identify improvement opportunities
- **Adapt** - Automatically implement optimizations based on research
- **Evolve** - Iterate through refinement cycles until optimal performance
- **Integrate** - Work with any TypeScript agent framework (Mastra, LangChain, custom)

### Framework-Agnostic Design

While currently implemented with Mastra, Evolve's architecture supports any TypeScript-based agent framework through adapters:

```typescript
// Future adapter pattern
const evolve = new Evolve({
  adapter: new YourFrameworkAdapter(agent),
  evaluationStrategy: 'hybrid',
  targetPerformance: 0.9
});
```

## 🏗 Development Workflow

### Build & Test
```bash
# Development mode
pnpm dev [command]

# Build TypeScript
pnpm build

# Run linting
pnpm lint
pnpm lint:fix

# Type checking
pnpm exec tsc --noEmit
```

### Database Management
```bash
# Run migrations
pnpm db:migrate

# View database
sqlite3 scoring-data.db

# Backup database
cp scoring-data.db scoring-data.backup.db

# Query examples
sqlite3 scoring-data.db "SELECT COUNT(*) FROM runs;"
sqlite3 scoring-data.db "SELECT * FROM agents;"
```

## 📋 Project Rules

### Build Requirements
- Always run `pnpm build` after code changes
- Fix TypeScript errors before proceeding
- Address ESLint warnings
- Test functionality after changes

### MCP Servers
- **context7** - Context management
- **mastra-docs** - Mastra documentation access

## 🎯 Usage Examples

### Basic Agent Run
```bash
pnpm cli run "What is machine learning?"
```

### File-based Input
```bash
pnpm cli run --input-file article.json
```

### Run with Output Collection
```bash
pnpm cli run "Advanced React patterns" --collect --output-file results.json
```

### Performance Evaluation
```bash
pnpm evaluate -- -l 50
```

### Configuration Optimization
```bash
pnpm improve -- --auto
```

## 🔗 External Resources

### Dependencies
- [Mastra Framework](https://mastra.ai) - AI agent orchestration
- [OpenAI SDK](https://github.com/openai/openai-node) - GPT model access
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Claude model access
- [LibSQL Client](https://github.com/libsql/libsql-client-ts) - SQLite database
- [Commander.js](https://github.com/tj/commander.js) - CLI framework

### Related Documentation
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Zod Schema Validation](https://zod.dev/)

## 📝 Contributing

### Code Style
- TypeScript with strict mode
- ES modules (ESM)
- Async/await for asynchronous code
- Zod for schema validation

### Commit Guidelines
- Clear, descriptive messages
- Reference issue numbers
- Test before committing
- Update documentation

## 🆘 Troubleshooting

### Common Issues
1. **Missing API Keys** - Set environment variables
2. **Build Errors** - Run `pnpm build` and fix TypeScript issues
3. **Database Locked** - Close other connections
4. **Import Errors** - Use `.js` extensions in imports

### Support
- Check [System Overview](./system-overview.md) for architecture details
- Review [CLI Reference](./api/cli-reference.md) for command help
- Consult [Database Reference](./tech/database-reference.md) for data issues

## 🚦 Performance Targets

| Metric | Target | Description |
|--------|--------|-------------|
| MAE | < 0.1 | Average prediction error |
| Correlation | > 0.85 | Agreement with ground truth |
| Consistency | > 0.9 | Stability across similar content |
| Response Time | < 2s | Time per scoring operation |

## 📅 Roadmap

### Planned Features
- Web UI dashboard
- Batch processing API
- Multi-language support
- Custom scoring dimensions
- Real-time collaboration
- Cloud deployment options

---

*Last updated: January 2025*