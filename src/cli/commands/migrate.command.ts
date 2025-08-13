import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { 
  getMigrationStatus, 
  formatMigrationStatus, 
  validateSchema 
} from '../../db/migration-utils.js';
import { runMigrations, getMigrationStatus as getSimpleStatus } from '../../db/migrate.js';
import { getSqliteClient, closeDatabase } from '../../db/client.js';

export const migrateCommand = new Command('migrate')
  .description('Manage database migrations')
  .action(async () => {
    // Default action: show status
    await showStatus();
  });

// Subcommand: migrate up
migrateCommand
  .command('up')
  .description('Apply pending migrations')
  .option('--dry-run', 'Show what would be migrated without applying')
  .action(async (options) => {
    if (options.dryRun) {
      const status = await getSimpleStatus();
      if (status.pending.length === 0) {
        console.log(chalk.green('✓ All migrations are up to date'));
      } else {
        console.log(chalk.yellow(`Would apply ${status.pending.length} migration(s):`));
        status.pending.forEach(m => console.log(chalk.gray(`  - ${m}`)));
      }
      return;
    }
    
    const spinner = ora('Applying migrations...').start();
    try {
      await runMigrations();
      spinner.succeed('Migrations applied successfully');
    } catch (error) {
      spinner.fail('Migration failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Subcommand: migrate status
migrateCommand
  .command('status')
  .description('Show migration status')
  .action(async () => {
    await showStatus();
  });

// Subcommand: migrate list
migrateCommand
  .command('list')
  .description('List all migrations with their status')
  .action(async () => {
    const status = await getMigrationStatus();
    
    console.log(chalk.blue('📋 Migration List'));
    console.log(chalk.gray('─'.repeat(50)));
    
    // Combine all migrations and show status
    const allMigrations = new Set([...status.applied, ...status.pending]);
    const sortedMigrations = Array.from(allMigrations).sort();
    
    for (const migration of sortedMigrations) {
      const isApplied = status.applied.includes(migration);
      const symbol = isApplied ? chalk.green('✓') : chalk.yellow('○');
      const label = isApplied ? chalk.green('applied') : chalk.yellow('pending');
      console.log(`${symbol} ${migration} [${label}]`);
    }
    
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Total: ${sortedMigrations.length} | Applied: ${chalk.green(status.applied.length)} | Pending: ${chalk.yellow(status.pending.length)}`);
  });

// Subcommand: migrate validate
migrateCommand
  .command('validate')
  .description('Validate database schema integrity')
  .action(async () => {
    const spinner = ora('Validating schema...').start();
    
    try {
      const migrationStatus = await getMigrationStatus();
      const schemaValidation = await validateSchema();
      
      spinner.stop();
      
      // Show migration status
      console.log(formatMigrationStatus(migrationStatus));
      
      // Show schema validation
      console.log('\n' + chalk.blue('🔍 Schema Validation'));
      console.log(chalk.gray('─'.repeat(40)));
      
      if (schemaValidation.valid) {
        console.log(chalk.green('✓ Schema is valid'));
      } else {
        console.log(chalk.red('✗ Schema validation failed:'));
        schemaValidation.errors.forEach(error => {
          console.log(chalk.red(`  - ${error}`));
        });
        console.log('\n' + chalk.yellow('Run: pnpm db:migrate up'));
      }
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Subcommand: migrate repair
migrateCommand
  .command('repair')
  .description('Repair migration issues and sync state')
  .option('--force', 'Force repair even if dangerous')
  .action(async (options) => {
    console.log(chalk.yellow('⚠️  Migration Repair Tool'));
    console.log(chalk.gray('This will attempt to fix migration issues\n'));
    
    const spinner = ora('Analyzing migration state...').start();
    
    try {
      const status = await getMigrationStatus();
      spinner.stop();
      
      if (!status.hasIssues && status.pending.length === 0) {
        console.log(chalk.green('✓ No issues detected, migrations are healthy'));
        return;
      }
      
      // Show issues
      if (status.hasIssues) {
        console.log(chalk.red('Issues found:'));
        status.issues.forEach(issue => console.log(chalk.red(`  - ${issue}`)));
        console.log();
      }
      
      // Fix journal file if needed
      if (status.issues.some(i => i.includes('Journal file'))) {
        console.log(chalk.blue('Fixing journal file...'));
        await repairJournal();
      }
      
      // Apply pending migrations
      if (status.pending.length > 0) {
        console.log(chalk.blue(`\nApplying ${status.pending.length} pending migration(s)...`));
        await runMigrations();
      }
      
      console.log(chalk.green('\n✓ Repair completed successfully'));
    } catch (error) {
      spinner.fail('Repair failed');
      console.error(chalk.red('Error:'), error);
      
      if (!options.force) {
        console.log(chalk.yellow('\nTry running with --force to override safety checks'));
      }
      process.exit(1);
    }
  });

// Subcommand: migrate reset
migrateCommand
  .command('reset')
  .description('Reset database and reapply all migrations (WARNING: Deletes all data)')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async (options) => {
    if (!options.confirm) {
      console.log(chalk.red('⚠️  WARNING: This will delete all data in the database!'));
      console.log(chalk.yellow('Run with --confirm to proceed'));
      return;
    }
    
    const spinner = ora('Resetting database...').start();
    
    try {
      // Delete database file
      const { execSync } = await import('child_process');
      execSync('rm -f data/scoring.db');
      spinner.text = 'Database deleted, applying migrations...';
      
      // Run migrations
      await runMigrations();
      
      spinner.succeed('Database reset successfully');
      console.log(chalk.blue('You may want to run: pnpm db:seed'));
    } catch (error) {
      spinner.fail('Reset failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// Helper function to show status
async function showStatus() {
  const spinner = ora('Checking migration status...').start();
  
  try {
    const status = await getMigrationStatus();
    spinner.stop();
    console.log(formatMigrationStatus(status));
  } catch (error) {
    spinner.fail('Failed to get migration status');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

// Helper function to repair journal
async function repairJournal() {
  const fs = await import('fs');
  const path = await import('path');
  
  const migrationsFolder = './src/db/migrations';
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  
  // Get all migration files
  const files = fs.readdirSync(migrationsFolder)
    .filter(f => f.endsWith('.sql') && !f.includes('snapshot'))
    .sort();
  
  // Create new journal entries
  const entries = files.map((file, idx) => ({
    idx,
    version: "6",
    when: Date.now() + idx,
    tag: file.replace('.sql', ''),
    breakpoints: true
  }));
  
  // Write new journal
  const journal = {
    version: "7",
    dialect: "sqlite",
    entries
  };
  
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  
  console.log(chalk.green(`  ✓ Journal repaired with ${entries.length} entries`));
}