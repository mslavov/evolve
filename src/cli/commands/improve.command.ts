import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ImprovementService } from '../../services/improvement.service.js';
import { getDatabase } from '../../db/client.js';

export function createImproveCommand() {
  const command = new Command('improve');
  
  command
    .description('Improve agent performance through iterative optimization')
    .argument('<agent-key>', 'Agent key to improve')
    .option('--target-score <n>', 'Target score to achieve', parseFloat, 0.9)
    .option('--max-iterations <n>', 'Maximum number of iterations', parseInt, 10)
    .option('--strategy <name>', 'Evaluation strategy to use')
    .option('--enable-research', 'Enable research-driven improvements')
    .option('--verbose', 'Enable verbose output')
    .option('--explore', 'Run grid search optimization instead of iterative optimization')
    .option('--models <models>', 'Comma-separated list of models to test (explore mode only)')
    .option('--temperatures <temps>', 'Comma-separated list of temperatures (explore mode only)')
    .option('--prompts <versions>', 'Comma-separated list of prompt versions (explore mode only)')
    .option('--sample-size <n>', 'Number of samples to test (explore mode only)', parseInt)
    .option('--max-budget <amount>', 'Maximum budget in USD (default: $10)', parseFloat, 10.00)
    .option('--no-budget', 'Disable budget enforcement (dangerous!)')
    .action(async (agentKey, options) => {
      if (options.explore) {
        await runGridSearchOptimization(agentKey, options);
      } else {
        await runIterativeOptimization(agentKey, options);
      }
    });
  
  return command;
}

async function runIterativeOptimization(agentKey: string, options: any) {
  const spinner = ora('Running iterative optimization...').start();
  
  try {
    const db = getDatabase();
    const improvementService = new ImprovementService(db);
    
    // Listen for progress events
    improvementService.on('progress', (event: any) => {
      if (event.data?.message) {
        spinner.text = event.data.message;
      }
    });
    
    improvementService.on('budget_alert', (alert: any) => {
      spinner.warn(`Budget alert: ${alert.message}`);
      spinner.start('Continuing optimization...');
    });
    
    const result = await improvementService.runIterativeOptimization({
      ...options,  // Pass budget options through
      baseAgentKey: agentKey,
      targetScore: options.targetScore,
      maxIterations: options.maxIterations,
      evaluationStrategy: options.strategy,
      enableResearch: options.enableResearch,
      verbose: options.verbose,
    });
    
    spinner.succeed('Iterative optimization complete!');
    
    console.log(chalk.cyan('\n🎯 Optimization Results:\n'));
    
    if (result.finalAgent) {
      console.log(chalk.green('Final Agent:'));
      console.log(`  Key: ${result.finalAgent.key}`);
      console.log(`  Model: ${result.finalAgent.model}`);
      console.log(`  Temperature: ${result.finalAgent.temperature}`);
      console.log(`  Final Score: ${chalk.yellow(result.finalScore?.toFixed(3) || 'N/A')}`);
    }
    
    if (result.iterations && result.iterations.length > 0) {
      console.log('\n📊 Iteration History:');
      for (const [idx, iteration] of result.iterations.entries()) {
        console.log(`  Iteration ${idx + 1}: Score ${iteration.score?.toFixed(3) || 'N/A'}`);
        if (iteration.improvements && iteration.improvements.length > 0) {
          console.log(`    Improvements: ${iteration.improvements.join(', ')}`);
        }
      }
    }
    
    if (result.converged) {
      console.log(chalk.green('\n✅ Optimization converged successfully!'));
    } else if (result.reason) {
      console.log(chalk.yellow(`\n⚠️  Optimization stopped: ${result.reason}`));
    }
    
    if (result.recommendations && result.recommendations.length > 0) {
      console.log('\n💡 ' + chalk.cyan('Recommendations:'));
      for (const recommendation of result.recommendations) {
        console.log(`  • ${recommendation}`);
      }
    }
  } catch (error) {
    spinner.fail('Iterative optimization failed');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

async function runGridSearchOptimization(agentKey: string, options: any) {
  const spinner = ora('Running grid search optimization...').start();
  
  try {
    const db = getDatabase();
    const improvementService = new ImprovementService(db);
    
    // Listen for progress events
    improvementService.on('progress', (event: any) => {
      if (event.type === 'grid_progress' && event.data) {
        const { current, total, bestScore } = event.data;
        spinner.text = `Testing configuration ${current}/${total} - Best score: ${bestScore?.toFixed(3) || 'N/A'}`;
      }
    });
    
    improvementService.on('budget_alert', (alert: any) => {
      spinner.warn(`Budget alert: ${alert.message}`);
      spinner.start('Continuing grid search...');
    });
    
    const variations = {
      models: options.models?.split(','),
      temperatures: options.temperatures?.split(',').map(parseFloat),
      promptIds: options.prompts?.split(','),
    };
    
    const result = await improvementService.optimizeConfiguration({
      ...options,  // Pass budget options through
      baseAgentKey: agentKey,
      variations,
      sampleSize: options.sampleSize,
    });
    
    spinner.succeed('Grid search optimization complete!');
    
    console.log(chalk.cyan('\n🎯 Grid Search Results:\n'));
    console.log(chalk.green('Best Agent:'));
    console.log(`  Key: ${result.bestAgent.key}`);
    console.log(`  Model: ${result.bestAgent.model}`);
    console.log(`  Temperature: ${result.bestAgent.temperature}`);
    console.log(`  Prompt ID: ${result.bestAgent.promptId}`);
    
    console.log('\n📊 Performance Comparison:');
    for (const [idx, res] of result.results.entries()) {
      const marker = idx === 0 ? chalk.green('★') : ' ';
      console.log(`${marker} Config ${idx + 1}:`);
      console.log(`    Model: ${res.agent.model}`);
      console.log(`    Temp: ${res.agent.temperature}`);
      console.log(`    RMSE: ${chalk.yellow(res.rmse.toFixed(4))}`);
      console.log(`    Avg Score: ${res.score.toFixed(3)}`);
    }
    
    console.log('\n💡 ' + chalk.cyan('Recommendation:'));
    console.log(result.recommendation);
  } catch (error) {
    spinner.fail('Grid search optimization failed');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}