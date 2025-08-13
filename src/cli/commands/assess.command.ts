import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AssessmentService } from '../../services/assessment.service.js';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';

export function createAssessCommand() {
  const command = new Command('assess');
  
  command
    .description('Manage assessments for scored content')
    .addCommand(createAddAssessmentCommand())
    .addCommand(createListPendingCommand())
    .addCommand(createStatsCommand())
    .addCommand(createSkipCommand());
  
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

function createSkipCommand() {
  return new Command('skip')
    .description('Skip runs for assessment')
    .argument('<runIds...>', 'Run IDs to skip')
    .action(async (runIds) => {
      const spinner = ora('Marking runs as skipped...').start();
      
      try {
        const db = getDatabase();
        const assessmentService = new AssessmentService(db);
        
        await assessmentService.skipRuns(runIds);
        
        spinner.succeed(`Marked ${runIds.length} runs as skipped`);
      } catch (error) {
        spinner.fail('Failed to skip runs');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}