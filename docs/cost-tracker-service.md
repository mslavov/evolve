# CostTrackerService Documentation

The `CostTrackerService` is a comprehensive cost tracking and budget management service designed for AI operations in the Evolve framework. It provides real-time cost monitoring, budget controls, and detailed analytics for optimization workflows.

## Features

### 🏷️ Model Pricing Management
- **Comprehensive Model Support**: Pre-configured pricing for OpenAI and Anthropic models
- **Dynamic Pricing Updates**: Ability to update model pricing as rates change
- **Provider-Agnostic**: Supports multiple AI providers with extensible architecture

### 💰 Real-Time Cost Tracking
- **Token-Based Tracking**: Accurate cost calculation based on input/output tokens
- **Operation-Level Granularity**: Track costs per grid search, iterative optimization, or single run
- **Session Management**: Group operations by session for better organization

### 🛡️ Budget Controls
- **Multi-Level Limits**: Daily, weekly, monthly, session, and per-operation limits
- **Smart Alerts**: Configurable warning thresholds with detailed notifications
- **Flexible Enforcement**: Option to enforce hard limits or provide warnings only

### 📊 Cost Analytics
- **Spending Breakdowns**: Analysis by model, operation type, provider, and time period
- **Efficiency Metrics**: Token efficiency ratios and cost-per-operation analysis
- **Trend Analysis**: Daily cost trends and projected spending
- **Performance Insights**: Identify most cost-effective models and operations

### 🔮 Cost Estimation
- **Pre-Operation Estimates**: Accurate cost predictions for grid search and iterative optimization
- **Confidence Intervals**: Cost ranges with confidence levels
- **Resource Planning**: Duration and resource requirement estimates

## Quick Start

```typescript
import { Database } from '../src/db/client.js';
import { CostTrackerService } from '../src/services/index.js';

// Initialize the service
const db = new Database();
const costTracker = new CostTrackerService(db);

// Configure budget limits
costTracker.configureBudget({
  dailyLimit: 10.0,
  weeklyLimit: 50.0,
  monthlyLimit: 200.0,
  warningThreshold: 0.8,
  enforceHardLimits: false,
});

// Set up event listeners
costTracker.on('budget_alert', (alert) => {
  console.log(`Budget Alert: ${alert.message}`);
});

costTracker.on('cost_logged', (entry) => {
  console.log(`Cost logged: $${entry.totalCost} for ${entry.operationType}`);
});
```

## Core Methods

### Cost Estimation

#### `estimateGridSearchCost(params: GridSearchParams): Promise<CostEstimation>`
Estimates the total cost for a grid search operation including:
- All parameter combinations
- Dataset size considerations
- Cross-validation multipliers
- Parallel processing optimization

```typescript
const estimation = await costTracker.estimateGridSearchCost({
  baseAgentKey: 'my-agent',
  variations: {
    models: ['gpt-4o-mini', 'gpt-4o'],
    temperatures: [0.3, 0.7, 1.0],
    promptIds: ['v1', 'v2'],
  },
  dataset: { limit: 100 },
  crossValidation: { enabled: true, folds: 5 },
});

console.log(`Estimated cost: $${estimation.totalCost}`);
console.log(`Cost range: $${estimation.costRange.min} - $${estimation.costRange.max}`);
```

#### `estimateIterativeOptimizationCost(params: IterativeOptimizationParams): Promise<CostEstimation>`
Estimates costs for iterative optimization including:
- Multiple objectives evaluation
- Research operations
- Pattern learning overhead
- Adaptive iterations

```typescript
const estimation = await costTracker.estimateIterativeOptimizationCost({
  baseAgentKey: 'my-agent',
  objectives: [
    { id: 'accuracy', weight: 0.6, target: 0.9 },
    { id: 'relevance', weight: 0.4, target: 0.85 },
  ],
  maxIterations: 10,
  enableResearch: true,
});
```

### Real-Time Cost Tracking

#### `trackCost(entry: CostTrackingEntry): Promise<CostTrackingEntry>`
Records actual cost from completed operations:

```typescript
const costEntry = await costTracker.trackCost({
  sessionId: 'optimization-session-001',
  model: 'gpt-4o',
  provider: 'openai',
  inputTokens: 1500,
  outputTokens: 500,
  totalTokens: 2000,
  operationType: 'grid-search',
  metadata: { configurationId: 'config-1' },
});
```

#### `trackGridSearchCosts(sessionId: string, results: TestResult[]): Promise<CostTrackingEntry[]>`
Bulk tracking for grid search results:

```typescript
const gridSearchResult = await gridSearchService.runGridSearch(params);
const costEntries = await costTracker.trackGridSearchCosts(
  'session-001', 
  gridSearchResult.results
);
```

### Budget Management

#### `checkBudgetBeforeOperation(estimatedCost: number, operationType: string): Promise<BudgetCheckResult>`
Validates if an operation can proceed within budget limits:

```typescript
const budgetCheck = await costTracker.checkBudgetBeforeOperation(15.50, 'grid-search');

if (!budgetCheck.allowed) {
  console.error(`Operation blocked: ${budgetCheck.reason}`);
  for (const alert of budgetCheck.alerts) {
    console.log(`Alert: ${alert.message}`);
  }
}
```

### Analytics and Reporting

#### `getCostAnalytics(timeRange?: TimeRange): Promise<CostAnalytics>`
Comprehensive cost analysis:

```typescript
const analytics = await costTracker.getCostAnalytics();

console.log('Spending by period:', analytics.spendingByPeriod);
console.log('Most expensive model:', Object.entries(analytics.spendingByModel)
  .sort(([,a], [,b]) => b - a)[0]);
console.log('Token efficiency:', analytics.efficiency.tokenEfficiencyRatio);
console.log('Projected monthly spending:', analytics.projectedMonthlySpending);
```

#### `getCostSummary(): Promise<CostSummary>`
Quick overview of current cost status:

```typescript
const summary = await costTracker.getCostSummary();

console.log(`Total cost: $${summary.totalCost}`);
console.log(`Today's cost: $${summary.todaysCost}`);
console.log(`Average per operation: $${summary.averageCostPerOperation}`);
```

## Model Pricing

### Supported Models

The service includes pre-configured pricing for:

**OpenAI Models:**
- GPT-4o: $0.0025/$0.01 per 1K tokens (input/output)
- GPT-4o-mini: $0.00015/$0.0006 per 1K tokens
- GPT-4-turbo: $0.01/$0.03 per 1K tokens
- GPT-4: $0.03/$0.06 per 1K tokens
- GPT-3.5-turbo: $0.0005/$0.0015 per 1K tokens
- O1-preview: $0.015/$0.06 per 1K tokens
- O1-mini: $0.003/$0.012 per 1K tokens

**Anthropic Models:**
- Claude-3.5-Sonnet: $0.003/$0.015 per 1K tokens
- Claude-3.5-Haiku: $0.0008/$0.004 per 1K tokens
- Claude-3-Opus: $0.015/$0.075 per 1K tokens
- Claude-3-Sonnet: $0.003/$0.015 per 1K tokens
- Claude-3-Haiku: $0.00025/$0.00125 per 1K tokens

### Custom Model Pricing

Add pricing for new models:

```typescript
costTracker.updateModelPricing({
  model: 'custom-model-v1',
  provider: 'custom-provider',
  inputPricePer1K: 0.002,
  outputPricePer1K: 0.008,
  maxTokens: 32000,
  supportsFunctionCalling: true,
  notes: 'Custom model for specialized tasks',
});
```

## Integration with Existing Services

### Grid Search Integration

```typescript
import { integrateCostTrackingWithGridSearch } from '../examples/cost-tracking-integration.js';

integrateCostTrackingWithGridSearch(gridSearchService, costTracker);

// Now grid search automatically includes cost tracking
const result = await gridSearchService.runGridSearch(params);
```

### Iterative Optimization Integration

```typescript
import { integrateCostTrackingWithIterativeOptimization } from '../examples/cost-tracking-integration.js';

integrateCostTrackingWithIterativeOptimization(iterativeOptimizer, costTracker);

// Now iterative optimization includes cost tracking
const result = await iterativeOptimizer.optimize(params);
```

## Event System

The service emits events for real-time monitoring:

```typescript
// Cost estimation completed
costTracker.on('cost_estimated', (estimation: CostEstimation) => {
  console.log(`Estimated: $${estimation.totalCost}`);
});

// Cost entry logged
costTracker.on('cost_logged', (entry: CostTrackingEntry) => {
  console.log(`Logged: $${entry.totalCost} for ${entry.operationType}`);
});

// Budget alert triggered
costTracker.on('budget_alert', (alert: BudgetAlert) => {
  console.warn(`Budget Alert: ${alert.message}`);
  // Send notifications, update UI, etc.
});

// Cost summary generated
costTracker.on('cost_summary', (analytics: CostAnalytics) => {
  console.log(`Daily spending: $${analytics.spendingByPeriod.today}`);
});
```

## Data Export and Persistence

### Export Cost Data

```typescript
// Export as JSON
const jsonData = costTracker.exportCostData('json', {
  start: new Date('2024-01-01'),
  end: new Date('2024-12-31'),
});

// Export as CSV
const csvData = costTracker.exportCostData('csv');
```

### Session-Based Analysis

```typescript
// Get all costs for a specific session
const sessionCosts = costTracker.getSessionCosts('optimization-session-001');

