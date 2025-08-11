import { migrate } from 'drizzle-orm/libsql/migrator';
import { getSqliteClient, getDatabase, closeDatabase } from './client.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';

async function runMigrations() {
  console.log(chalk.blue('Running database migrations...'));
  
  try {
    // Ensure data directory exists
    const dbUrl = process.env.DATABASE_URL || 'file:./data/scoring.db';
    if (dbUrl.startsWith('file:')) {
      const dbPath = dbUrl.replace('file:', '');
      const dbDir = dirname(dbPath);
      
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        console.log(chalk.gray(`Created directory: ${dbDir}`));
      }
    }
    
    // Get database instance
    const db = getDatabase();
    
    // Run migrations
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    
    console.log(chalk.green('✓ Migrations completed successfully'));
  } catch (error) {
    console.error(chalk.red('Migration failed:'), error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations };