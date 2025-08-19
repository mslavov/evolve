import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'turso',
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./data/evolve.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});