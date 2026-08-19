import winston from 'winston';
import { format } from 'winston';
import path from 'node:path';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const LOG_DIR = process.env.LOG_DIR ?? 'logs';

// Custom format for development (human-readable)
const devFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.splat(),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}${stackStr}`;
  })
);

// JSON format for production (structured logging)
const prodFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

const isDev = process.env.NODE_ENV !== 'production';

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: isDev ? devFormat : prodFormat,
  defaultMeta: { service: 'jobapply-backend' },
  transports: [
    // Always log to console
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
    // File transport for error logs
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      handleExceptions: true,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      handleExceptions: true,
    }),
  ],
});

/**
 * Create a child logger with additional context metadata.
 * Useful for request-scoped logging with request IDs, user IDs, etc.
 */
export function createChildLogger(meta: Record<string, unknown>): winston.Logger {
  return logger.child(meta);
}

/**
 * Log a Prisma error with structured context.
 */
export function logPrismaError(operation: string, error: unknown, meta?: Record<string, unknown>): void {
  const prismaMeta = {
    component: 'prisma',
    operation,
    ...meta,
  };

  if (error instanceof Error) {
    logger.error(`Prisma ${operation} failed: ${error.message}`, {
      ...prismaMeta,
      stack: error.stack,
    });
  } else {
    logger.error(`Prisma ${operation} failed`, prismaMeta);
  }
}

/**
 * Log an API request with structured context.
 */
export function logApiRequest(meta: {
  requestId?: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
}): void {
  const level = meta.statusCode && meta.statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${meta.method} ${meta.path} ${meta.statusCode ?? '-'}`, {
    component: 'api',
    ...meta,
  });
}

export default logger;