import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export function createRunCommand() {
  const command = new Command('run');
  
  command
    .description('Run an agent with given input')
    .argument('[content]', 'Content to process (optional if using --input-file)')
    .option('-a, --agent <key>', 'Agent key to use')
    .option('-c, --config <key>', 'Configuration key to use (deprecated, use --agent)')
    .option('-i, --input-file <path>', 'Path to JSON file containing structured input')
    .option('-o, --output-file <path>', 'Path to save output as JSON')
    .option('--collect', 'Collect this run for assessment', false)
    .option('--verbose', 'Show detailed output', false)
    .action(async (content: string | undefined, options) => {
      const spinner = ora('Initializing agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Determine input
        let input: string | Record<string, any>;
        
        if (options.inputFile) {
          // Load input from JSON file
          if (!existsSync(options.inputFile)) {
            throw new Error(`Input file not found: ${options.inputFile}`);
          }
          
          spinner.text = 'Loading input file...';
          const fileContent = await readFile(options.inputFile, 'utf-8');
          
          try {
            input = JSON.parse(fileContent);
          } catch (parseError) {
            throw new Error(`Invalid JSON in input file: ${parseError}`);
          }
        } else if (content) {
          // Use command line argument
          input = content;
        } else {
          throw new Error('No input provided. Use either a content argument or --input-file option.');
        }
        
        spinner.text = 'Processing input...';
        
        // Prefer --agent over --config
        const agentKey = options.agent || options.config;
        
        const result = await agentService.run(input, {
          agentKey: agentKey,
        });
        
        spinner.succeed('Agent executed successfully!');
        
        // Save output to file if requested
        if (options.outputFile) {
          const outputData = {
            timestamp: new Date().toISOString(),
            agent: agentKey || 'default',
            input: input,
            output: result.output,
            metadata: result.metadata,
            runId: result.runId,
          };
          
          await writeFile(options.outputFile, JSON.stringify(outputData, null, 2));
          console.log(chalk.green(`✅ Output saved to: ${options.outputFile}`));
        }
        
        // Display results
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
        spinner.fail('Failed to run agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
  
  return command;
}