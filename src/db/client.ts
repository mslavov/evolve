import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema/index.js';

// Database client singleton
let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteClient: ReturnType<typeof createClient> | null = null;

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
}

/**
 * Get or create the database instance
 */
export function getDatabase(config?: DatabaseConfig) {
  if (!dbInstance) {
    const url = config?.url || process.env.DATABASE_URL || 'file:./data/scoring.db';
    const authToken = config?.authToken || process.env.DATABASE_AUTH_TOKEN;
    
    sqliteClient = createClient({
      url,
      authToken,
    });
    
    dbInstance = drizzle(sqliteClient, { schema });
  }
  
  return dbInstance;
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
  if (sqliteClient) {
    sqliteClient.close();
    sqliteClient = null;
    dbInstance = null;
  }
}

/**
 * Get the raw SQLite client for migrations
 */
export function getSqliteClient(config?: DatabaseConfig) {
  if (!sqliteClient) {
    const url = config?.url || process.env.DATABASE_URL || 'file:./data/scoring.db';
    const authToken = config?.authToken || process.env.DATABASE_AUTH_TOKEN;
    
    sqliteClient = createClient({
      url,
      authToken,
    });
  }
  
  return sqliteClient;
}

// Export the database type
export type Database = ReturnType<typeof getDatabase>;