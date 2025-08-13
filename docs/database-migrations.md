# Database Migration Guide

## Overview

Evolve uses a file-based migration system that tracks applied migrations in the database itself. Unlike traditional Drizzle setups that rely on a journal file, our system uses the `__drizzle_migrations` table as the single source of truth.

## Quick Start

### First Time Setup
```bash
# Clone repository and install dependencies
git clone <repo-url>
cd evolve
pnpm install

# Run migrations to set up database
pnpm db:migrate

# (Optional) Seed with sample data
tsx src/db/seed-bulgarian-config.ts
```

### Daily Workflow
```bash
# Check migration status
pnpm db:status

# Apply pending migrations
pnpm db:migrate

# Validate schema integrity
pnpm db:validate
```

## Migration Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `pnpm db:migrate` | Apply all pending migrations |
| `pnpm db:status` | Show current migration status |
| `pnpm db:validate` | Check schema integrity |
| `pnpm db:repair` | Fix migration issues |
| `pnpm db:reset` | Delete database and reapply all migrations |

### CLI Migration Commands

```bash
# Show migration status
pnpm cli migrate status

# Apply pending migrations
pnpm cli migrate up

# List all migrations with status
pnpm cli migrate list

# Validate database schema
pnpm cli migrate validate

# Repair migration issues
pnpm cli migrate repair

# Reset database (WARNING: Deletes all data)
pnpm cli migrate reset --confirm
```

## Common Scenarios

### After Pulling Changes

Always check for new migrations after pulling from git:

```bash
git pull
pnpm db:status    # Check if migrations are needed
pnpm db:migrate   # Apply if needed
```

### Schema Mismatch Errors

If you encounter errors like "no such column" or "table already exists":

```bash
# First, check what's wrong
pnpm db:validate

# Try to repair automatically
pnpm db:repair

# If repair doesn't work, reset (WARNING: Deletes data)
pnpm db:reset
```

### Creating New Migrations

When you need to modify the database schema:

```bash
# 1. Modify schema files in src/db/schema/
# 2. Generate migration
pnpm db:generate

# 3. Review generated SQL in src/db/migrations/
# 4. Apply migration
pnpm db:migrate

# 5. Commit both schema changes and migration files
git add src/db/schema/ src/db/migrations/
git commit -m "Add new schema changes"
```

## Troubleshooting

### "UNIQUE constraint failed"

This usually means you're trying to insert duplicate data.

**Solution:**
- Check if you're running seeds twice
- Use `pnpm db:fresh` for a clean database with seeds
- Manually inspect with `pnpm db:studio`

### "no such column: config_prompt_id"

The database schema doesn't match the code.

**Solution:**
```bash
pnpm db:migrate   # Apply pending migrations
```

### "Table 'prompts' already exists"

A migration is trying to create a table that already exists.

**Solution:**
```bash
pnpm db:repair    # Attempt automatic repair
# or
pnpm db:reset     # Nuclear option - recreates database
```

### Migrations Not Being Applied

If `pnpm db:migrate` reports success but migrations aren't actually applied:

**Solution:**
```bash
# Use the improved migration runner
pnpm db:migrate

# Check what's in the migrations table
sqlite3 data/scoring.db "SELECT * FROM __drizzle_migrations;"

# Force repair if needed
pnpm cli migrate repair --force
```

### Journal File Out of Sync

If you see warnings about journal file inconsistencies:

**Solution:**
```bash
pnpm db:repair    # This will rebuild the journal file
```

## How It Works

### Migration Discovery

1. The system reads all `.sql` files from `src/db/migrations/`
2. Files are sorted alphabetically (e.g., `0000_`, `0001_`, `0002_`)
3. Each file represents one migration

### Migration Tracking

1. Applied migrations are recorded in `__drizzle_migrations` table
2. Each record includes:
   - Migration filename
   - Hash of the migration content
   - Timestamp when applied

### Migration Application

1. System compares files vs applied migrations
2. Applies only pending migrations in order
3. Each migration is wrapped in a transaction
4. Failed migrations are rolled back

### Startup Checks

The CLI automatically checks for pending migrations on startup and will:
- Warn about pending migrations
- Show which migrations need to be applied
- In development mode, offer to auto-apply

## Best Practices

### DO's
- ✅ Always commit migration files with schema changes
- ✅ Run `db:status` after pulling changes
- ✅ Test migrations locally before pushing
- ✅ Keep migrations small and focused
- ✅ Use descriptive migration file names

### DON'Ts
- ❌ Never edit existing migration files
- ❌ Never use manual SQL to fix schema issues
- ❌ Never delete migration files from git
- ❌ Never skip migrations in sequence
- ❌ Never modify `__drizzle_migrations` table directly

## Migration File Structure

```
src/db/migrations/
├── 0000_initial_schema.sql       # Initial database setup
├── 0001_add_configs.sql          # Added configs table
├── 0002_add_prompts_table.sql    # Added prompts table
├── 0003_add_output_config.sql    # Added output configuration
└── meta/
    └── _journal.json              # Legacy journal file (not used)
```

## Environment Variables

```bash
# Skip migration check on CLI startup
SKIP_MIGRATION_CHECK=true

# Auto-apply migrations in development
NODE_ENV=development

# Database location
DATABASE_URL=file:./data/scoring.db
```

## Recovery Procedures

### Complete Database Reset

```bash
# Delete database and start fresh
rm -f data/scoring.db
pnpm db:migrate
tsx src/db/seed-bulgarian-config.ts
```

### Partial Recovery

```bash
# Check current state
pnpm db:validate

# Attempt repair
pnpm db:repair

# If repair fails, check manually
sqlite3 data/scoring.db ".schema"
sqlite3 data/scoring.db "SELECT * FROM __drizzle_migrations;"
```

## Technical Details

### Why Not Use Drizzle's Journal?

The default Drizzle approach uses a `_journal.json` file to track migrations, but this has issues:

1. **Build-time artifact**: Journal is generated at build time, not runtime
2. **Not portable**: Can't run same migrations on different databases
3. **Gets out of sync**: Manual migrations break the journal
4. **Single source of truth problem**: Conflicts between journal and database

Our approach:
- Uses `__drizzle_migrations` table as single source of truth
- Reads migration files directly at runtime
- Works across different database instances
- Handles manual migrations gracefully

### Migration Runner Implementation

The improved migration runner (`src/db/migrate-improved.ts`):
- Reads `.sql` files directly from filesystem
- Checks `__drizzle_migrations` table for applied migrations
- Applies only pending migrations
- Handles errors gracefully with proper rollback
- Provides detailed status and progress information