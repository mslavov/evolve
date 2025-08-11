# Module API Reference

## Core Modules

### Storage Layer

**Location:** `/src/storage/`

The storage abstraction layer provides flexible backend options for data persistence.

#### Storage Interfaces (`/src/storage/interfaces.ts`)

##### `Storage`
Base interface for all storage implementations:
```typescript
interface Storage {
  initialize(): Promise<void>;
  close(): Promise<void>;
  isInitialized(): boolean;
}
```

##### `ScoringStorage`
Interface for scoring record storage:
```typescript
interface ScoringStorage extends Storage {
  saveRecord(record: Omit<ScoringRecord, 'id'>): Promise<string>;
  getRecords(filters?: RecordFilters): Promise<ScoringRecord[]>;
  getRecord(id: string): Promise<ScoringRecord | null>;
  addGroundTruth(id: string, truth: number, source: GroundTruthSource): Promise<void>;
  getStats(): Promise<ScoringStats>;
}
```

##### `ConfigStorage`
Interface for configuration storage:
```typescript
interface ConfigStorage extends Storage {
  saveConfig(key: string, config: ScoringConfig): Promise<void>;
  loadConfig(key: string): Promise<ScoringConfig | null>;
  listConfigs(): Promise<string[]>;
  deleteConfig(key: string): Promise<void>;
  getDefaultKey(): Promise<string | null>;
  setDefaultKey(key: string): Promise<void>;
}
```

#### Storage Factory (`/src/storage/factory.ts`)

Creates storage instances based on configuration:
```typescript
import { getDefaultStorageFactory } from './storage/factory.js';

const factory = getDefaultStorageFactory();
const scoringStorage = factory.createScoringStorage();
const configStorage = factory.createConfigStorage();
```

**Default Configuration:**
- Production: SQLite for both scoring and config
- Development: SQLite (optionally JSON for config)
- Test: In-memory storage

### UsefulnessScorer

**Location:** `/src/agents/usefulness-scorer.ts`

The main scoring agent that evaluates content usefulness with persistent configuration support.

#### Constructor
```typescript
constructor(config?: Partial<ScoringConfig>)
```

**Parameters:**
- `config` - Optional configuration object
  - `model`: 'gpt-4o-mini' | 'gpt-4o' | 'claude-3-haiku' | 'claude-3-sonnet'
  - `temperature`: number (0-1)
  - `maxTokens`: number
  - `promptVersion`: string

#### Methods

##### `initWithStorage(configStorage?: ConfigStorage): Promise<void>`
Initialize scorer with persistent storage support.

**Parameters:**
- `configStorage` - Optional custom storage instance

**Example:**
```typescript
await scorer.initWithStorage(); // Uses default storage
// Automatically loads default config if set
```

##### `loadConfig(key: string): Promise<void>`
Load a saved configuration from storage.

**Parameters:**
- `key` - Configuration name to load

##### `saveConfig(key: string): Promise<void>`
Save current configuration to storage.

**Parameters:**
- `key` - Configuration name to save as

##### `score(content: string): Promise<ScoringResult>`
Scores the provided content.

**Parameters:**
- `content` - Text content to evaluate

**Returns:**
```typescript
{
  score: number;           // 0-1 score
  reasoning: string;       // Explanation
  dimensions?: {           // Optional breakdown
    relevance: number;
    accuracy: number;
    completeness: number;
    clarity: number;
    actionability: number;
  };
  metadata: {
    model: string;
    temperature: number;
    promptVersion: string;
    timestamp: Date;
  };
}
```

##### `updateConfig(config: Partial<ScoringConfig>): void`
Updates scorer configuration.

##### `getConfig(): ScoringConfig`
Returns current configuration.

**Example:**
```typescript
import { UsefulnessScorer } from './agents/usefulness-scorer.js';

const scorer = new UsefulnessScorer({
  model: 'gpt-4o-mini',
  temperature: 0.3
});

const result = await scorer.score("How to implement OAuth2");
console.log(`Score: ${result.score}`);
```

### ScoringCollector

**Location:** `/src/collectors/scoring-collector.ts`

Facade over the storage layer that maintains backward compatibility.

#### Methods

##### `init(): Promise<void>`
Initializes database connection and creates tables.

##### `record(record: Omit<ScoringRecord, 'id'>): Promise<string>`
Records a scoring operation.

**Parameters:**
- `record` - Scoring record without ID

**Returns:** Generated record ID

##### `getDataset(filters?): Promise<ScoringRecord[]>`
Retrieves scoring records.

**Parameters:**
```typescript
{
  limit?: number;
  hasGroundTruth?: boolean;
  model?: string;
  promptVersion?: string;
}
```

##### `addGroundTruth(id: string, truth: number, source: 'human' | 'consensus' | 'benchmark'): Promise<void>`
Adds ground truth label to existing record.

##### `getStats(): Promise<Statistics>`
Returns aggregate statistics.

**Returns:**
```typescript
{
  totalRecords: number;
  recordsWithGroundTruth: number;
  averageScore: number;
  modelsUsed: string[];
}
```

**Example:**
```typescript
import { ScoringCollector } from './collectors/scoring-collector.js';

const collector = new ScoringCollector();
await collector.init();

const id = await collector.record({
  timestamp: new Date(),
  input: { content: "test", length: 4 },
  output: { score: 0.5, reasoning: "moderate" },
  config: { model: "gpt-4o-mini", temperature: 0.3, promptVersion: "v1" }
});

await collector.addGroundTruth(id, 0.6, 'human');
```

### ScoringEvaluator

**Location:** `/src/evaluators/scoring-evaluator.ts`

Analyzes scoring performance and generates reports.

#### Methods

##### `evaluate(dataset: ScoringRecord[]): Promise<EvaluationReport>`
Evaluates performance metrics.

