import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get configuration from environment variables
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE;
const LOG_PRETTY = process.env.LOG_PRETTY !== 'false'; // Default to true for dev experience

// Debug: Log the configuration being used
if (process.env.DEBUG_LOGGER) {
  console.log('Logger Configuration:', {
    LOG_LEVEL,
    LOG_FILE,
    LOG_PRETTY,
    env_LOG_LEVEL: process.env.LOG_LEVEL,
  });
}

// Create transports array
const transports: any[] = [];

// Console transport with pretty printing for development
if (LOG_PRETTY && process.env.NODE_ENV !== 'production') {
  transports.push({
    target: 'pino-pretty',
    level: LOG_LEVEL,  // Add explicit level
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
      errorLikeObjectKeys: ['err', 'error'],
    },
  });
} else {
  // Standard console output for production
  transports.push({
    target: 'pino/file',
    level: LOG_LEVEL,  // Add explicit level
    options: { destination: 1 }, // stdout
  });
}

// File transport if LOG_FILE is specified
if (LOG_FILE) {
  const logPath = path.isAbsolute(LOG_FILE) 
    ? LOG_FILE 
    : path.join(process.cwd(), LOG_FILE);
    
  transports.push({
    target: 'pino/file',
    level: LOG_LEVEL,  // Add explicit level
    options: { 
      destination: logPath,
      mkdir: true, // Create directory if it doesn't exist
    },
  });
}

// Create the logger with transports
export const logger = pino({
  level: LOG_LEVEL,
  transport: transports.length > 0 ? {
    targets: transports,
  } : undefined,
  base: {
    // Don't include pid and hostname in logs
    pid: false,
    hostname: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    error: pino.stdSerializers.err,
    // Custom serializer for agent configuration
    agent: (agent: any) => ({
      key: agent.key,
      model: agent.model,
      temperature: agent.temperature,
      promptId: agent.promptId,
      outputType: agent.outputType,
    }),
    // Custom serializer for run results
    runResult: (result: any) => {
      const serialized: any = {
        outputType: typeof result.output,
      };
      
      // Include preview of output if it's not too large
      if (typeof result.output === 'string' && result.output.length <= 200) {
        serialized.output = result.output;
      } else if (typeof result.output === 'string') {
        serialized.output = result.output.substring(0, 200) + '...';
      } else if (typeof result.output === 'object') {
        const stringified = JSON.stringify(result.output);
        if (stringified.length <= 200) {
          serialized.output = result.output;
        } else {
          serialized.outputPreview = stringified.substring(0, 200) + '...';
        }
      }
      
      if (result.metadata) {
        serialized.metadata = result.metadata;
      }
      
      return serialized;
    },
    // Custom serializer for evaluation metrics
    metrics: (metrics: any) => ({
      averageScore: metrics.averageScore?.toFixed(4),
      averageError: metrics.averageError?.toFixed(4),
      rmse: metrics.rmse?.toFixed(4),
      samplesEvaluated: metrics.samplesEvaluated,
    }),
  },
});

// Create child loggers for specific modules
export const createLogger = (module: string): pino.Logger => {
  return logger.child({ module });
};

// Export common log methods
export const logDebug = (msg: string, obj?: Record<string, any>) => logger.debug(obj, msg);
export const logInfo = (msg: string, obj?: Record<string, any>) => logger.info(obj, msg);
export const logWarn = (msg: string, obj?: Record<string, any>) => logger.warn(obj, msg);
export const logError = (msg: string, obj?: Record<string, any>) => logger.error(obj, msg);

// Export logger types for use in other files
export type Logger = typeof logger;
export type ChildLogger = ReturnType<typeof createLogger>;