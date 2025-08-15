/**
 * Example usage of the GridSearchService
 * 
 * This example demonstrates how to use the new GridSearchService
 * to perform comprehensive parameter optimization with advanced features.
 */

import { Database } from '../src/db/client.js';
import { GridSearchService, type GridSearchParams } from '../src/services/grid-search.service.js';

async function runGridSearchExample() {
  // Initialize database and service
  const db = new Database();
  const gridSearchService = new GridSearchService(db);

  // Set up event listeners for progress tracking
  gridSearchService.on('progress', (event) => {
    console.log(`[${event.timestamp.toISOString()}] ${event.type}: ${event.data.message || JSON.stringify(event.data)}`);
  });

  // Define grid search parameters
  const params: GridSearchParams = {
    baseAgentKey: 'content-scorer',
    
    // Parameter variations to test
    variations: {
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      temperatures: [0.1, 0.3, 0.5, 0.7],
      promptIds: ['scoring-v1', 'scoring-v2', 'scoring-v3'],
    },

    // Dataset configuration
    dataset: {
      version: 'v1.0',
      split: 'validation',
      limit: 50,
    },

    // Parallel processing configuration
    concurrency: {
      maxConcurrentTests: 3,
      batchSize: 2,
    },

    // Cost limits and estimation
    costLimits: {
      estimateOnly: false,
      maxEstimatedCost: 10.00, // $10 maximum
      costPerToken: 0.00002,   // $0.02 per 1K tokens
    },

    // Early stopping configuration
    earlyStopping: {
      enabled: true,
      confidenceLevel: 0.95,
      minSamples: 10,
      stopThreshold: 0.1, // Stop if best is 10% better
    },

    // Cross-validation configuration
    crossValidation: {
      enabled: true,
      folds: 5,
      stratified: false,
    },

    // Progress tracking
    progress: {
      enableStreaming: true,
      reportInterval: 5,
    },
  };

  try {
    console.log('Starting comprehensive grid search...');
    const result = await gridSearchService.runGridSearch(params);

    console.log('\n=== GRID SEARCH RESULTS ===');
    console.log(`Best configuration achieved ${result.bestConfig.metrics.score.toFixed(4)} score`);
    console.log('Best parameters:', JSON.stringify(result.bestConfig.config, null, 2));

    if (result.bestConfig.crossValidation) {
      console.log('\nCross-validation results:');
      console.log(`- Mean score: ${result.bestConfig.crossValidation.meanScore.toFixed(4)}`);
      console.log(`- Std deviation: ${result.bestConfig.crossValidation.standardDeviation.toFixed(4)}`);
      console.log(`- 95% CI: [${result.bestConfig.crossValidation.confidenceInterval[0].toFixed(4)}, ${result.bestConfig.crossValidation.confidenceInterval[1].toFixed(4)}]`);
    }

    console.log('\nSearch statistics:');
    console.log(`- Configurations tested: ${result.statistics.totalConfigurations}`);
    console.log(`- Total samples processed: ${result.statistics.totalSamples}`);
    console.log(`- Total duration: ${(result.statistics.totalDuration / 1000).toFixed(2)}s`);
    console.log(`- Total estimated cost: $${result.statistics.totalEstimatedCost.toFixed(4)}`);

    console.log('\nRecommendations:');
    console.log(`- ${result.recommendations.summary}`);
    
    console.log('\nParameter insights:');
    Object.entries(result.recommendations.parameterInsights).forEach(([param, insight]) => {
      console.log(`- ${param}: ${insight}`);
    });

    console.log('\nNext steps:');
    result.recommendations.nextSteps.forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });

    // Display top 3 configurations
    console.log('\n=== TOP 3 CONFIGURATIONS ===');
    result.results.slice(0, 3).forEach((config, index) => {
      console.log(`\n${index + 1}. Score: ${config.metrics.score.toFixed(4)} (RMSE: ${config.metrics.rmse.toFixed(4)})`);
      console.log(`   Config: ${JSON.stringify(config.config, null, 2)}`);
      console.log(`   Duration: ${config.duration}ms, Cost: $${config.estimatedCost.toFixed(4)}`);
    });

  } catch (error) {
    console.error('Grid search failed:', error);
  }
}

// Example of cost estimation only
async function runCostEstimationExample() {
  const db = new Database();
  const gridSearchService = new GridSearchService(db);

  const params: GridSearchParams = {
    baseAgentKey: 'content-scorer',
    variations: {
      models: ['gpt-4o', 'gpt-4o-mini'],
      temperatures: [0.1, 0.3, 0.5, 0.7, 0.9],
      promptIds: ['v1', 'v2', 'v3'],
    },
    costLimits: {
      estimateOnly: true, // Only estimate, don't run
    },
  };

  console.log('Estimating grid search costs...');
  const result = await gridSearchService.runGridSearch(params);
  console.log(result.recommendations.summary);
}

// Example with early stopping focus
async function runEarlyStoppingExample() {
  const db = new Database();
  const gridSearchService = new GridSearchService(db);

  const params: GridSearchParams = {
    baseAgentKey: 'content-scorer',
    variations: {
      models: ['gpt-4o-mini', 'gpt-3.5-turbo'],
      temperatures: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    },
    earlyStopping: {
      enabled: true,
      confidenceLevel: 0.90,
      minSamples: 5,
      stopThreshold: 0.05,
    },
    progress: {
      enableStreaming: true,
      reportInterval: 3,
    },
  };

  gridSearchService.on('progress', (event) => {
    if (event.type === 'early_stop') {
      console.log(`🛑 Early stopping: ${event.data.message}`);
    } else if (event.type === 'progress') {
      console.log(`⏳ Progress: ${event.data.message} (${event.data.progress?.toFixed(1)}%)`);
    }
  });

  const result = await gridSearchService.runGridSearch(params);
  
  if (result.earlyStopping?.stopped) {
    console.log(`Grid search stopped early after testing ${result.earlyStopping.configurationsTested} configurations`);
    console.log(`Reason: ${result.earlyStopping.reason}`);
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running GridSearchService examples...\n');
  
  console.log('1. Comprehensive Grid Search:');
  await runGridSearchExample();
  
  console.log('\n\n2. Cost Estimation Only:');
  await runCostEstimationExample();
  
  console.log('\n\n3. Early Stopping Example:');
  await runEarlyStoppingExample();
}