import { getSqliteClient, getDatabase, closeDatabase } from './client.js';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import chalk from 'chalk';
import crypto from 'crypto';

interface MigrationRecord {
  id: number;
  hash: string;
  created_at: number;
}

/**
 * Get hash of migration file content for tracking
 */
function getMigrationHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get list of applied migrations from database
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const client = getSqliteClient();
  
  try {
    // Check if table exists and has the right structure
    const tableInfo = await client.execute(`PRAGMA table_info(__drizzle_migrations)`);
    
    if (tableInfo.rows.length > 0) {
      // Table exists, check if it has migration_name column
      const hasNameColumn = tableInfo.rows.some((row: any) => row.name === 'migration_name');
      
      if (!hasNameColumn) {
        // Old table structure, migrate it
        console.log(chalk.yellow('  Migrating old __drizzle_migrations table structure...'));
        
        // Create new table with correct structure
        await client.execute(`
          CREATE TABLE IF NOT EXISTS "__drizzle_migrations_new" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            migration_name TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
        
        // Copy data from old table (we'll use empty migration names for now)
        await client.execute(`
          INSERT INTO __drizzle_migrations_new (hash, migration_name, created_at)
          SELECT hash, 'legacy_' || id, created_at FROM __drizzle_migrations
        `);
        
        // Drop old table and rename new one
        await client.execute(`DROP TABLE __drizzle_migrations`);
        await client.execute(`ALTER TABLE __drizzle_migrations_new RENAME TO __drizzle_migrations`);
        
        console.log(chalk.green('  ✓ Migration table structure updated'));
      }
    } else {
      // Table doesn't exist, create it
      await client.execute(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL UNIQUE,
          migration_name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
    }
    
    const result = await client.execute('SELECT migration_name FROM __drizzle_migrations');
    return new Set(result.rows.map(row => row.migration_name as string));
  } catch (error) {
    console.error(chalk.yellow('Warning: Could not read migrations table, assuming fresh database'));
    return new Set();
  }
}

/**
 * Get list of migration files from filesystem
 */
function getMigrationFiles(migrationsFolder: string): Array<{ name: string; path: string; content: string }> {
  if (!existsSync(migrationsFolder)) {
    return [];
  }
  
  const files = readdirSync(migrationsFolder)
    .filter(f => f.endsWith('.sql') && !f.includes('snapshot'))
    .sort(); // Sort to ensure order
  
  return files.map(name => ({
    name,
    path: join(migrationsFolder, name),
    content: readFileSync(join(migrationsFolder, name), 'utf-8')
  }));
}

/**
 * Apply a single migration
 */
async function applyMigration(
  client: ReturnType<typeof getSqliteClient>,
  migration: { name: string; content: string }
): Promise<void> {
  console.log(chalk.blue(`  Applying migration: ${migration.name}`));
  
  try {
    // Execute migration SQL
    const statements = migration.content
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await client.execute(statement);
    }
    
    // Record successful migration
    const hash = getMigrationHash(migration.content);
    await client.execute({
      sql: `INSERT INTO __drizzle_migrations (hash, migration_name, created_at) VALUES (?, ?, ?)`,
      args: [hash, migration.name, Date.now()]
    });
    
    console.log(chalk.green(`  ✓ Applied: ${migration.name}`));
  } catch (error: any) {
    // Check if it's a "table already exists" error - might mean migration was partially applied
    if (error.message?.includes('already exists')) {
      console.log(chalk.yellow(`  ⚠ Skipping ${migration.name}: Table/column already exists`));
      // Still record it as applied to prevent retrying
      const hash = getMigrationHash(migration.content);
      try {
        await client.execute({
          sql: `INSERT INTO __drizzle_migrations (hash, migration_name, created_at) VALUES (?, ?, ?)`,
          args: [hash, migration.name, Date.now()]
        });
      } catch (insertError) {
        // Migration was already recorded, that's fine
      }
    } else if (error.message?.includes('no such table') && migration.content.toLowerCase().includes('drop table')) {
      // Trying to drop a table that doesn't exist - that's okay
      console.log(chalk.yellow(`  ⚠ Skipping ${migration.name}: Table to drop doesn't exist`));
      // Still record it as applied
      const hash = getMigrationHash(migration.content);
      try {
        await client.execute({
          sql: `INSERT INTO __drizzle_migrations (hash, migration_name, created_at) VALUES (?, ?, ?)`,
          args: [hash, migration.name, Date.now()]
        });
      } catch (insertError) {
        // Migration was already recorded, that's fine
      }
    } else if (error.message?.includes('duplicate column name')) {
      // Column already exists - migration was partially applied
      console.log(chalk.yellow(`  ⚠ Skipping ${migration.name}: Column already exists`));
      // Still record it as applied
      const hash = getMigrationHash(migration.content);
      try {
        await client.execute({
          sql: `INSERT INTO __drizzle_migrations (hash, migration_name, created_at) VALUES (?, ?, ?)`,
          args: [hash, migration.name, Date.now()]
        });
      } catch (insertError) {
        // Migration was already recorded, that's fine
      }
    } else {
      throw error;
    }
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(options?: { migrationsFolder?: string }): Promise<void> {
  const migrationsFolder = options?.migrationsFolder || './src/db/migrations';
  
  console.log(chalk.blue('🗄️  Running database migrations...'));
  console.log(chalk.gray(`  Migrations folder: ${migrationsFolder}`));
  
  try {
    // Ensure data directory exists
    const dbUrl = process.env.DATABASE_URL || 'file:./data/evolve.db';
    if (dbUrl.startsWith('file:')) {
      const dbPath = dbUrl.replace('file:', '');
      const dbDir = dirname(dbPath);
      
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        console.log(chalk.gray(`  Created directory: ${dbDir}`));
      }
    }
    
    // Get database client
    const client = getSqliteClient();
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    console.log(chalk.gray(`  Found ${appliedMigrations.size} applied migrations`));
    
    // Get migration files
    const migrationFiles = getMigrationFiles(migrationsFolder);
    console.log(chalk.gray(`  Found ${migrationFiles.length} migration files`));
    
    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(m => !appliedMigrations.has(m.name));
    
    if (pendingMigrations.length === 0) {
      console.log(chalk.green('✓ All migrations are up to date'));
      return;
    }
    
    console.log(chalk.yellow(`\n  ${pendingMigrations.length} pending migration(s):`));
    pendingMigrations.forEach(m => console.log(chalk.gray(`    - ${m.name}`)));
    console.log();
    
    // Apply pending migrations
    for (const migration of pendingMigrations) {
      await applyMigration(client, migration);
    }
    
    console.log(chalk.green(`\n✓ Successfully applied ${pendingMigrations.length} migration(s)`));
  } catch (error) {
    console.error(chalk.red('\n✗ Migration failed:'), error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

/**
 * Get migration status without applying
 */
export async function getMigrationStatus(options?: { migrationsFolder?: string }): Promise<{
  applied: string[];
  pending: string[];
  total: number;
}> {
  const migrationsFolder = options?.migrationsFolder || './src/db/migrations';
  
  try {
    const appliedMigrations = await getAppliedMigrations();
    const migrationFiles = getMigrationFiles(migrationsFolder);
    const pendingMigrations = migrationFiles.filter(m => !appliedMigrations.has(m.name));
    
    return {
      applied: Array.from(appliedMigrations),
      pending: pendingMigrations.map(m => m.name),
      total: migrationFiles.length
    };
  } finally {
    await closeDatabase();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}