import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';

export function createScoreCommand() {
  const command = new Command('score');
  
  command
    .description('Score content for usefulness')
    .argument('<content>', 'Content to score')
    .option('-c, --config <key>', 'Configuration key to use')
    .option('--collect', 'Collect this run for assessment', false)
    .option('--verbose', 'Show detailed output', false)
    .action(async (content: string, options) => {
      const spinner = ora('Initializing scorer...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        spinner.text = 'Scoring content...';
        
        const result = await agentService.scoreContent(content, {
          configKey: options.config,
          collectRun: options.collect,
          includeTelemetry: options.verbose,
        });
        
        spinner.succeed('Content scored successfully!');
        
        // Display results
        console.log('\n📊 Scoring Results:');
        console.log(chalk.cyan('Score:'), chalk.yellow(result.score.toFixed(2)));
        console.log(chalk.cyan('Reasoning:'), result.reasoning);
        
        if (result.dimensions && options.verbose) {
          console.log('\n📐 Dimensions:');
          for (const [key, value] of Object.entries(result.dimensions)) {
            if (value !== undefined) {
              console.log(`  ${chalk.gray(key)}:`, value.toFixed(2));
            }
          }
        }
        
        if (result.runId) {
          console.log('\n' + chalk.gray(`Run ID: ${result.runId}`));
          console.log(chalk.gray('This run has been collected for assessment'));
        }
      } catch (error) {
        spinner.fail('Failed to score content');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
  
  return command;
}