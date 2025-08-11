# Database Reference

## Overview

The Self-Improving Scorer uses SQLite for local data persistence via the LibSQL client. The database stores all scoring records, ground truth labels, and performance metrics.

## Database Configuration

### Connection
```typescript
import { createClient } from '@libsql/client';

const db = createClient({
  url: 'file:./scoring-data.db'
});
```

### Location
- **File**: `./scoring-data.db` (relative to project root)
- **Type**: SQLite database file
- **Client**: LibSQL (SQLite-compatible)

## Schema

### Table: `scoring_records`

Primary table storing all scoring operations and results.

#### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | Primary key, UUID format |
| `timestamp` | DATETIME | NO | ISO 8601 timestamp of scoring |
| `input_content` | TEXT | NO | Full text content that was scored |
| `input_length` | INTEGER | NO | Character count of input |
| `input_type` | TEXT | YES | Content type (code, text, list, short) |
| `output_score` | REAL | NO | Numerical score (0-1) |
| `output_reasoning` | TEXT | NO | AI explanation for score |
| `output_dimensions` | TEXT | YES | JSON string of dimensional scores |
| `config_model` | TEXT | NO | Model used (gpt-4o-mini, etc.) |
| `config_temperature` | REAL | NO | Temperature setting (0-1) |
| `config_prompt_version` | TEXT | NO | Prompt template version |
| `ground_truth_score` | REAL | YES | Human-provided score |
| `ground_truth_source` | TEXT | YES | Source of truth (human, consensus, benchmark) |
| `ground_truth_labeler_info` | TEXT | YES | JSON metadata about labeler |
| `performance_error` | REAL | YES | Absolute error from ground truth |
| `performance_squared_error` | REAL | YES | Squared error for RMSE calculation |

#### Indexes
- Primary key index on `id`
- Implicit indexes on foreign key relationships

#### Schema SQL
```sql
CREATE TABLE IF NOT EXISTS scoring_records (
  id TEXT PRIMARY KEY,
  timestamp DATETIME,
  input_content TEXT,
  input_length INTEGER,
  input_type TEXT,
  output_score REAL,
  output_reasoning TEXT,
  output_dimensions TEXT,
  config_model TEXT,
  config_temperature REAL,
  config_prompt_version TEXT,
  ground_truth_score REAL,
  ground_truth_source TEXT,
  ground_truth_labeler_info TEXT,
  performance_error REAL,
  performance_squared_error REAL
);
```

### Table: `agent_configs`

Stores saved agent configurations for persistence across sessions.

#### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `key` | TEXT | NO | Primary key, configuration name |
| `model` | TEXT | NO | Model identifier (gpt-4o-mini, etc.) |
| `temperature` | REAL | NO | Temperature setting (0-1) |
| `max_tokens` | INTEGER | NO | Maximum response tokens |
| `prompt_version` | TEXT | NO | Prompt template version |
| `created_at` | DATETIME | NO | Creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |
| `description` | TEXT | YES | Optional description |
| `metadata` | TEXT | YES | JSON metadata for extensibility |

#### Schema SQL
```sql
CREATE TABLE IF NOT EXISTS agent_configs (
  key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  max_tokens INTEGER NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  metadata TEXT
);
```

### Table: `config_defaults`

Stores the default configuration key.

#### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, always 1 |
| `default_key` | TEXT | YES | Key of default configuration |

#### Schema SQL
```sql
CREATE TABLE IF NOT EXISTS config_defaults (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_key TEXT
);
```

## Data Types

### Dimensional Scores (JSON)
Stored in `output_dimensions` as JSON string:
```json
{
  "relevance": 0.8,
  "accuracy": 0.7,
  "completeness": 0.6,
  "clarity": 0.9,
  "actionability": 0.7
}
```

### Labeler Info (JSON)
Stored in `ground_truth_labeler_info` as JSON string:
```json
{
  "userId": "user123",
  "expertise": "senior_developer",
  "confidence": 0.9,
  "timestamp": "2024-01-09T10:30:00Z"
}
```

### Content Types
Enum values for `input_type`:
- `"code"` - Programming code
- `"text"` - General text
- `"list"` - List or bullet points
- `"short"` - Brief content (<100 chars)
- `null` - Unknown/unclassified

### Ground Truth Sources
Enum values for `ground_truth_source`:
- `"human"` - Manual human evaluation
- `"consensus"` - Multiple human consensus
- `"benchmark"` - Pre-labeled benchmark data

## Common Queries

### Configuration Queries

#### Get All Configurations
```sql
SELECT * FROM agent_configs
ORDER BY key;
```

