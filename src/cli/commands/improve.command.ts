import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ImprovementService } from '../../services/improvement.service.js';
import { getDatabase } from '../../db/client.js';

export function createImproveCommand() {
  const command = new Command('improve');
  
  command
    .description('Improve scorer performance')
    .addCommand(createOptimizeCommand())
    .addCommand(createEvaluateCommand())
    .addCommand(createAnalyzeCommand());
  
  return command;
}

function createOptimizeCommand() {
  return new Command('optimize')
    .description('Optimize configuration through testing')
    .argument('<baseConfig>', 'Base configuration key')
    .option('--models <models>', 'Comma-separated list of models to test')
    .option('--temperatures <temps>', 'Comma-separated list of temperatures')
    .option('--prompts <versions>', 'Comma-separated list of prompt versions')
    .option('--test-version <version>', 'Test dataset version')
    .option('--sample-size <n>', 'Number of samples to test', parseInt)
    .action(async (baseConfig, options) => {
      const spinner = ora('Running optimization...').start();
      
      try {
        const db = getDatabase();
        const improvementService = new ImprovementService(db);
        await improvementService.initialize();
        
        const variations = {
          models: options.models?.split(','),
          temperatures: options.temperatures?.split(',').map(parseFloat),
          promptIds: options.prompts?.split(','),
        };
        
        const result = await improvementService.optimizeConfiguration({
          baseConfigKey: baseConfig,
          variations,
          testDataVersion: options.testVersion,
          sampleSize: options.sampleSize,
        });
        
        spinner.succeed('Optimization complete!');
        
        console.log(chalk.cyan('\n🎯 Optimization Results:\n'));
        console.log(chalk.green('Best Configuration:'));
        console.log(`  Key: ${result.bestConfig.key}`);
        console.log(`  Model: ${result.bestConfig.model}`);
        console.log(`  Temperature: ${result.bestConfig.temperature}`);
        console.log(`  Prompt ID: ${result.bestConfig.promptId}`);
        
        console.log('\n📊 Performance Comparison:');
        for (const [idx, res] of result.results.entries()) {
          const marker = idx === 0 ? chalk.green('★') : ' ';
          console.log(`${marker} Config ${idx + 1}:`);
          console.log(`    Model: ${res.config.model}`);
          console.log(`    Temp: ${res.config.temperature}`);
          console.log(`    RMSE: ${chalk.yellow(res.rmse.toFixed(4))}`);
          console.log(`    Avg Score: ${res.score.toFixed(3)}`);
        }
        
        console.log('\n💡 ' + chalk.cyan('Recommendation:'));
        console.log(result.recommendation);
      } catch (error) {
        spinner.fail('Optimization failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createEvaluateCommand() {
  return new Command('evaluate')
    .description('Evaluate current configuration performance')
    .action(async () => {
      const spinner = ora('Running evaluation...').start();
      
      try {
        const db = getDatabase();
        const improvementService = new ImprovementService(db);
        await improvementService.initialize();
        
        const result = await improvementService.evaluateCurrentConfig();
        
        spinner.succeed('Evaluation complete!');
        
        console.log(chalk.cyan('\n📊 Evaluation Results:\n'));
        
        console.log('📈 Metrics:');
        console.log(`  Average Score: ${chalk.yellow(result.metrics.averageScore.toFixed(3))}`);
        console.log(`  Average Error: ${chalk.yellow(result.metrics.averageError.toFixed(3))}`);
        console.log(`  RMSE: ${chalk.yellow(result.metrics.rmse.toFixed(4))}`);
        console.log(`  Samples: ${result.metrics.samplesEvaluated}`);
        
        if (result.strengths.length > 0) {
          console.log('\n✅ Strengths:');
          for (const strength of result.strengths) {
            console.log(`  • ${strength}`);
          }
        }
        
        if (result.weaknesses.length > 0) {
          console.log('\n⚠️  Weaknesses:');
          for (const weakness of result.weaknesses) {
            console.log(`  • ${weakness}`);
          }
        }
      } catch (error) {
        spinner.fail('Evaluation failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createAnalyzeCommand() {
  return new Command('analyze')
    .description('Analyze prompt performance')
    .argument('<promptVersion>', 'Prompt version to analyze')
    .option('--target <version>', 'Target prompt version for comparison')
    .option('--depth <level>', 'Analysis depth (basic/detailed)', 'basic')
    .action(async (promptVersion, options) => {
      const spinner = ora('Analyzing prompt performance...').start();
      
      try {
        const db = getDatabase();
        const improvementService = new ImprovementService(db);
        await improvementService.initialize();
        
        const analysis = await improvementService.analyzePromptPerformance({
          currentVersion: promptVersion,
          targetVersion: options.target || promptVersion,
          analysisDepth: options.depth,
        });
        
        spinner.succeed('Analysis complete!');
        
        console.log(chalk.cyan('\n📊 Prompt Analysis:\n'));
        
        console.log('Current Performance:');
        console.log(`  Total Records: ${analysis.currentPerformance.totalRecords}`);
        console.log(`  Average Score: ${analysis.currentPerformance.averageScore?.toFixed(3) || 'N/A'}`);
        console.log(`  RMSE: ${analysis.currentPerformance.rmse?.toFixed(4) || 'N/A'}`);
        
        if (analysis.suggestions.length > 0) {
          console.log('\n💡 Suggestions:');
          for (const suggestion of analysis.suggestions) {
            console.log(`  • ${suggestion}`);
          }
        }
        
        if (analysis.examples.length > 0) {
          console.log('\n📝 Problem Examples:');
          for (const example of analysis.examples) {
            console.log(`\n  Input: "${example.input}"`);
            console.log(`  Current Score: ${chalk.yellow(example.currentScore.toFixed(2))}`);
            console.log(`  Expected Score: ${chalk.green(example.expectedScore.toFixed(2))}`);
            console.log(`  Issue: ${chalk.red(example.issue)}`);
          }
        }
      } catch (error) {
        spinner.fail('Analysis failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}