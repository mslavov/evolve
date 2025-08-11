import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';

export function createConfigCommand() {
  const command = new Command('config');
  
  command
    .description('Manage scorer configurations')
    .addCommand(createListCommand())
    .addCommand(createSetCommand())
    .addCommand(createGetCommand())
    .addCommand(createDefaultCommand());
  
  return command;
}

function createListCommand() {
  return new Command('list')
    .description('List all configurations')
    .action(async () => {
      const spinner = ora('Loading configurations...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        const configs = await agentService.listConfigs();
        
        spinner.stop();
        
        if (configs.length === 0) {
          console.log(chalk.yellow('No configurations found'));
          return;
        }
        
        console.log(chalk.cyan('\n📋 Configurations:\n'));
        
        for (const config of configs) {
          const defaultMark = config.isDefault ? chalk.green(' [DEFAULT]') : '';
          const activeMark = config.isActive ? '' : chalk.red(' [INACTIVE]');
          
          console.log(chalk.bold(`${config.key}${defaultMark}${activeMark}`));
          console.log(`  Model: ${config.model}`);
          console.log(`  Temperature: ${config.temperature}`);
          console.log(`  Prompt ID: ${config.promptId}`);
          
          if (config.averageScore) {
            console.log(`  Average Score: ${config.averageScore.toFixed(3)}`);
          }
          
          if (config.evaluationCount) {
            console.log(`  Evaluations: ${config.evaluationCount}`);
          }
          
          console.log();
        }
      } catch (error) {
        spinner.fail('Failed to load configurations');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createSetCommand() {
  return new Command('set')
    .description('Create or update a configuration')
    .argument('<key>', 'Configuration key')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --temperature <temp>', 'Temperature setting', parseFloat)
    .option('-p, --prompt <version>', 'Prompt version')
    .option('--max-tokens <n>', 'Maximum tokens', parseInt)
    .option('--default', 'Set as default configuration', false)
    .action(async (key, options) => {
      const spinner = ora('Saving configuration...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        const config = await agentService.saveConfig(key, {
          model: options.model,
          temperature: options.temperature,
          promptId: options.prompt,
          maxTokens: options.maxTokens,
        });
        
        if (options.default) {
          await agentService.setDefaultConfig(key);
        }
        
        spinner.succeed('Configuration saved successfully!');
        console.log(chalk.gray(`Key: ${config.key}`));
      } catch (error) {
        spinner.fail('Failed to save configuration');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createGetCommand() {
  return new Command('get')
    .description('Get a specific configuration')
    .argument('<key>', 'Configuration key')
    .action(async (key) => {
      const spinner = ora('Loading configuration...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        const configs = await agentService.listConfigs();
        const config = configs.find(c => c.key === key);
        
        spinner.stop();
        
        if (!config) {
          console.log(chalk.yellow(`Configuration "${key}" not found`));
          return;
        }
        
        console.log(chalk.cyan(`\n📋 Configuration: ${config.key}\n`));
        console.log(JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          promptId: config.promptId,
          maxTokens: config.maxTokens,
          isDefault: config.isDefault,
          isActive: config.isActive,
          averageScore: config.averageScore,
          evaluationCount: config.evaluationCount,
        }, null, 2));
      } catch (error) {
        spinner.fail('Failed to load configuration');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createDefaultCommand() {
  return new Command('default')
    .description('Set the default configuration')
    .argument('<key>', 'Configuration key to set as default')
    .action(async (key) => {
      const spinner = ora('Setting default configuration...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        await agentService.initialize();
        
        await agentService.setDefaultConfig(key);
        
        spinner.succeed(`Configuration "${key}" set as default`);
      } catch (error) {
        spinner.fail('Failed to set default configuration');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}