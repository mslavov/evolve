import { z } from 'zod';

/**
 * Dataset configuration schema
 */
export const DatasetConfigSchema = z.object({
  // Auto-creation settings
  autoCreate: z.object({
    enabled: z.boolean().default(true),
    confidenceThreshold: z.number().min(0).max(1).default(0.8),
  }),
  
  // Quality thresholds
  qualityThresholds: z.object({
    high: z.number().min(0).max(1).default(0.9),
    medium: z.number().min(0).max(1).default(0.7),
  }),
  
  // Dataset building defaults
  defaults: z.object({
    samplingRate: z.number().min(0).max(1).default(1.0),
    splitRatios: z.object({
      train: z.number().min(0).max(1).default(0.7),
      validation: z.number().min(0).max(1).default(0.15),
      test: z.number().min(0).max(1).default(0.15),
    }),
  }),
  
  // Performance settings
  performance: z.object({
    batchSize: z.number().min(1).default(100),
    maxMemoryRecords: z.number().min(100).default(10000),
    paginationLimit: z.number().min(10).max(1000).default(50),
  }),
  
  // Data retention
  retention: z.object({
    softDeleteEnabled: z.boolean().default(true),
    softDeleteRetentionDays: z.number().min(1).default(30),
    autoArchiveEnabled: z.boolean().default(false),
    autoArchiveAfterDays: z.number().min(1).default(90),
  }),
});

export type DatasetConfig = z.infer<typeof DatasetConfigSchema>;

/**
 * Default configuration
 */
const defaultConfig: DatasetConfig = {
  autoCreate: {
    enabled: true,
    confidenceThreshold: 0.8,
  },
  qualityThresholds: {
    high: 0.9,
    medium: 0.7,
  },
  defaults: {
    samplingRate: 1.0,
    splitRatios: {
      train: 0.7,
      validation: 0.15,
      test: 0.15,
    },
  },
  performance: {
    batchSize: 100,
    maxMemoryRecords: 10000,
    paginationLimit: 50,
  },
  retention: {
    softDeleteEnabled: true,
    softDeleteRetentionDays: 30,
    autoArchiveEnabled: false,
    autoArchiveAfterDays: 90,
  },
};

/**
 * Load configuration from environment variables
 */
export function loadDatasetConfig(): DatasetConfig {
  const envConfig: Partial<DatasetConfig> = {};
  
  // Parse auto-create settings from env
  if (process.env.DATASET_AUTO_CREATE_ENABLED !== undefined) {
    envConfig.autoCreate = {
      ...defaultConfig.autoCreate,
      enabled: process.env.DATASET_AUTO_CREATE_ENABLED === 'true',
    };
  }
  
  if (process.env.DATASET_AUTO_CREATE_THRESHOLD !== undefined) {
    envConfig.autoCreate = {
      ...envConfig.autoCreate || defaultConfig.autoCreate,
      confidenceThreshold: parseFloat(process.env.DATASET_AUTO_CREATE_THRESHOLD),
    };
  }
  
  // Parse quality thresholds from env
  if (process.env.DATASET_QUALITY_HIGH !== undefined || process.env.DATASET_QUALITY_MEDIUM !== undefined) {
    envConfig.qualityThresholds = {
      high: process.env.DATASET_QUALITY_HIGH 
        ? parseFloat(process.env.DATASET_QUALITY_HIGH) 
        : defaultConfig.qualityThresholds.high,
      medium: process.env.DATASET_QUALITY_MEDIUM 
        ? parseFloat(process.env.DATASET_QUALITY_MEDIUM)
        : defaultConfig.qualityThresholds.medium,
    };
  }
  
  // Parse performance settings from env
  if (process.env.DATASET_BATCH_SIZE !== undefined) {
    envConfig.performance = {
      ...defaultConfig.performance,
      batchSize: parseInt(process.env.DATASET_BATCH_SIZE, 10),
    };
  }
  
  if (process.env.DATASET_PAGINATION_LIMIT !== undefined) {
    envConfig.performance = {
      ...envConfig.performance || defaultConfig.performance,
      paginationLimit: parseInt(process.env.DATASET_PAGINATION_LIMIT, 10),
    };
  }
  
  // Parse retention settings from env
  if (process.env.DATASET_SOFT_DELETE_ENABLED !== undefined) {
    envConfig.retention = {
      ...defaultConfig.retention,
      softDeleteEnabled: process.env.DATASET_SOFT_DELETE_ENABLED === 'true',
    };
  }
  
  if (process.env.DATASET_SOFT_DELETE_RETENTION_DAYS !== undefined) {
    envConfig.retention = {
      ...envConfig.retention || defaultConfig.retention,
      softDeleteRetentionDays: parseInt(process.env.DATASET_SOFT_DELETE_RETENTION_DAYS, 10),
    };
  }
  
  // Merge with defaults and validate
  const mergedConfig = {
    ...defaultConfig,
    ...envConfig,
  };
  
  return DatasetConfigSchema.parse(mergedConfig);
}

/**
 * Singleton instance
 */
let configInstance: DatasetConfig | null = null;

/**
 * Get the current dataset configuration
 */
export function getDatasetConfig(): DatasetConfig {
  if (!configInstance) {
    configInstance = loadDatasetConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetDatasetConfig(): void {
  configInstance = null;
}

/**
 * Update configuration at runtime
 */
export function updateDatasetConfig(updates: Partial<DatasetConfig>): DatasetConfig {
  const current = getDatasetConfig();
  const updated = {
    ...current,
    ...updates,
  };
  configInstance = DatasetConfigSchema.parse(updated);
  return configInstance;
}