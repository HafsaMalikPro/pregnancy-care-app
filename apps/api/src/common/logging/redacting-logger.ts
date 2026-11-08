import { ConsoleLogger, type ConsoleLoggerOptions } from '@nestjs/common';
import { redactValue } from './redact.js';

/**
 * Nest logger that redacts every message and argument (see redact.ts). In production it writes
 * one JSON object per line (timestamp, level, context, message) for log pipelines.
 */
export class RedactingLogger extends ConsoleLogger {
  constructor(options: ConsoleLoggerOptions = {}) {
    super(options);
  }

  private clean(args: unknown[]): unknown[] {
    return args.map(redactValue);
  }

  log(message: unknown, ...rest: unknown[]) {
    super.log(...(this.clean([message, ...rest]) as [unknown]));
  }
  error(message: unknown, ...rest: unknown[]) {
    super.error(...(this.clean([message, ...rest]) as [unknown]));
  }
  warn(message: unknown, ...rest: unknown[]) {
    super.warn(...(this.clean([message, ...rest]) as [unknown]));
  }
  debug(message: unknown, ...rest: unknown[]) {
    super.debug(...(this.clean([message, ...rest]) as [unknown]));
  }
  verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(...(this.clean([message, ...rest]) as [unknown]));
  }
  fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(...(this.clean([message, ...rest]) as [unknown]));
  }
}

export function createAppLogger(nodeEnv: string): RedactingLogger {
  return new RedactingLogger({
    json: nodeEnv === 'production',
    colors: nodeEnv !== 'production',
  });
}