#### Get Default Configuration
```sql
SELECT ac.* 
FROM agent_configs ac
JOIN config_defaults cd ON ac.key = cd.default_key;
```

#### Update Configuration
```sql
UPDATE agent_configs 
SET model = 'gpt-4o', 
    temperature = 0.2,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'optimal-config';
```

#### Set Default Configuration
```sql
INSERT OR REPLACE INTO config_defaults (id, default_key) 
VALUES (1, 'production-config');
```

### Scoring Queries

#### Get Records with Ground Truth
```sql
SELECT * FROM scoring_records 
WHERE ground_truth_score IS NOT NULL
ORDER BY timestamp DESC
LIMIT 100;
```

### Calculate Average Score by Model
```sql
SELECT 
  config_model,
  AVG(output_score) as avg_score,
  COUNT(*) as count
FROM scoring_records
GROUP BY config_model;
```

### Get Performance Metrics
```sql
SELECT 
  AVG(performance_error) as mae,
  SQRT(AVG(performance_squared_error)) as rmse,
  COUNT(*) as sample_size
FROM scoring_records
WHERE ground_truth_score IS NOT NULL;
```

### Find Best Configuration
```sql
SELECT 
  config_model,
  config_temperature,
  config_prompt_version,
  AVG(performance_error) as avg_error,
  COUNT(*) as samples
FROM scoring_records
WHERE ground_truth_score IS NOT NULL
GROUP BY config_model, config_temperature, config_prompt_version
ORDER BY avg_error ASC
LIMIT 1;
```

### Get Score Distribution
```sql
SELECT 
  ROUND(output_score, 1) as score_bucket,
  COUNT(*) as count
FROM scoring_records
GROUP BY score_bucket
ORDER BY score_bucket;
```

## Data Management

### Database Size Estimation
- **Record Size**: ~1-5 KB per record (depending on content length)
- **Growth Rate**: Depends on usage, typically 100-1000 records/day
- **Optimization**: Indexes on frequently queried columns

### Backup Strategy
```bash
# Create backup
cp scoring-data.db scoring-data.backup.$(date +%Y%m%d).db

# Export to SQL
sqlite3 scoring-data.db .dump > backup.sql

# Import from SQL
sqlite3 new-scoring-data.db < backup.sql
```

### Data Retention
- No automatic deletion
- Manual cleanup available via SQL
- Consider archiving old records after 100K+ entries

### Migration Support
Database initialization handled automatically:
```typescript
// Auto-creates table if not exists
await db.execute(`
  CREATE TABLE IF NOT EXISTS scoring_records (...)
`);
```

## Performance Considerations

### Query Optimization
1. **Use indexes** for frequent lookups
2. **Limit result sets** with LIMIT clause
3. **Filter early** in WHERE clauses
4. **Batch operations** when possible

### Connection Management
- Single connection per process
- Connection pooling not required (local file)
- Lazy initialization on first use

### Transaction Support
```typescript
// Example batch insert with transaction
await db.batch([
  { sql: "INSERT INTO...", args: [...] },
  { sql: "INSERT INTO...", args: [...] }
]);
```

## Error Handling

### Common Errors
1. **Database locked**: Multiple write operations
2. **Constraint violation**: Duplicate IDs
3. **Type mismatch**: Invalid data types
4. **File permissions**: Read/write access

### Error Recovery
```typescript
try {
  await db.execute(query);
} catch (error) {
  if (error.message.includes('locked')) {
    // Retry with exponential backoff
  } else if (error.message.includes('constraint')) {
    // Generate new ID and retry
  }
}
```

## Maintenance

### Vacuum Database
```bash
# Reclaim space and optimize
sqlite3 scoring-data.db "VACUUM;"
```

### Analyze Statistics
```bash
# Update query planner statistics
sqlite3 scoring-data.db "ANALYZE;"
```

### Check Integrity
```bash
# Verify database integrity
sqlite3 scoring-data.db "PRAGMA integrity_check;"
```

## Security

### Access Control
- Local file system permissions
- No network exposure
- No authentication (local only)

### Data Privacy
- Content stored in plain text
- No encryption at rest
- Consider sanitizing sensitive data

### SQL Injection Prevention
- Always use parameterized queries
- Never concatenate user input
- Validate input types

Example:
```typescript
// Safe - parameterized
await db.execute({
  sql: "SELECT * FROM scoring_records WHERE id = ?",
  args: [userId]
});

// Unsafe - concatenation
// await db.execute(`SELECT * FROM scoring_records WHERE id = '${userId}'`);
```