# Development Guide

## Project Conventions

### Code Style

#### TypeScript Conventions
- **Strict Mode**: TypeScript strict mode is enabled
- **Module System**: ES modules with `.js` extensions in imports
- **Type Safety**: Explicit typing preferred, `any` requires eslint disable comment
- **Async/Await**: Used for all asynchronous operations

#### File Organization
```
src/
├── agents/          # AI agent implementations
├── cli/             # CLI entry points
├── collectors/      # Data persistence layer
├── datasets/        # Static data and benchmarks
├── evaluators/      # Performance analysis
├── optimizers/      # Configuration optimization
├── prompts/         # Prompt template management
└── types/           # Shared type definitions
```

#### Naming Conventions
- **Files**: Kebab-case (`usefulness-scorer.ts`)
- **Classes**: PascalCase (`UsefulnessScorer`)
- **Functions**: camelCase (`calculateMetrics`)
- **Constants**: UPPER_SNAKE_CASE (`BENCHMARK_DATASET`)
- **Interfaces**: PascalCase with descriptive names (`ScoringResult`)

### Import Patterns

#### Module Imports
```typescript
// External packages first
import { Command } from 'commander';
import chalk from 'chalk';
import { z } from 'zod';

// Internal modules with .js extension
import { UsefulnessScorer } from '../agents/usefulness-scorer.js';
import { ScoringConfig, ScoringResult } from '../types/index.js';
```

#### Dynamic Imports
```typescript
// For conditional or lazy loading
const { createClient } = await import('@libsql/client');
```

### Error Handling

#### Try-Catch Pattern
```typescript
try {
  const result = await scorer.score(content);
  spinner.succeed();
  return result;
} catch (error) {
  spinner.fail('Scoring failed');
  console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  throw error;
}
```

#### Error Messages
- User-facing: Clear, actionable messages with chalk formatting
- Debug: Include stack traces and detailed context
- Validation: Use Zod for input validation with descriptive errors

### Storage Patterns

#### Storage Abstraction
The project uses a storage abstraction layer with interfaces:
```typescript
// Use factory to get storage instances
import { getDefaultStorageFactory } from './storage/factory.js';

const factory = getDefaultStorageFactory();
const scoringStorage = factory.createScoringStorage();
const configStorage = factory.createConfigStorage();

// Initialize before use
await scoringStorage.initialize();
await configStorage.initialize();
```

#### Unified Database
Production uses a single SQLite database for all data:
```typescript
// src/storage/config.ts
export const productionConfig: StorageConfig = {
  type: 'sqlite',
  scoring: {
    type: 'sqlite',
    options: { url: 'file:./scoring-data.db' }
  },
  config: {
    type: 'sqlite',
    options: { url: 'file:./scoring-data.db' }  // Same database
  }
};
```

#### Test Storage
Use in-memory storage for testing:
```typescript
import { TestStorageFactory } from './storage/factory.js';

const factory = new TestStorageFactory();
// All data stored in memory, no files created
```

#### Parameterized Queries
```typescript
await db.execute({
  sql: 'SELECT * FROM scoring_records WHERE id = ?',
  args: [id]
});
```

### CLI Patterns

#### Command Structure
```typescript
program
  .command('score [content]')
  .description('Score content usefulness')
  .option('-g, --ground-truth', 'Collect ground truth')
  .action(async (content, options) => {
    await this.scoreContent(content, options);
  });
```

#### Progress Indicators
```typescript
const spinner = ora('Processing...').start();
try {
  // Operation
  spinner.succeed('Complete');
} catch (error) {
  spinner.fail('Failed');
}
```

### Testing Patterns

#### Benchmark Testing
```typescript
const items = getRandomBenchmarkItems(count);
for (const item of items) {
  const result = await scorer.score(item.content);
  const error = Math.abs(result.score - item.groundTruth);
  // Record metrics...
}
```

### AI Agent Patterns

#### Agent Configuration
```typescript
new Agent({
  name: 'Usefulness Scorer',
  instructions: prompt,
  model: model as any
});
```

#### Structured Output
```typescript
const response = await agent.generate(prompt, {
  output: scoringSchema  // Zod schema
});
```

## Development Workflow

### Initial Setup
```bash
# Clone repository
git clone <repo-url>
cd self-improving-scorer

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with API keys

# Verify setup
pnpm build
pnpm dev dashboard
```

### Development Cycle

