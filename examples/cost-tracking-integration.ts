/**
 * Example demonstrating integration of CostTrackerService with 
 * GridSearchService and IterativeOptimizationService
 */

import { Database } from '../src/db/client.js';
import { CostTrackerService, GridSearchService, IterativeOptimizationService } from '../src/services/index.js';
import type { GridSearchParams, IterativeOptimizationParams, BudgetConfig } from '../src/services/index.js';

async function demonstrateCostTracking() {
  // Initialize services
  const db = new Database();
  const costTracker = new CostTrackerService(db);
  const gridSearch = new GridSearchService(db);
  const iterativeOptimizer = new IterativeOptimizationService(db);

  console.log('🚀 Cost Tracking Integration Demo\n');

  // Configure budget controls
  const budgetConfig: BudgetConfig = {
    dailyLimit: 10.0,        // $10 daily limit
    weeklyLimit: 50.0,       // $50 weekly limit
    monthlyLimit: 200.0,     // $200 monthly limit
    sessionLimit: 5.0,       // $5 per session limit
    operationLimit: 1.0,     // $1 per operation limit
    warningThreshold: 0.8,   // 80% warning threshold
    enforceHardLimits: false, // Allow exceeding limits (for demo)
    notificationEmails: ['admin@example.com'],
  };

  costTracker.configureBudget(budgetConfig);
  console.log('✅ Budget configuration set');

  // Set up event listeners for cost tracking
  costTracker.on('cost_estimated', (estimation) => {
    console.log(`📊 Cost estimation: $${estimation.totalCost.toFixed(4)} (${estimation.confidence * 100}% confidence)`);
  });

  costTracker.on('cost_logged', (entry) => {
    console.log(`💰 Cost logged: $${entry.totalCost.toFixed(4)} for ${entry.operationType}`);
  });

  costTracker.on('budget_alert', (alert) => {
    console.log(`⚠️  Budget Alert: ${alert.message}`);
  });

  // Example 1: Grid Search with Cost Estimation
  console.log('\n1️⃣ Grid Search Cost Estimation');
  
  const gridSearchParams: GridSearchParams = {
    baseAgentKey: 'example-agent',
    variations: {
      models: ['gpt-4o-mini', 'gpt-4o'],
      temperatures: [0.3, 0.7, 1.0],
      promptIds: ['v1', 'v2'],
    },
    dataset: {
      limit: 50,
    },
    concurrency: {
      maxConcurrentTests: 3,
      batchSize: 5,
    },
    crossValidation: {
      enabled: true,
      folds: 3,
    },
  };

  // Estimate costs before running
  try {
    const gridEstimation = await costTracker.estimateGridSearchCost(gridSearchParams);
    
    console.log(`   Total estimated cost: $${gridEstimation.totalCost.toFixed(4)}`);
    console.log(`   Cost range: $${gridEstimation.costRange.min.toFixed(4)} - $${gridEstimation.costRange.max.toFixed(4)}`);
    console.log(`   Estimated duration: ${Math.round(gridEstimation.estimatedDuration)} seconds`);
    console.log('   Model breakdown:');
    for (const [model, breakdown] of Object.entries(gridEstimation.modelBreakdown)) {
      console.log(`     ${model}: $${breakdown.estimatedCost.toFixed(4)} (${breakdown.operations} operations)`);
    }

    // Check budget before proceeding
    const budgetCheck = await costTracker.checkBudgetBeforeOperation(
      gridEstimation.totalCost, 
      'grid-search'
    );
    
    if (!budgetCheck.allowed) {
      console.log(`❌ Operation blocked: ${budgetCheck.reason}`);
      for (const alert of budgetCheck.alerts) {
        console.log(`   Alert: ${alert.message}`);
      }
    } else {
      console.log('✅ Budget check passed, operation allowed');
    }

  } catch (error) {
    console.error('❌ Grid search estimation failed:', error);
  }

  // Example 2: Iterative Optimization Cost Estimation
  console.log('\n2️⃣ Iterative Optimization Cost Estimation');

  const iterativeParams: IterativeOptimizationParams = {
    baseAgentKey: 'example-agent',
    objectives: [
      {
        id: 'accuracy',
        name: 'Accuracy',
        description: 'Response accuracy',
        weight: 0.6,
        target: 0.9,
        evaluationStrategy: 'numeric-score',
      },
      {
        id: 'relevance',
        name: 'Relevance',
        description: 'Content relevance',
        weight: 0.4,
        target: 0.85,
        evaluationStrategy: 'fact-based',
      },
    ],
    maxIterations: 8,
    enableResearch: true,
    enablePatternLearning: true,
    sessionId: 'demo-session-001',
    checkpointInterval: 2,
  };

  try {
    const iterativeEstimation = await costTracker.estimateIterativeOptimizationCost(iterativeParams);
    
    console.log(`   Total estimated cost: $${iterativeEstimation.totalCost.toFixed(4)}`);
    console.log(`   Cost range: $${iterativeEstimation.costRange.min.toFixed(4)} - $${iterativeEstimation.costRange.max.toFixed(4)}`);
    console.log(`   Estimated duration: ${Math.round(iterativeEstimation.estimatedDuration)} seconds`);
    console.log('   Assumptions:');
    for (const assumption of iterativeEstimation.assumptions) {
      console.log(`     • ${assumption}`);
    }

  } catch (error) {
    console.error('❌ Iterative optimization estimation failed:', error);
  }

  // Example 3: Simulate Cost Tracking
  console.log('\n3️⃣ Simulating Cost Tracking');

  // Simulate some operations and track their costs
  const operations = [
    { 
      sessionId: 'demo-session-001', 
      model: 'gpt-4o-mini', 
      inputTokens: 500, 
      outputTokens: 200, 
      operationType: 'grid-search' 
    },
    { 
      sessionId: 'demo-session-001', 
      model: 'gpt-4o', 
      inputTokens: 800, 
      outputTokens: 300, 
      operationType: 'iterative-optimization' 
    },
    { 
      sessionId: 'demo-session-002', 
      model: 'claude-3-5-sonnet-20241022', 
      inputTokens: 600, 
      outputTokens: 250, 
      operationType: 'single-run' 
    },
  ];

  for (const op of operations) {
    try {
      const costEntry = await costTracker.trackCost({
        sessionId: op.sessionId,
        model: op.model,
        provider: costTracker['getProviderForModel'](op.model), // Access private method for demo
        inputTokens: op.inputTokens,
        outputTokens: op.outputTokens,
        totalTokens: op.inputTokens + op.outputTokens,
        operationType: op.operationType,
        metadata: { demo: true },
      });

      console.log(`   Tracked: ${op.operationType} using ${op.model} - $${costEntry.totalCost.toFixed(6)}`);
    } catch (error) {
      console.error(`❌ Failed to track cost for ${op.operationType}:`, error);
    }
  }

  // Example 4: Cost Analytics and Reporting
  console.log('\n4️⃣ Cost Analytics and Reporting');

  try {
    const analytics = await costTracker.getCostAnalytics();
    
    console.log('   📈 Spending Summary:');
    console.log(`     Today: $${analytics.spendingByPeriod.today.toFixed(6)}`);
    console.log(`     This week: $${analytics.spendingByPeriod.thisWeek.toFixed(6)}`);
    console.log(`     This month: $${analytics.spendingByPeriod.thisMonth.toFixed(6)}`);
    console.log(`     Last 30 days: $${analytics.spendingByPeriod.last30Days.toFixed(6)}`);
    
    console.log('   🤖 Spending by Model:');
    for (const [model, cost] of Object.entries(analytics.spendingByModel)) {
      console.log(`     ${model}: $${cost.toFixed(6)}`);
    }
    
    console.log('   🔧 Spending by Operation:');
    for (const [operation, cost] of Object.entries(analytics.spendingByOperation)) {
      console.log(`     ${operation}: $${cost.toFixed(6)}`);
    }
    
    console.log('   🏢 Spending by Provider:');
    for (const [provider, cost] of Object.entries(analytics.spendingByProvider)) {
      console.log(`     ${provider}: $${cost.toFixed(6)}`);
    }

    console.log('   📊 Token Usage:');
    console.log(`     Total input tokens: ${analytics.tokenUsage.totalInputTokens.toLocaleString()}`);
    console.log(`     Total output tokens: ${analytics.tokenUsage.totalOutputTokens.toLocaleString()}`);
    console.log(`     Average tokens per operation: ${Math.round(analytics.tokenUsage.averageTokensPerOperation).toLocaleString()}`);

    console.log(`   💡 Projected monthly spending: $${analytics.projectedMonthlySpending.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Failed to get analytics:', error);
  }

  // Example 5: Export Cost Data
  console.log('\n5️⃣ Data Export');

  try {
    const costSummary = await costTracker.getCostSummary();
    console.log('   💼 Cost Summary:');
    console.log(`     Total entries: ${costSummary.totalEntries}`);
    console.log(`     Total cost: $${costSummary.totalCost.toFixed(6)}`);
    console.log(`     Today's cost: $${costSummary.todaysCost.toFixed(6)}`);
    console.log(`     Average cost per operation: $${costSummary.averageCostPerOperation.toFixed(6)}`);
    console.log(`     Most expensive model: ${costSummary.mostExpensiveModel}`);

    if (costSummary.budgetStatus) {
      console.log('   📊 Budget Status:');
      console.log(`     Daily usage: $${costSummary.budgetStatus.dailyUsage.toFixed(6)} / $${costSummary.budgetStatus.limits.dailyLimit?.toFixed(2) || 'N/A'}`);
      console.log(`     Weekly usage: $${costSummary.budgetStatus.weeklyUsage.toFixed(6)} / $${costSummary.budgetStatus.limits.weeklyLimit?.toFixed(2) || 'N/A'}`);
      console.log(`     Monthly usage: $${costSummary.budgetStatus.monthlyUsage.toFixed(6)} / $${costSummary.budgetStatus.limits.monthlyLimit?.toFixed(2) || 'N/A'}`);
    }

    // Export session costs
    const sessionCosts = costTracker.getSessionCosts('demo-session-001');
    console.log(`   Session 'demo-session-001' costs: ${sessionCosts.length} entries`);

  } catch (error) {
    console.error('❌ Failed to get cost summary:', error);
  }

  // Example 6: Model Pricing Information
  console.log('\n6️⃣ Model Pricing Information');

  const supportedModels = costTracker.getAllModelPricing();
  console.log('   🏷️  Supported Models:');
  for (const model of supportedModels.slice(0, 5)) { // Show first 5 models
    console.log(`     ${model.model} (${model.provider}):`);
    console.log(`       Input: $${model.inputPricePer1K.toFixed(6)}/1K tokens`);
    console.log(`       Output: $${model.outputPricePer1K.toFixed(6)}/1K tokens`);
    console.log(`       Max tokens: ${model.maxTokens.toLocaleString()}`);
  }

  console.log(`   ... and ${supportedModels.length - 5} more models`);

  console.log('\n✨ Demo completed! The CostTrackerService is fully integrated and ready for use.');
}

// Integration Helper Functions
export function integrateCostTrackingWithGridSearch(
  gridSearchService: GridSearchService, 
  costTracker: CostTrackerService
) {
  // Wrap the original runGridSearch method to add cost tracking
  const originalRunGridSearch = gridSearchService.runGridSearch.bind(gridSearchService);
  
  gridSearchService.runGridSearch = async function(params) {
    const sessionId = `grid_search_${Date.now()}`;
    
    // Estimate costs first
    const estimation = await costTracker.estimateGridSearchCost(params);
    
    // Check budget
    const budgetCheck = await costTracker.checkBudgetBeforeOperation(
      estimation.totalCost, 
      'grid-search'
    );
    
    if (!budgetCheck.allowed && costTracker.getBudgetConfig()?.enforceHardLimits) {
      throw new Error(`Grid search blocked by budget limits: ${budgetCheck.reason}`);
    }
    
    // Run the actual grid search
    const result = await originalRunGridSearch(params);
    
    // Track actual costs
    await costTracker.trackGridSearchCosts(sessionId, result.results);
    
    return result;
  };
}

export function integrateCostTrackingWithIterativeOptimization(
  iterativeOptimizer: IterativeOptimizationService,
  costTracker: CostTrackerService
) {
  // Wrap the original optimize method to add cost tracking
  const originalOptimize = iterativeOptimizer.optimize.bind(iterativeOptimizer);
  
  iterativeOptimizer.optimize = async function(params) {
    const sessionId = params.sessionId || `iterative_opt_${Date.now()}`;
    
    // Estimate costs first
    const estimation = await costTracker.estimateIterativeOptimizationCost(params);
    
    // Check budget
    const budgetCheck = await costTracker.checkBudgetBeforeOperation(
      estimation.totalCost, 
      'iterative-optimization'
    );
    
    if (!budgetCheck.allowed && costTracker.getBudgetConfig()?.enforceHardLimits) {
      throw new Error(`Iterative optimization blocked by budget limits: ${budgetCheck.reason}`);
    }
    
    // Run the actual optimization
    const result = await originalOptimize(params);
    
    // Track actual costs
    await costTracker.trackIterativeOptimizationCosts(sessionId, result.history);
    
    return result;
  };
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCostTracking().catch(console.error);
}