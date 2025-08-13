import { getSqliteClient, closeDatabase } from './client.js';
import { readdirSync, existsSync } from 'fs';
import chalk from 'chalk';

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  total: number;
  hasIssues: boolean;
  issues: string[];
}

/**
 * Get list of applied migrations from database
 */
export async function getAppliedMigrations(): Promise<string[]> {
  const client = getSqliteClient();
  
  try {
    const result = await client.execute('SELECT migration_name FROM __drizzle_migrations ORDER BY created_at');
    return result.rows.map(row => row.migration_name as string);
  } catch (error) {
    // Table doesn't exist yet
    return [];
  }
}

/**
 * Get list of migration files from filesystem
 */
export function getMigrationFiles(migrationsFolder = './src/db/migrations'): string[] {
  if (!existsSync(migrationsFolder)) {
    return [];
  }
  
  return readdirSync(migrationsFolder)
    .filter(f => f.endsWith('.sql') && !f.includes('snapshot'))
    .sort();
}

/**
 * Get comprehensive migration status
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const migrationsFolder = './src/db/migrations';
  const issues: string[] = [];
  
  try {
    // Get applied migrations
    const applied = await getAppliedMigrations();
    
    // Get migration files
    const files = getMigrationFiles(migrationsFolder);
    
    // Find pending migrations
    const appliedSet = new Set(applied);
    const pending = files.filter(f => !appliedSet.has(f));
    
    // Check for issues
    // Issue 1: Applied migrations that don't have files
    const filesSet = new Set(files);
    const orphaned = applied.filter(a => !filesSet.has(a));
    if (orphaned.length > 0) {
      issues.push(`Found ${orphaned.length} applied migration(s) without files: ${orphaned.join(', ')}`);
    }
    
    // Issue 2: Check if migrations are applied in wrong order
    const sortedFiles = [...files].sort();
    const appliedInFiles = applied.filter(a => filesSet.has(a));
    for (let i = 0; i < appliedInFiles.length; i++) {
      if (appliedInFiles[i] !== sortedFiles[i]) {
        issues.push(`Migrations may have been applied out of order`);
        break;
      }
    }
    
    // Issue 3: Check for journal file inconsistencies
    const journalPath = `${migrationsFolder}/meta/_journal.json`;
    if (existsSync(journalPath)) {
      try {
        const journal = JSON.parse(require('fs').readFileSync(journalPath, 'utf-8'));
        if (journal.entries && journal.entries.length !== files.length) {
          issues.push(`Journal file is out of sync: ${journal.entries.length} entries but ${files.length} migration files`);
        }
      } catch (e) {
        issues.push('Journal file exists but could not be parsed');
      }
    }
    
    return {
      applied,
      pending,
      total: files.length,
      hasIssues: issues.length > 0,
      issues
    };
  } finally {
    await closeDatabase();
  }
}

/**
 * Validate database schema matches migration files
 */
export async function validateSchema(): Promise<{ valid: boolean; errors: string[] }> {
  const client = getSqliteClient();
  const errors: string[] = [];
  
  try {
    // Check if key tables exist
    const expectedTables = ['assessments', 'configs', 'runs', 'eval_datasets', 'prompts'];
    
    for (const table of expectedTables) {
      try {
        await client.execute(`SELECT 1 FROM ${table} LIMIT 1`);
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          errors.push(`Table '${table}' does not exist`);
        }
      }
    }
    
    // Check for specific columns that have been problematic
    const columnChecks = [
      { table: 'configs', column: 'prompt_id' },
      { table: 'configs', column: 'output_type' },
      { table: 'configs', column: 'output_schema' },
      { table: 'runs', column: 'config_prompt_id' },
    ];
    
    for (const check of columnChecks) {
      try {
        await client.execute(`SELECT ${check.column} FROM ${check.table} LIMIT 1`);
      } catch (error: any) {
        if (error.message?.includes('no such column')) {
          errors.push(`Column '${check.column}' missing from table '${check.table}'`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  } finally {
    await closeDatabase();
  }
}

/**
 * Format migration status for display
 */
export function formatMigrationStatus(status: MigrationStatus): string {
  const lines: string[] = [];
  
  lines.push(chalk.blue('📊 Migration Status'));
  lines.push(chalk.gray('─'.repeat(40)));
  lines.push(`Total migrations: ${status.total}`);
  lines.push(`Applied: ${chalk.green(status.applied.length)}`);
  lines.push(`Pending: ${status.pending.length > 0 ? chalk.yellow(status.pending.length) : chalk.green('0')}`);
  
  if (status.pending.length > 0) {
    lines.push('\n' + chalk.yellow('⚠️  Pending migrations:'));
    status.pending.forEach(m => lines.push(chalk.gray(`  - ${m}`)));
    lines.push('\n' + chalk.blue('Run: pnpm db:migrate'));
  }
  
  if (status.hasIssues) {
    lines.push('\n' + chalk.red('❌ Issues detected:'));
    status.issues.forEach(issue => lines.push(chalk.red(`  - ${issue}`)));
  }
  
  return lines.join('\n');
}