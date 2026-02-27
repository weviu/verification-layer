/**
 * Logger utility for the Verification Layer.
 *
 * All log output goes through this module so that:
 *   - Log format is consistent
 *   - Timestamps are always included
 *   - Severity levels are explicit
 *   - Future replacement (e.g. structured logging) is easy
 *
 * No sensitive data (private keys, encrypted votes) should ever be logged.
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    timestamp: formatTimestamp(),
    level,
    message,
  };

  if (context !== undefined) {
    entry.context = context;
  }

  const output = JSON.stringify(entry);

  switch (level) {
    case LogLevel.ERROR:
      console.error(output);
      break;
    case LogLevel.WARN:
      console.warn(output);
      break;
    default:
      console.log(output);
      break;
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    log(LogLevel.DEBUG, message, context);
  },

  info(message: string, context?: Record<string, unknown>): void {
    log(LogLevel.INFO, message, context);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    log(LogLevel.WARN, message, context);
  },

  error(message: string, context?: Record<string, unknown>): void {
    log(LogLevel.ERROR, message, context);
  },
};
