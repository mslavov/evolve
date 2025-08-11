# Evolve - Self-Improving AI Agents

> **Self-improving AI agents that evolve with every interaction**

Evolve is an advanced optimization framework that enables AI agents to continuously improve their performance through iterative learning, pattern recognition, and intelligent adaptation. Built to be framework-agnostic, Evolve can enhance AI agents built with Mastra, LangChain, or any TypeScript-based agent framework.

## 🚀 Vision

Traditional AI agents remain static after deployment, requiring manual intervention to improve their performance. Evolve changes this paradigm by creating agents that:

- **Learn from every interaction** - Continuously analyze performance and identify improvement opportunities
- **Adapt autonomously** - Implement optimizations without human intervention
- **Evolve strategically** - Use multi-agent collaboration and research-driven approaches
- **Work with any framework** - Integrate seamlessly with Mastra, LangChain, or custom implementations

## ✨ Key Features

### 🧠 Intelligent Evolution
- **Iterative Optimization**: Agents improve through multiple refinement cycles
- **Pattern Recognition**: Identify and learn from failure patterns
- **Research-Driven**: Integrate external knowledge for informed improvements
- **Convergence Detection**: Know when optimal performance is reached

### 🔌 Pluggable Architecture
- **Evaluation Strategies**: Numeric scoring, fact-based validation, or custom metrics
- **Framework Agnostic**: Works with Mastra, LangChain, or any TypeScript agent system
- **Extensible Agents**: Add custom optimization and research agents
- **Flexible Integration**: Drop-in enhancement for existing agents

### 📊 Advanced Analytics
- **Performance Tracking**: Monitor improvement across iterations
- **Pattern Analysis**: Understand systematic issues and their solutions
- **History Management**: Track evolution journey with full audit trail
- **Predictive Insights**: Anticipate optimization opportunities

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Flow Orchestrator             │
│  (Manages iterative optimization loop)  │
└────────────┬───────────────┬────────────┘
             │               │
    ┌────────▼──────┐ ┌─────▼──────┐
    │  Evaluation   │ │  Research  │
    │    Agent      │ │   Agent    │
    └───────────────┘ └────────────┘
             │               │
    ┌────────▼───────────────▼────────┐
    │      Optimization Agent         │
    │  (Implements improvements)      │
    └─────────────────────────────────┘
             │
    ┌────────▼────────┐
    │  Your AI Agent  │
    │ (Mastra/Lang-  │
    │  Chain/Custom)  │
    └─────────────────┘
```

### Layer Structure

```
┌─────────────┐
│     CLI     │  Commands & User Interface
├─────────────┤
│  Services   │  Business Logic & Orchestration
├─────────────┤
│   Agents    │  Specialized AI Agents
├─────────────┤
│ Repositories│  Data Access Layer (Drizzle ORM)
└─────────────┘
```

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Add your OpenAI or Anthropic API keys

# Initialize database
pnpm db:migrate
```

### Basic Usage

```bash
# Score content
pnpm score "Your content to score"

# Run iterative optimization
pnpm improve optimize baseconfig --iterations 10

# View evolution history
pnpm improve stats
```

### Programmatic Usage

```typescript
import { ImprovementService } from './services/improvement.service.js';

const service = new ImprovementService(db);
await service.initialize();

// Run iterative optimization
const result = await service.runIterativeOptimization({
  baseConfigKey: 'default',
  targetScore: 0.9,
  maxIterations: 10,
  evaluationStrategy: 'hybrid',
  enableResearch: true,
  verbose: true
});

console.log(`Evolution complete! Performance improved by ${result.result.totalImprovement * 100}%`);
```

## 🔧 Framework Integration

### Current Implementation (Mastra)

Evolve currently uses Mastra for agent orchestration, but the architecture is designed for framework independence:

```typescript
// Current Mastra integration
import { Agent } from '@mastra/core';

// Future: Framework adapters
import { MastraAdapter } from '@evolve/mastra';
import { LangChainAdapter } from '@evolve/langchain';
import { CustomAdapter } from '@evolve/custom';
```

### Planned Adapters

- **LangChain** - Complete LangChain.js support
- **Vercel AI SDK** - Integration with Vercel's AI toolkit
- **AutoGPT** - Enhance autonomous agents
- **CrewAI** - Multi-agent crew optimization
- **Custom** - Build your own adapter

## 📚 Core Concepts

### Evolution Strategies

1. **Prompt Evolution** - Iteratively refine prompts for better outputs
2. **Parameter Tuning** - Optimize temperature, tokens, and other parameters
3. **Model Selection** - Automatically choose the best model for the task
4. **Knowledge Integration** - Incorporate external research and best practices

### Evaluation Methods

Choose how to measure agent performance:

- **Numeric Scoring** - Traditional accuracy metrics (RMSE, MAE, correlation)
- **Fact-Based** - Validate factual correctness and completeness
- **Hybrid** - Combine multiple evaluation approaches
- **Custom** - Define your own evaluation criteria

### Multi-Agent Collaboration

Specialized agents working together:

