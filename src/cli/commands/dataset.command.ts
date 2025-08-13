import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync } from 'fs';
import { AssessmentService } from '../../services/assessment.service.js';
import { getDatabase } from '../../db/client.js';

export function createDatasetCommand() {
  const command = new Command('dataset');
  
  command
    .description('Manage evaluation datasets')
    .addCommand(createBuildCommand())
    .addCommand(createExportCommand())
    .addCommand(createStatsCommand())
    .addCommand(createClearCommand());
  
  return command;
}

function createBuildCommand() {
  return new Command('build')
    .description('Build dataset from assessed runs')
    .option('--dataset-version <version>', 'Dataset version')
    .option('-s, --split <split>', 'Dataset split (train/validation/test)')
    .option('-q, --quality <quality>', 'Quality filter (high/medium/low)')
    .option('--min-confidence <value>', 'Minimum confidence threshold', parseFloat)
    .option('--sampling-rate <rate>', 'Sampling rate (0-1)', parseFloat)
    .action(async (options) => {
      const spinner = ora('Building dataset...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        const result = await assessmentService.buildDataset({
          version: options.datasetVersion,
          split: options.split,
          quality: options.quality,
          minConfidence: options.minConfidence,
          samplingRate: options.samplingRate,
        });
        
        spinner.succeed('Dataset built successfully!');
        console.log(chalk.green(`\n✅ Added ${result.added} records`));
        console.log(chalk.yellow(`⚠️  Filtered ${result.filtered} records`));
        console.log(chalk.gray(`Version: ${result.version}`));
      } catch (error) {
        spinner.fail('Failed to build dataset');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createExportCommand() {
  return new Command('export')
    .description('Export dataset for training/evaluation')
    .option('--dataset-version <version>', 'Dataset version to export')
    .option('-s, --split <split>', 'Dataset split to export')
    .option('-f, --format <format>', 'Export format (json/jsonl)', 'json')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      const spinner = ora('Exporting dataset...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        const data = await assessmentService.exportDataset({
          version: options.datasetVersion,
          split: options.split,
          format: options.format,
        });
        
        spinner.stop();
        
        if (options.output) {
          const content = typeof data === 'string' 
            ? data 
            : JSON.stringify(data, null, 2);
          
          writeFileSync(options.output, content);
          console.log(chalk.green(`✅ Dataset exported to ${options.output}`));
        } else {
          console.log(data);
        }
      } catch (error) {
        spinner.fail('Failed to export dataset');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createStatsCommand() {
  return new Command('stats')
    .description('Show dataset statistics')
    .action(async () => {
      const spinner = ora('Calculating statistics...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        const stats = await assessmentService.getDatasetStats();
        
        spinner.stop();
        
        console.log(chalk.cyan('\n📊 Dataset Statistics:\n'));
        console.log(`Total Records: ${chalk.yellow(stats.totalRecords)}`);
        console.log(`Average Score: ${chalk.yellow(stats.averageScore.toFixed(3))}`);
        
        if (Object.keys(stats.bySplit).length > 0) {
          console.log('\n📂 By Split:');
          for (const [split, count] of Object.entries(stats.bySplit)) {
            console.log(`  ${split}: ${count}`);
          }
        }
        
        if (Object.keys(stats.bySource).length > 0) {
          console.log('\n🔍 By Source:');
          for (const [source, count] of Object.entries(stats.bySource)) {
            console.log(`  ${source}: ${count}`);
          }
        }
        
        if (Object.keys(stats.byQuality).length > 0) {
          console.log('\n⭐ By Quality:');
          for (const [quality, count] of Object.entries(stats.byQuality)) {
            console.log(`  ${quality}: ${count}`);
          }
        }
        
        if (stats.versions.length > 0) {
          console.log('\n🏷️  Versions:', stats.versions.join(', '));
        }
      } catch (error) {
        spinner.fail('Failed to calculate statistics');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createClearCommand() {
  return new Command('clear')
    .description('Clear dataset records')
    .option('--dataset-version <version>', 'Clear specific version')
    .option('-s, --split <split>', 'Clear specific split')
    .option('--confirm', 'Confirm the action', false)
    .action(async (options) => {
      if (!options.confirm) {
        console.log(chalk.yellow('⚠️  This will permanently delete dataset records.'));
        console.log('Add --confirm to proceed.');
        return;
      }
      
      const spinner = ora('Clearing dataset...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        const deleted = await assessmentService.clearDataset({
          version: options.datasetVersion,
          split: options.split,
        });
        
        spinner.succeed(`Cleared ${deleted} dataset records`);
      } catch (error) {
        spinner.fail('Failed to clear dataset');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}