// Calculate session total
const sessionTotal = sessionCosts.reduce((sum, entry) => sum + entry.totalCost, 0);
```

## Best Practices

### 1. Set Appropriate Budget Limits
```typescript
costTracker.configureBudget({
  dailyLimit: 50.0,        // Reasonable daily limit
  weeklyLimit: 300.0,      // Allow for burst usage
  monthlyLimit: 1000.0,    // Monthly budget control
  warningThreshold: 0.8,   // 80% warning threshold
  enforceHardLimits: true, // Prevent overspend
});
```

### 2. Monitor Efficiency Metrics
```typescript
const analytics = await costTracker.getCostAnalytics();

// Check token efficiency
if (analytics.efficiency.tokenEfficiencyRatio < 0.3) {
  console.warn('Low token efficiency - consider optimizing prompts');
}

// Monitor cost per operation
const avgCost = Object.values(analytics.averageCostPerOperation)
  .reduce((sum, cost) => sum + cost, 0) / Object.keys(analytics.averageCostPerOperation).length;

if (avgCost > 0.10) {
  console.warn('High average cost per operation');
}
```

### 3. Regular Cost Analysis
```typescript
// Weekly cost review
setInterval(async () => {
  const analytics = await costTracker.getCostAnalytics();
  
  console.log('Weekly Cost Report:');
  console.log(`This week: $${analytics.spendingByPeriod.thisWeek}`);
  console.log(`Projected monthly: $${analytics.projectedMonthlySpending}`);
  
  // Identify top spending models
  const topModel = Object.entries(analytics.spendingByModel)
    .sort(([,a], [,b]) => b - a)[0];
  console.log(`Top spending model: ${topModel[0]} ($${topModel[1]})`);
}, 7 * 24 * 60 * 60 * 1000); // Weekly
```

### 4. Error Handling
```typescript
try {
  const estimation = await costTracker.estimateGridSearchCost(params);
  const budgetCheck = await costTracker.checkBudgetBeforeOperation(
    estimation.totalCost, 
    'grid-search'
  );
  
  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }
  
  // Proceed with operation
} catch (error) {
  console.error('Cost tracking error:', error);
  // Handle appropriately - log, notify, fallback, etc.
}
```

## Advanced Features

### Custom Token Estimation
Override default token estimation for specific use cases:

```typescript
class CustomCostTracker extends CostTrackerService {
  protected estimateInputTokens(model: string): number {
    // Custom logic for your specific prompts/use cases
    const customEstimates = {
      'gpt-4o': 1200, // Higher estimate for complex prompts
      'claude-3-5-sonnet': 1000,
    };
    
    return customEstimates[model] || super.estimateInputTokens(model);
  }
}
```

### Budget Policy Engine
Implement dynamic budget policies:

```typescript
costTracker.on('budget_alert', async (alert: BudgetAlert) => {
  if (alert.type === 'daily_limit' && alert.percentage > 90) {
    // Pause all non-critical operations
    await pauseNonCriticalOperations();
    
    // Notify administrators
    await sendAdminNotification(alert);
    
    // Switch to more cost-effective models
    await switchToEconomyModels();
  }
});
```

## Troubleshooting

### Common Issues

1. **Missing Model Pricing**
   ```typescript
   const pricing = costTracker.getModelPricing('unknown-model');
   if (!pricing) {
     costTracker.updateModelPricing({
       model: 'unknown-model',
       provider: 'custom',
       inputPricePer1K: 0.001,
       outputPricePer1K: 0.003,
       maxTokens: 4096,
       supportsFunctionCalling: false,
     });
   }
   ```

2. **Budget Alerts Not Triggering**
   - Check if budget configuration is set
   - Verify warning threshold values
   - Ensure cost tracking is active

3. **Inaccurate Cost Estimates**
   - Update token estimation methods for your specific use case
   - Calibrate based on actual usage patterns
   - Consider prompt complexity and response length variations

## API Reference

For complete API documentation, see the TypeScript interfaces in `/src/services/cost-tracker.service.ts`:

- `ModelPricing` - Model pricing configuration
- `CostTrackingEntry` - Individual cost record
- `BudgetConfig` - Budget control settings
- `CostEstimation` - Cost estimation results
- `BudgetAlert` - Budget alert information
- `CostAnalytics` - Comprehensive analytics data

## Contributing

When extending the CostTrackerService:

1. **Add New Providers**: Extend the model pricing database
2. **Custom Metrics**: Implement additional analytics calculations
3. **Integration Helpers**: Create utility functions for new services
4. **Event Handlers**: Add specialized event processing logic

The service is designed to be extensible and can accommodate future AI providers and cost models.