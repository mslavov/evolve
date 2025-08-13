import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AssessmentService } from '../../services/assessment.service.js';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';
import { writeFileSync, readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export function createAssessCommand() {
  const command = new Command('assess');
  
  command
    .description('Manage assessments for scored content')
    .addCommand(createAddAssessmentCommand())
    .addCommand(createListPendingCommand())
    .addCommand(createStatsCommand())
    .addCommand(createExportCommand())
    .addCommand(createImportCommand());
  
  return command;
}

function createAddAssessmentCommand() {
  return new Command('add')
    .description('Add an assessment for a run')
    .argument('<runId>', 'Run ID to assess')
    .argument('<verdict>', 'Assessment verdict (correct/incorrect)')
    .option('-s, --score <score>', 'Corrected score if incorrect', parseFloat)
    .option('-r, --reasoning <text>', 'Reasoning for the assessment')
    .option('--assessor <id>', 'Assessor ID')
    .option('--confidence <value>', 'Confidence level (0-1)', parseFloat)
    .action(async (runId, verdict, options) => {
      const spinner = ora('Adding assessment...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        if (verdict !== 'correct' && verdict !== 'incorrect') {
          throw new Error('Verdict must be "correct" or "incorrect"');
        }
        
        const assessmentId = await assessmentService.addAssessment({
          runId,
          verdict,
          correctedScore: options.score,
          reasoning: options.reasoning,
          assessorId: options.assessor,
          confidence: options.confidence,
        });
        
        spinner.succeed('Assessment added successfully!');
        console.log(chalk.gray(`Assessment ID: ${assessmentId}`));
      } catch (error) {
        spinner.fail('Failed to add assessment');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createListPendingCommand() {
  return new Command('pending')
    .description('List runs pending assessment')
    .option('-l, --limit <n>', 'Number of runs to show', parseInt, 10)
    .action(async (options) => {
      const spinner = ora('Fetching pending runs...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const runs = await agentService.getPendingRuns(options.limit);
        
        spinner.stop();
        
        if (runs.length === 0) {
          console.log(chalk.yellow('No runs pending assessment'));
          return;
        }
        
        console.log(chalk.cyan(`\nFound ${runs.length} runs pending assessment:\n`));
        
        for (const run of runs) {
          console.log(chalk.bold(`Run ID: ${run.id}`));
          console.log(`  Input: ${run.input.substring(0, 100)}${run.input.length > 100 ? '...' : ''}`);
          const output = typeof run.output === 'object' ? JSON.stringify(run.output) : run.output;
          console.log(`  Output: ${output.substring(0, 100)}${output.length > 100 ? '...' : ''}`);
          console.log(`  Model: ${run.modelUsed}`);
          console.log(`  Timestamp: ${run.createdAt.toISOString()}`);
          console.log();
        }
      } catch (error) {
        spinner.fail('Failed to fetch pending runs');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createStatsCommand() {
  return new Command('stats')
    .description('Show assessment statistics')
    .action(async () => {
      const spinner = ora('Calculating statistics...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        const stats = await assessmentService.getAssessmentStats();
        
        spinner.stop();
        
        console.log(chalk.cyan('\n📊 Assessment Statistics:\n'));
        console.log(`Total Assessments: ${chalk.yellow(stats.totalAssessments)}`);
        console.log(`Correct: ${chalk.green(stats.correctCount)}`);
        console.log(`Incorrect: ${chalk.red(stats.incorrectCount)}`);
        console.log(`Accuracy Rate: ${chalk.yellow((stats.accuracyRate * 100).toFixed(1) + '%')}`);
        
        if (stats.averageCorrection > 0) {
          console.log(`Average Correction: ${chalk.yellow(stats.averageCorrection.toFixed(3))}`);
        }
        
        if (Object.keys(stats.byAssessor).length > 0) {
          console.log('\n👥 By Assessor:');
          for (const [assessor, data] of Object.entries(stats.byAssessor)) {
            console.log(`  ${assessor}: ${data.count} assessments, ${(data.accuracyRate * 100).toFixed(1)}% accuracy`);
          }
        }
      } catch (error) {
        spinner.fail('Failed to calculate statistics');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createExportCommand() {
  return new Command('export')
    .description('Export pending runs or datasets for assessment')
    .option('-o, --output <file>', 'Output file path', 'assessment-export.csv')
    .option('-t, --type <type>', 'Export type: pending|dataset', 'pending')
    .option('--version <version>', 'Dataset version to export')
    .option('--split <split>', 'Dataset split to export (train/validation/test)')
    .option('--limit <limit>', 'Maximum number of records to export', parseInt)
    .action(async (options) => {
      const spinner = ora('Exporting data...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        let csvContent = '';
        
        if (options.type === 'pending') {
          // Export pending runs for assessment
          const pendingRuns = await assessmentService.getPendingRuns(options.limit);
          
          csvContent = 'runId,agentId,input,output,metadata\n';
          for (const run of pendingRuns) {
            const metadata = JSON.stringify(run.metadata || {});
            const outputStr = typeof run.output === 'string' ? run.output : JSON.stringify(run.output);
            csvContent += `"${run.id}","${run.agentId}","${run.input.replace(/"/g, '""')}","${outputStr.replace(/"/g, '""')}","${metadata.replace(/"/g, '""')}"\n`;
          }
          
          spinner.succeed(`Exported ${pendingRuns.length} pending runs to ${options.output}`);
        } else if (options.type === 'dataset') {
          // Export dataset for training/evaluation
          const result = await assessmentService.exportDataset({
            version: options.version,
            split: options.split,
          });
          
          // Check if result is a string (JSONL format) or object with records
          if (typeof result === 'string') {
            // JSONL format
            writeFileSync(options.output, result);
            const lineCount = result.split('\n').filter(line => line.trim()).length;
            spinner.succeed(`Exported ${lineCount} dataset records to ${options.output}`);
            console.log(chalk.green(`✓ Data exported to ${options.output}`));
            return;
          }
          
          const { records } = result;
          csvContent = 'id,input,correctedScore,verdict,datasetType,metadata\n';
          for (const record of records) {
            const metadata = JSON.stringify(record.metadata || {});
            csvContent += `"${record.id}","${record.input}",${record.correctedScore},"${record.verdict}","${record.datasetType}","${metadata.replace(/"/g, '""')}"\n`;
          }
          
          spinner.succeed(`Exported ${records.length} dataset records to ${options.output}`);
        } else {
          throw new Error('Invalid export type. Use "pending" or "dataset"');
        }
        
        writeFileSync(options.output, csvContent);
        console.log(chalk.green(`✓ Data exported to ${options.output}`));
        
      } catch (error) {
        spinner.fail('Failed to export data');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createImportCommand() {
  return new Command('import')
    .description('Import assessments from CSV file')
    .argument('<file>', 'CSV file to import')
    .option('--dry-run', 'Preview import without making changes')
    .action(async (file, options) => {
      const spinner = ora('Importing assessments...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        // Read and parse CSV
        const csvContent = readFileSync(file, 'utf-8');
        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
        });
        
        // Define schema for assessment records
        const assessmentSchema = z.object({
          runId: z.string().min(1),
          verdict: z.enum(['correct', 'incorrect']),
          correctedScore: z.coerce.number().min(0).max(1).optional(),
          reasoning: z.string().optional(),
          confidence: z.coerce.number().min(0).max(1).optional(),
          assessorId: z.string().optional(),
        });
        
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        
        for (const [index, record] of records.entries()) {
          try {
            const validated = assessmentSchema.parse(record);
            
            if (!options.dryRun) {
              await assessmentService.addAssessment({
                runId: validated.runId,
                verdict: validated.verdict,
                correctedScore: validated.correctedScore,
                reasoning: validated.reasoning,
                confidence: validated.confidence,
                assessorId: validated.assessorId,
                assessedBy: 'human',
              });
            }
            
            imported++;
            spinner.text = `Processing... (${imported} imported, ${skipped} skipped)`;
          } catch (error) {
            skipped++;
            errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        spinner.succeed(`Import completed: ${imported} assessments imported, ${skipped} skipped`);
        
        if (options.dryRun) {
          console.log(chalk.yellow('\nDry run mode - no changes were made'));
        }
        
        if (errors.length > 0) {
          console.log(chalk.yellow('\nErrors encountered:'));
          errors.slice(0, 10).forEach(error => console.log(chalk.yellow(`  - ${error}`)));
          if (errors.length > 10) {
            console.log(chalk.yellow(`  ... and ${errors.length - 10} more errors`));
          }
        }
        
      } catch (error) {
        spinner.fail('Failed to import assessments');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}