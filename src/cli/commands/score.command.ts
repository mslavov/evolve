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
      const spinner = ora('Initializing agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        spinner.text = 'Processing content...';
        
        const result = await agentService.run(content, {
          configKey: options.config,
        });
        
        spinner.succeed('Content processed successfully!');
        
        // Display results - interpret the output based on its structure
        console.log('\n📊 Results:');
        
        // Check if output has scoring structure
        if (typeof result.output === 'object' && 'score' in result.output) {
          console.log(chalk.cyan('Score:'), chalk.yellow(result.output.score.toFixed(2)));
          if (result.output.reasoning) {
            console.log(chalk.cyan('Reasoning:'), result.output.reasoning);
          }
          
          if (result.output.dimensions && options.verbose) {
            console.log('\n📐 Dimensions:');
            for (const [key, value] of Object.entries(result.output.dimensions)) {
              if (value !== undefined && typeof value === 'number') {
                console.log(`  ${chalk.gray(key)}:`, value.toFixed(2));
              }
            }
          }
        } else {
          // Generic output display
          console.log(chalk.cyan('Output:'), 
            typeof result.output === 'string' 
              ? result.output 
              : JSON.stringify(result.output, null, 2)
          );
        }
        
        if (options.verbose && result.metadata) {
          console.log('\n📝 Metadata:');
          for (const [key, value] of Object.entries(result.metadata)) {
            console.log(`  ${chalk.gray(key)}:`, value);
          }
        }
        
        if (result.runId) {
          console.log('\n' + chalk.gray(`Run ID: ${result.runId}`));
        }
      } catch (error) {
        spinner.fail('Failed to score content');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
  
  return command;
}