#### 1. Code Changes
```bash
# Make changes in src/
# Run TypeScript compiler
pnpm build

# Fix any errors
pnpm exec tsc --noEmit

# Fix linting issues  
pnpm lint:fix
```

#### 2. Testing
```bash
# Test specific functionality
pnpm cli run "Test content"

# Run benchmark
pnpm benchmark -- -n 3

# Check performance
pnpm evaluate
```

#### 3. Database Inspection
```bash
# Open SQLite console
sqlite3 scoring-data.db

# Common queries
.tables
.schema scoring_records
SELECT COUNT(*) FROM scoring_records;
SELECT AVG(output_score) FROM scoring_records;
```

### Adding New Features

#### 1. New Storage Backend
```typescript
// Implement the storage interfaces
class MyCustomScoringStorage implements ScoringStorage {
  async initialize(): Promise<void> { /* ... */ }
  async saveRecord(record): Promise<string> { /* ... */ }
  // ... implement all methods
}

// Register in factory
class MyCustomFactory implements StorageFactory {
  createScoringStorage(): ScoringStorage {
    return new MyCustomScoringStorage();
  }
  createConfigStorage(): ConfigStorage {
    return new MyCustomConfigStorage();
  }
}
```

#### 2. New Model Support
```typescript
// In usefulness-scorer.ts
private getModel() {
  const models = {
    'gpt-4o-mini': openai('gpt-4o-mini'),
    'new-model': provider('new-model'), // Add here
  };
}

// Update types/index.ts
interface ScoringConfig {
  model: 'gpt-4o-mini' | 'new-model'; // Add to union
}
```

#### 2. New Prompt Version
```typescript
// In prompts/prompt-library.ts
PromptLibrary.add('v4_custom', {
  template: `Your new prompt template...`,
  performance: { mae: 0.1, correlation: 0.8 }
});
```

#### 3. New CLI Command
```typescript
// In cli/index.ts
program
  .command('new-command')
  .description('Description')
  .action(async () => {
    // Implementation
  });
```

### Debugging

#### Enable Debug Logging
```typescript
console.log(chalk.gray('[DEBUG]'), data);
```

#### Inspect Database State
```bash
sqlite3 scoring-data.db "SELECT * FROM scoring_records ORDER BY timestamp DESC LIMIT 5;"
```

#### Test Specific Configurations
```typescript
const scorer = new UsefulnessScorer({
  model: 'gpt-4o',
  temperature: 0.5,
  promptVersion: 'v3_chain_of_thought'
});
```

## Performance Optimization

### Database Optimization
```bash
# Vacuum to reclaim space
sqlite3 scoring-data.db "VACUUM;"

# Update statistics
sqlite3 scoring-data.db "ANALYZE;"
```

### Memory Management
- Limit dataset sizes with `LIMIT` clauses
- Use streaming for large files
- Clear unused references

### API Rate Limiting
- Implement exponential backoff
- Batch operations when possible
- Cache results appropriately

## Troubleshooting

### Common Issues

#### TypeScript Errors
```bash
# Full type check
pnpm exec tsc --noEmit

# Common fixes:
# - Add .js to imports
# - Fix any types with explicit typing
# - Update tsconfig.json if needed
```

#### Database Locked
```typescript
// Retry logic
let retries = 3;
while (retries > 0) {
  try {
    await db.execute(query);
    break;
  } catch (error) {
    if (error.message.includes('locked')) {
      await new Promise(r => setTimeout(r, 1000));
      retries--;
    } else throw error;
  }
}
```

#### Import Errors
- Ensure `.js` extension in imports
- Check `"type": "module"` in package.json
- Verify file paths are correct

## Best Practices

### Code Quality
1. **Type Safety**: Avoid `any`, use proper types
2. **Error Handling**: Always catch and handle errors
3. **Documentation**: Comment complex logic
4. **Validation**: Use Zod schemas for input validation

### Performance
1. **Lazy Loading**: Use dynamic imports
2. **Caching**: Cache expensive operations
3. **Batching**: Group database operations
4. **Limiting**: Use pagination for large datasets

### Security
1. **API Keys**: Never commit to repository
2. **SQL Injection**: Use parameterized queries
3. **Input Validation**: Validate all user input
4. **Error Messages**: Don't expose sensitive info

### Maintenance
1. **Dependencies**: Keep packages updated
2. **Database**: Regular backups and cleanup
3. **Logs**: Implement proper logging
4. **Monitoring**: Track performance metrics