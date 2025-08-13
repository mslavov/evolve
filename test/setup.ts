import { beforeAll, afterAll } from 'vitest';
import { getDatabase } from '../src/db/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { Database } from '../src/db/client';

let db: Database;

beforeAll(async () => {
  // Set up test database
  process.env.DATABASE_URL = ':memory:';
  db = getDatabase();
  
  // Run migrations directly
  await migrate(db, { migrationsFolder: './src/db/migrations' });
});

afterAll(async () => {
  // Clean up
  if (db) {
    await db.$client.close();
  }
});

export { db };