**Parameters:**
- `dataset` - Array of scoring records with ground truth

**Returns:**
```typescript
{
  overall: {
    mae: number;
    rmse: number;
    correlation: number;
    bias: number;
    consistency: number;
    distribution: {
      mean: number;
      std: number;
      min: number;
      max: number;
    };
  };
  byConfiguration: Map<string, {
    mae: number;
    rmse: number;
    sampleSize: number;
  }>;
  recommendations: string[];
}
```

##### `calculateMetrics(predictions: number[], groundTruth: number[]): EvaluationMetrics`
Calculates performance metrics.

##### `analyzeErrors(dataset: ScoringRecord[]): ErrorAnalysis`
Analyzes error patterns.

**Example:**
```typescript
import { ScoringEvaluator } from './evaluators/scoring-evaluator.js';

const evaluator = new ScoringEvaluator();
const dataset = await collector.getDataset({ hasGroundTruth: true });
const report = await evaluator.evaluate(dataset);

console.log(`MAE: ${report.overall.mae}`);
console.log(`Correlation: ${report.overall.correlation}`);
```

### ConfigurationOptimizer

**Location:** `/src/optimizers/config-optimizer.ts`

Optimizes model configuration for better performance.

#### Methods

##### `optimizeConfiguration(evaluation: EvaluationReport): Promise<OptimalConfiguration>`
Finds optimal configuration.

**Returns:**
```typescript
{
  current: Configuration;
  toTest: Configuration[];
  expectedImprovement: number;
}
```

##### `testConfigurations(configs: Configuration[], dataset: ScoringRecord[]): Promise<Map<string, EvaluationMetrics>>`
Tests multiple configurations.

##### `generatePromptVariations(basePrompt: string, errors: ErrorAnalysis): string[]`
Generates improved prompts based on error analysis.

**Example:**
```typescript
import { ConfigurationOptimizer } from './optimizers/config-optimizer.js';

const optimizer = new ConfigurationOptimizer();
const optimal = await optimizer.optimizeConfiguration(evaluation);

console.log(`Best model: ${optimal.current.model}`);
console.log(`Expected improvement: ${optimal.expectedImprovement * 100}%`);
```

### PromptLibrary

**Location:** `/src/prompts/prompt-library.ts`

Manages prompt templates and versions.

#### Static Methods

##### `get(version: string): string`
Retrieves prompt template by version.

##### `add(version: string, template: PromptTemplate): void`
Adds new prompt template.

##### `getBestPerforming(): string`
Returns version with best MAE.

##### `getAllVersions(): string[]`
Lists all available versions.

##### `getPerformance(version: string): { mae: number; correlation: number } | undefined`
Gets performance metrics for version.

**Example:**
```typescript
import { PromptLibrary } from './prompts/prompt-library.js';

// Get prompt
const prompt = PromptLibrary.get('v3_chain_of_thought');

// Add custom prompt
PromptLibrary.add('v4_custom', {
  template: 'Your custom prompt...',
  performance: { mae: 0.08, correlation: 0.85 }
});

// Get best performing
const best = PromptLibrary.getBestPerforming();
```

## Type Definitions

### Core Types

```typescript
interface ScoringConfig {
  model: 'gpt-4o-mini' | 'gpt-4o' | 'claude-3-haiku' | 'claude-3-sonnet';
  temperature: number;
  maxTokens: number;
  promptVersion: string;
}

interface ScoringResult {
  score: number;
  reasoning: string;
  dimensions?: {
    relevance: number;
    accuracy: number;
    completeness: number;
    clarity: number;
    actionability: number;
  };
  metadata: {
    model: string;
    temperature: number;
    promptVersion: string;
    timestamp: Date;
  };
}

interface ScoringRecord {
  id: string;
  timestamp: Date;
  input: {
    content: string;
    length: number;
    type?: string;
  };
  output: {
    score: number;
    reasoning: string;
    dimensions?: Record<string, number>;
  };
  config: {
    model: string;
    temperature: number;
    promptVersion: string;
  };
  groundTruth?: {
    score: number;
    source: 'human' | 'consensus' | 'benchmark';
    labelerInfo?: any;
  };
  performance?: {
    error: number;
    squaredError: number;
  };
}
```

### Evaluation Types

```typescript
interface EvaluationMetrics {
  mae: number;
  rmse: number;
  correlation: number;
  bias: number;
  consistency: number;
  distribution: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
}

interface EvaluationReport {
  overall: EvaluationMetrics;
  byConfiguration: Map<string, {
    mae: number;
    rmse: number;
    sampleSize: number;
  }>;
  recommendations: string[];
}
```

### Optimization Types

```typescript
interface Configuration {
  model: string;
  temperature: number;
  maxTokens: number;
  promptVersion?: string;
}

interface OptimalConfiguration {
  current: Configuration;
  toTest: Configuration[];
  expectedImprovement: number;
}
```

## Zod Schemas

### Scoring Schema

```typescript
import { z } from 'zod';

const scoringSchema = z.object({
  score: z.number().min(0).max(1).describe("Usefulness score from 0 to 1"),
  reasoning: z.string().describe("Brief explanation of the score"),
  dimensions: z.object({
    relevance: z.number().min(0).max(1),
    accuracy: z.number().min(0).max(1),
    completeness: z.number().min(0).max(1),
    clarity: z.number().min(0).max(1),
    actionability: z.number().min(0).max(1)
  }).optional()
});
```

## Error Handling

All modules throw typed errors:

```typescript
try {
  const result = await scorer.score(content);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Scoring failed: ${error.message}`);
  }
}
```

Common error types:
- Database initialization errors
- API key missing errors
- Model configuration errors
- Invalid input errors
- Network/API errors