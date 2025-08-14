#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { createRunCommand } from './commands/run.command.js';
import { createAssessCommand } from './commands/assess.command.js';
import { createDatasetCommand } from './commands/dataset.command.js';
import { createAgentCommand } from './commands/agent.command.js';
import { createImproveCommand } from './commands/improve.command.js';
import { createEvalCommand } from './commands/eval.command.js';
import { promptCommand } from './commands/prompt.command.js';
import { migrateCommand } from './commands/migrate.command.js';
import { closeDatabase } from '../db/client.js';
import { getMigrationStatus } from '../db/migration-utils.js';

// Load environment variables
config();

// Check for pending migrations on startup
async function checkMigrations() {
  // Skip check for migration commands themselves
  const args = process.argv.slice(2);
  if (args[0] === 'migrate' || process.env.SKIP_MIGRATION_CHECK === 'true') {
    return;
  }
  
  try {
    const status = await getMigrationStatus();
    
    if (status.pending.length > 0) {
      console.log(chalk.yellow('\n⚠️  Database migrations required'));
      console.log(chalk.gray(`   ${status.pending.length} pending migration(s):`));
      status.pending.slice(0, 3).forEach(m => 
        console.log(chalk.gray(`   - ${m}`))
      );
      if (status.pending.length > 3) {
        console.log(chalk.gray(`   ... and ${status.pending.length - 3} more`));
      }
      console.log(chalk.blue('\n   Run: pnpm cli migrate up\n'));
      
      // In development, offer to auto-migrate
      if (process.env.NODE_ENV === 'development') {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.cyan('Apply migrations now? (y/N) '), resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() === 'y') {
          const { runMigrations } = await import('../db/migrate.js');
          await runMigrations();
          console.log();
        }
      }
    }
    
    if (status.hasIssues) {
      console.log(chalk.red('\n⚠️  Migration issues detected:'));
      status.issues.forEach(issue => 
        console.log(chalk.red(`   - ${issue}`))
      );
      console.log(chalk.blue('\n   Run: pnpm cli migrate repair\n'));
    }
  } catch (error) {
    // Don't fail the CLI if migration check fails
    console.log(chalk.gray('Could not check migration status'));
  }
}

const program = new Command();

program
  .name('evolve')
  .description('Self-improving AI system with database migrations')
  .version('1.0.0')
  .addCommand(createRunCommand())
  .addCommand(createAssessCommand())
  .addCommand(createDatasetCommand())
  .addCommand(createAgentCommand())
  .addCommand(createImproveCommand())
  .addCommand(createEvalCommand())
  .addCommand(promptCommand)
  .addCommand(migrateCommand);

// Handle errors gracefully
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\nShutting down...'));
  await closeDatabase();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  await closeDatabase();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  await closeDatabase();
  process.exit(1);
});

// Main execution
async function main() {
  // Check migrations before parsing commands
  await checkMigrations();
  
  // Parse command line arguments
  program.parse(process.argv);
  
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch(console.error);