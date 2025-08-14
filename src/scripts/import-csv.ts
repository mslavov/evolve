#!/usr/bin/env tsx

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { z } from 'zod';
import { getDatabase } from '../db/client.js';
import { EvalDatasetRepository } from '../repositories/eval-dataset.repository.js';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type { NewEvalDataset } from '../db/schema/eval-datasets.js';

// Define the expected CSV schema
const csvRecordSchema = z.object({
  input_content: z.string().min(1, 'Input content is required'),
  ground_truth_score: z.coerce.number().min(0).max(1),
  input_type: z.string().optional().default('text'),
  metadata: z.string().optional().transform(val => {
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return { raw: val };
    }
  }),
});

type CsvRecord = z.infer<typeof csvRecordSchema>;

interface ImportOptions {
  file: string;
  version?: string;
  split?: 'train' | 'validation' | 'test';
  delimiter?: string;
  skipHeader?: boolean;
}

async function importCsv(options: ImportOptions) {
  const spinner = ora('Initializing CSV import...').start();
  
  try {
    // Initialize database
    const db = getDatabase();
    const evalDatasetRepo = new EvalDatasetRepository(db);
    
    spinner.text = 'Reading CSV file...';
    
    // Read and parse CSV
    const csvContent = readFileSync(options.file, 'utf-8');
    const rawRecords = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: options.delimiter || ',',
      skip_records_with_empty_values: true,
    });
    
    spinner.text = `Validating ${rawRecords.length} records...`;
    
    // Validate and transform records
    const validRecords: NewEvalDataset[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    
    for (const [index, record] of rawRecords.entries()) {
      try {
        const validated = csvRecordSchema.parse(record);
        
        validRecords.push({
          input: validated.input_content,
          expectedOutput: JSON.stringify({ score: validated.ground_truth_score }),
          agentOutput: JSON.stringify({ score: validated.ground_truth_score }),
          verdict: 'correct',
          runId: 'import_' + index,
          assessmentId: 'import_assess_' + index,
          datasetType: 'evaluation',
          metadata: {
            inputType: validated.input_type,
            source: 'human',
            version: options.version || 'imported',
            split: options.split || 'train',
            ...validated.metadata
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push({
            row: index + 2, // +2 for header and 0-index
            error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          });
        }
      }
    }
    
    // Report validation results
    if (errors.length > 0) {
      spinner.warn(`Found ${errors.length} invalid records`);
      console.log(chalk.yellow('\n⚠️  Validation Errors:'));
      errors.slice(0, 10).forEach(({ row, error }) => {
        console.log(chalk.gray(`  Row ${row}: ${error}`));
      });
      if (errors.length > 10) {
        console.log(chalk.gray(`  ... and ${errors.length - 10} more`));
      }
    }
    
    if (validRecords.length === 0) {
      spinner.fail('No valid records to import');
      return;
    }
    
    spinner.text = `Importing ${validRecords.length} valid records...`;
    
    // Import records in batches
    const batchSize = 100;
    let imported = 0;
    
    for (let i = 0; i < validRecords.length; i += batchSize) {
      const batch = validRecords.slice(i, i + batchSize);
      
      for (const record of batch) {
        await evalDatasetRepo.create(record);
        imported++;
      }
      
      spinner.text = `Importing records... (${imported}/${validRecords.length})`;
    }
    
    spinner.succeed(`Successfully imported ${imported} records!`);
    
    // Display summary
    console.log('\n📊 Import Summary:');
    console.log(chalk.cyan('Total Records:'), rawRecords.length);
    console.log(chalk.green('Valid Records:'), validRecords.length);
    console.log(chalk.yellow('Invalid Records:'), errors.length);
    console.log(chalk.cyan('Version:'), options.version || 'imported');
    console.log(chalk.cyan('Split:'), options.split || 'train');
    
    // Calculate score distribution (extract from expectedOutput)
    const scores = validRecords.map(r => {
      try {
        const expected = JSON.parse(r.expectedOutput);
        return typeof expected === 'number' ? expected : expected?.score || 0;
      } catch {
        return 0;
      }
    });
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    
    console.log('\n📈 Score Distribution:');
    console.log(chalk.cyan('Average:'), avgScore.toFixed(3));
    console.log(chalk.cyan('Min:'), minScore.toFixed(3));
    console.log(chalk.cyan('Max:'), maxScore.toFixed(3));
    
  } catch (error) {
    spinner.fail('Import failed');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

// CLI setup
const program = new Command();

program
  .name('import-csv')
  .description('Import evaluation dataset from CSV file')
  .requiredOption('-f, --file <path>', 'Path to CSV file')
  .option('-v, --version <version>', 'Dataset version identifier', 'imported')
  .option('-s, --split <split>', 'Dataset split (train/validation/test)', 'train')
  .option('-d, --delimiter <char>', 'CSV delimiter character', ',')
  .option('--skip-header', 'Skip the first row as header', false)
  .action(importCsv);

// Show example usage
program.on('--help', () => {
  console.log('');
  console.log('Expected CSV Format:');
  console.log('  input_content,ground_truth_score,input_type,metadata');
  console.log('  "Sample text content",0.85,text,"{""source"":""manual""}"');
  console.log('  "Another example",0.72,code,');
  console.log('');
  console.log('Examples:');
  console.log('  $ tsx src/scripts/import-csv.ts -f data.csv');
  console.log('  $ tsx src/scripts/import-csv.ts -f data.csv -v v2 -s test');
  console.log('  $ tsx src/scripts/import-csv.ts -f data.tsv -d "\\t"');
});

program.parse(process.argv);