- **Evaluation Agent** - Assesses current performance with pluggable strategies
- **Research Agent** - Finds improvement strategies from knowledge sources
- **Optimization Agent** - Implements enhancements based on research
- **Flow Orchestrator** - Coordinates the evolution process

## 📋 Commands

### Scoring & Evaluation

```bash
# Score content
pnpm score "Your content"

# Score with ground truth collection
pnpm score "Your content" --collect

# Evaluate current configuration
pnpm improve evaluate
```

### Assessment & Dataset Management

```bash
# List pending assessments
pnpm assess pending

# Add assessment
pnpm assess add <runId> correct
pnpm assess add <runId> incorrect --score 0.7

# Build dataset from assessments
pnpm dataset build

# Export dataset
pnpm dataset export -o dataset.json
```

### Configuration Management

```bash
# List configurations
pnpm config list

# Create new config
pnpm config set myconfig --model gpt-4o --temperature 0.3

# Set as default
pnpm config default myconfig
```

### Optimization

```bash
# Run basic optimization
pnpm improve optimize baseconfig

# Run iterative optimization (new!)
pnpm improve optimize baseconfig --iterations 10 --target 0.9

# Analyze prompt performance
pnpm improve analyze v1
```

## 🧪 Evaluation Strategies

### Registering Custom Evaluators

```typescript
class DomainSpecificEvaluator implements EvaluationStrategy {
  name = 'domain-specific';
  type = 'custom' as const;
  
  async evaluate(predictions: any[], groundTruth: any[]): Promise<EvaluationResult> {
    // Your custom evaluation logic
    return {
      score: calculateScore(predictions, groundTruth),
      metrics: { /* custom metrics */ },
      details: [ /* evaluation details */ ]
    };
  }
  
  generateFeedback(result: EvaluationResult): DetailedFeedback {
    // Generate domain-specific feedback
    return {
      summary: 'Custom evaluation results',
      strengths: [],
      weaknesses: [],
      actionItems: []
    };
  }
  
  isApplicable(context: EvaluationContext): boolean {
    return context.dataType === 'domain-specific';
  }
}

// Register and use
registry.register(new DomainSpecificEvaluator());
```

## 📊 Database Schema

- **runs**: Agent execution records with scores and reasoning
- **assessments**: Human/LLM assessments of scoring accuracy
- **eval_datasets**: Training/evaluation datasets built from assessments
- **configs**: Agent configurations (model, temperature, prompts)
- **prompts**: Prompt templates and variations
- **optimization_history**: Evolution tracking and checkpoints

## 🔬 Advanced Features

### Pattern Recognition

```typescript
// Analyze patterns across iterations
const patterns = patternAnalyzer.getPersistentPatterns(minIterations: 3);

// Get improvement suggestions from patterns
const improvements = patternAnalyzer.suggestImprovements(patterns);
```

### Checkpoint & Recovery

```typescript
// Save evolution state
const checkpoint = await evolve.saveCheckpoint();

// Resume from checkpoint
const result = await orchestrator.resumeFromState(checkpoint);
```

### Research Integration

```typescript
// Add custom knowledge sources
researcher.addKnowledgeSource({
  name: 'Internal Knowledge Base',
  query: async (topic) => await searchKnowledgeBase(topic)
});
```

## 🛠️ Development

```bash
# Build TypeScript
pnpm build

# Run tests
pnpm test

# Open database studio
pnpm db:studio

# Generate migrations
pnpm db:generate

# Run in development
pnpm dev <command>
```

## 📈 Roadmap

### Phase 1: Core Evolution Engine ✅
- ✅ Iterative optimization flow
- ✅ Multi-agent collaboration
- ✅ Pattern recognition
- ✅ Pluggable evaluation

### Phase 2: Framework Independence (Q2 2024)
- 🔄 Abstract agent interface
- 🔄 LangChain adapter
- 🔄 Vercel AI SDK support
- 🔄 Framework detection

### Phase 3: Advanced Intelligence (Q3 2024)
- 📋 AutoML for configurations
- 📋 Cross-agent learning
- 📋 Real-time adaptation
- 📋 Production monitoring

### Phase 4: Ecosystem (Q4 2024)
- 📋 Evaluator marketplace
- 📋 Community patterns
- 📋 Cloud platform
- 📋 Enterprise features

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md)
- [Advanced Optimization System](./docs/advanced-optimization-system.md)
- [API Reference](./docs/api/)
- [CLI Reference](./docs/api/cli-reference.md)
- [Database Reference](./docs/tech/database-reference.md)

## 🤝 Contributing

We welcome contributions! Whether you're:
- Adding framework support
- Creating custom evaluators
- Improving optimization strategies
- Enhancing documentation

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

## 🙏 Acknowledgments

Built with inspiration from:
- AutoGPT for autonomous agent concepts
- LangChain for agent framework patterns
- Mastra for current implementation
- The broader AI/ML community

---

**Evolve** - Because static agents are yesterday's technology. Let your AI grow smarter with every interaction.

*Currently implemented with Mastra, evolving to support all TypeScript agent frameworks!*