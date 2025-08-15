import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { EvaluationService } from '../../services/evaluation.service.js';
import { getDatabase } from '../../db/client.js';

export function createEvalCommand() {
  return new Command('eval')
    .description('Evaluate agent performance')
    .argument('<agent-key>', 'Agent key to evaluate')
    .option('--dataset <version>', 'Dataset version to use for evaluation')
    .option('--verbose', 'Show detailed output')
    .option('--limit <n>', 'Number of samples to evaluate (default: 50)', parseInt)
    .option('--poor-score <n>', 'Score threshold for poor performance (default: 0.5)', parseFloat)
    .option('--poor-rmse <n>', 'RMSE threshold for poor performance (default: 0.3)', parseFloat)
    .option('--good-score <n>', 'Score threshold for good performance (default: 0.7)', parseFloat)
    .option('--good-rmse <n>', 'RMSE threshold for good performance (default: 0.2)', parseFloat)
    .action(async (agentKey: string, options) => {
      const spinner = ora('Running evaluation...').start();
      
      try {
        const db = getDatabase();
        const evaluationService = new EvaluationService(db);
        
        // Show configuration if verbose
        if (options.verbose) {
          spinner.info(`Evaluating agent: ${chalk.cyan(agentKey)}`);
          if (options.dataset) {
            spinner.info(`Using dataset version: ${chalk.yellow(options.dataset)}`);
          }
          if (options.limit) {
            spinner.info(`Sample limit: ${chalk.yellow(options.limit)}`);
          }
          spinner.start('Running evaluation...');
        }
        
        const result = await evaluationService.evaluateAgent(agentKey, {
          datasetVersion: options.dataset,
          limit: options.limit,
        });
        
        spinner.succeed('Evaluation complete!');
        
        console.log(chalk.cyan('\n📊 Evaluation Results:\n'));
        
        // Display metrics with proper formatting
        console.log('📈 Performance Metrics:');
        console.log(`  Average Score: ${chalk.yellow(result.metrics.averageScore.toFixed(3))}`);
        console.log(`  Average Error: ${chalk.yellow(result.metrics.averageError.toFixed(3))}`);
        console.log(`  RMSE: ${chalk.yellow(result.metrics.rmse.toFixed(4))}`);
        console.log(`  Samples Evaluated: ${chalk.white(result.metrics.samplesEvaluated)}`);
        
        // Display strengths
        if (result.strengths.length > 0) {
          console.log(chalk.green('\n✅ Strengths:'));
          for (const strength of result.strengths) {
            console.log(`  • ${strength}`);
          }
        }
        
        // Display weaknesses
        if (result.weaknesses.length > 0) {
          console.log(chalk.red('\n⚠️  Weaknesses:'));
          for (const weakness of result.weaknesses) {
            console.log(`  • ${weakness}`);
          }
        }
        
        // Verbose output
        if (options.verbose) {
          console.log(chalk.gray('\n📋 Evaluation Details:'));
          console.log(`  Agent Key: ${agentKey}`);
          console.log(`  Dataset Version: ${options.dataset || 'default'}`);
          console.log(`  Sample Limit: ${options.limit || 'default (50)'}`);
          console.log(`  Evaluation Method: Standard performance analysis`);
        }
        
        // Determine exit code based on performance with configurable thresholds
        const avgScore = result.metrics.averageScore;
        const rmse = result.metrics.rmse;
        
        // Use provided thresholds or defaults
        const poorScoreThreshold = options.poorScore ?? 0.5;
        const poorRmseThreshold = options.poorRmse ?? 0.3;
        const goodScoreThreshold = options.goodScore ?? 0.7;
        const goodRmseThreshold = options.goodRmse ?? 0.2;
        
        // Exit with non-zero code if performance is poor (for CI/CD)
        if (avgScore < poorScoreThreshold || rmse > poorRmseThreshold) {
          console.log(chalk.yellow('\n⚠️  Performance below recommended thresholds'));
          console.log(chalk.gray(`   Score: ${avgScore.toFixed(3)} < ${poorScoreThreshold} or RMSE: ${rmse.toFixed(4)} > ${poorRmseThreshold}`));
          console.log(chalk.gray('   Consider running optimization or reviewing agent configuration'));
          process.exit(1);
        } else if (avgScore < goodScoreThreshold || rmse > goodRmseThreshold) {
          console.log(chalk.yellow('\n📊 Performance is acceptable but could be improved'));
          console.log(chalk.gray(`   Score: ${avgScore.toFixed(3)} < ${goodScoreThreshold} or RMSE: ${rmse.toFixed(4)} > ${goodRmseThreshold}`));
          process.exit(0);
        } else {
          console.log(chalk.green('\n🎯 Excellent performance!'));
          process.exit(0);
        }
        
      } catch (error) {
        spinner.fail('Evaluation failed');
        console.error(chalk.red('Error:'), error);
        
        // Provide helpful error messages
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            console.log(chalk.gray('\n💡 Tip: Check available agents with: pnpm cli agent list'));
          } else if (error.message.includes('No test data')) {
            console.log(chalk.gray('\n💡 Tip: Generate test data with: pnpm cli dataset build'));
          }
        }
        
        process.exit(1);
      }
    });
}