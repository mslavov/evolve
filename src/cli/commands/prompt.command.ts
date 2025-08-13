import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getDatabase } from '../../db/client.js';
import { PromptService } from '../../services/prompt.service.js';
import { AgentService } from '../../services/agent.service.js';
import type { PromptGenerationStrategy } from '../../services/prompt.service.js';

export const promptCommand = new Command('prompt')
  .description('Manage scoring prompts');

// List all prompts
promptCommand
  .command('list')
  .description('List all prompts with their performance metrics')
  .option('-a, --all', 'Show all prompts including inactive')
  .option('-p, --production', 'Show only production prompts')
  .action(async (options) => {
    const spinner = ora('Loading prompts...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      
      const filters = {
        isActive: !options.all ? true : undefined,
        isProduction: options.production || undefined,
      };
      
      const prompts = await promptService.promptRepo.findMany(filters);
      
      spinner.succeed(`Found ${prompts.length} prompts`);
      
      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found'));
        return;
      }
      
      console.log(chalk.cyan('\n📝 Prompts:\n'));
      
      for (const prompt of prompts) {
        console.log(chalk.bold(`${prompt.version}`));
        console.log(`  Name: ${prompt.name}`);
        if (prompt.description) {
          console.log(`  Description: ${prompt.description}`);
        }
        console.log(`  Created: ${prompt.createdBy} | ${prompt.createdAt.toLocaleString()}`);
        
        if (prompt.isTested) {
          console.log(`  Performance:`);
          console.log(`    MAE: ${chalk.yellow(prompt.mae?.toFixed(3) || 'N/A')}`);
          console.log(`    Correlation: ${chalk.yellow(prompt.correlation?.toFixed(3) || 'N/A')}`);
          console.log(`    RMSE: ${chalk.yellow(prompt.rmse?.toFixed(3) || 'N/A')}`);
        }
        
        const badges = [];
        if (prompt.isProduction) badges.push(chalk.green('PRODUCTION'));
        if (!prompt.isActive) badges.push(chalk.gray('INACTIVE'));
        if (!prompt.isTested) badges.push(chalk.yellow('UNTESTED'));
        
        if (badges.length > 0) {
          console.log(`  Status: ${badges.join(' ')}`);
        }
        
        console.log();
      }
    } catch (error) {
      spinner.fail('Failed to list prompts');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Test a prompt
promptCommand
  .command('test')
  .description('Test a specific prompt against evaluation data')
  .argument('<version>', 'Prompt version to test')
  .option('-s, --split <split>', 'Dataset split to use (validation/test)', 'test')
  .option('-l, --limit <limit>', 'Number of samples to test', '50')
  .action(async (version, options) => {
    const spinner = ora('Testing prompt...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      const agentService = new AgentService(db);
      
      
      const result = await promptService.testPrompt(
        version,
        agentService,
        {
          split: options.split,
          limit: parseInt(options.limit),
        }
      );
      
      spinner.succeed('Test complete!');
      
      console.log(chalk.cyan('\n📊 Test Results:\n'));
      console.log(`Prompt: ${chalk.bold(result.version)}`);
      console.log(`Samples Evaluated: ${result.samplesEvaluated}`);
      console.log(`MAE: ${chalk.yellow(result.mae.toFixed(4))}`);
      console.log(`Correlation: ${chalk.yellow(result.correlation.toFixed(4))}`);
      console.log(`RMSE: ${chalk.yellow(result.rmse.toFixed(4))}`);
      
    } catch (error) {
      spinner.fail('Test failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Generate new prompt variations
promptCommand
  .command('generate')
  .description('Generate new prompt variations using AI')
  .argument('<baseVersion>', 'Base prompt version to vary')
  .option('-s, --strategy <strategy>', 'Generation strategy (dimension_emphasis/reasoning_style/verbosity/few_shot)', 'dimension_emphasis')
  .option('-p, --params <params>', 'Strategy parameters as JSON')
  .action(async (baseVersion, options) => {
    const spinner = ora('Generating prompt variation...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      const agentService = new AgentService(db);
      
      
      const strategy: PromptGenerationStrategy = {
        type: options.strategy as any,
        params: options.params ? JSON.parse(options.params) : undefined,
      };
      
      const newPrompt = await promptService.generateVariation(
        baseVersion,
        strategy,
        agentService
      );
      
      spinner.succeed('Generated new prompt!');
      
      console.log(chalk.cyan('\n✨ New Prompt:\n'));
      console.log(`Version: ${chalk.bold(newPrompt.version)}`);
      console.log(`Name: ${newPrompt.name}`);
      console.log(`Strategy: ${strategy.type}`);
      console.log(`Parent: ${baseVersion}`);
      console.log('\nTemplate:');
      console.log(chalk.gray(newPrompt.template.substring(0, 500) + '...'));
      
      console.log(chalk.yellow('\nRun "npm run cli prompt test ' + newPrompt.version + '" to evaluate it'));
      
    } catch (error) {
      spinner.fail('Generation failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Compare two prompts
promptCommand
  .command('compare')
  .description('Compare performance of two prompts')
  .argument('<version1>', 'First prompt version')
  .argument('<version2>', 'Second prompt version')
  .action(async (version1, version2) => {
    const spinner = ora('Comparing prompts...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      const agentService = new AgentService(db);
      
      
      const comparison = await promptService.comparePrompts(
        version1,
        version2,
        agentService
      );
      
      spinner.succeed('Comparison complete!');
      
      console.log(chalk.cyan('\n⚖️  Comparison Results:\n'));
      
      console.log(chalk.bold(`Prompt 1: ${version1}`));
      console.log(`  MAE: ${chalk.yellow(comparison.prompt1.mae.toFixed(4))}`);
      console.log(`  Correlation: ${chalk.yellow(comparison.prompt1.correlation.toFixed(4))}`);
      console.log(`  RMSE: ${chalk.yellow(comparison.prompt1.rmse.toFixed(4))}`);
      
      console.log();
      
      console.log(chalk.bold(`Prompt 2: ${version2}`));
      console.log(`  MAE: ${chalk.yellow(comparison.prompt2.mae.toFixed(4))}`);
      console.log(`  Correlation: ${chalk.yellow(comparison.prompt2.correlation.toFixed(4))}`);
      console.log(`  RMSE: ${chalk.yellow(comparison.prompt2.rmse.toFixed(4))}`);
      
      console.log();
      console.log(chalk.green(`🏆 Winner: ${comparison.winner}`));
      console.log(`Improvement: ${chalk.yellow(comparison.improvement.toFixed(4))} MAE`);
      
    } catch (error) {
      spinner.fail('Comparison failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Promote a prompt to production
promptCommand
  .command('promote')
  .description('Promote a prompt to production status')
  .argument('<version>', 'Prompt version to promote')
  .action(async (version) => {
    const spinner = ora('Promoting prompt...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      
      await promptService.promoteToProduction(version);
      
      spinner.succeed(`Promoted ${version} to production!`);
      
    } catch (error) {
      spinner.fail('Promotion failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Get prompt statistics
promptCommand
  .command('stats')
  .description('Show prompt statistics')
  .action(async () => {
    const spinner = ora('Loading statistics...').start();
    
    try {
      const db = getDatabase();
      const promptService = new PromptService(db);
      
      const stats = await promptService.getStats();
      
      spinner.succeed('Statistics loaded!');
      
      console.log(chalk.cyan('\n📈 Prompt Statistics:\n'));
      console.log(`Total Prompts: ${stats.totalPrompts}`);
      console.log(`Human Created: ${stats.humanCreated}`);
      console.log(`AI Generated: ${stats.aiGenerated}`);
      console.log(`Tested: ${stats.tested}`);
      console.log(`In Production: ${stats.production}`);
      console.log(`Average MAE: ${chalk.yellow(stats.averageMae.toFixed(4))}`);
      
      if (stats.bestPrompt) {
        console.log(`\n🏆 Best Prompt: ${chalk.bold(stats.bestPrompt.version)}`);
        console.log(`   MAE: ${chalk.green(stats.bestPrompt.mae.toFixed(4))}`);
      }
      
    } catch (error) {
      spinner.fail('Failed to load statistics');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });