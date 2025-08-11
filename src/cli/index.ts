#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { createScoreCommand } from './commands/score.command.js';
import { createAssessCommand } from './commands/assess.command.js';
import { createDatasetCommand } from './commands/dataset.command.js';
import { createConfigCommand } from './commands/config.command.js';
import { createImproveCommand } from './commands/improve.command.js';
import { promptCommand } from './commands/prompt.command.js';
import { closeDatabase } from '../db/client.js';

// Load environment variables
config();

const program = new Command();

program
  .name('scorer')
  .description('Self-improving content usefulness scorer')
  .version('1.0.0')
  .addCommand(createScoreCommand())
  .addCommand(createAssessCommand())
  .addCommand(createDatasetCommand())
  .addCommand(createConfigCommand())
  .addCommand(createImproveCommand())
  .addCommand(promptCommand);

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

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}