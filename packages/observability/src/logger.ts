import pino, { type Logger } from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';

const rootLogger: Logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    env: process.env['NODE_ENV'] ?? 'development',
  },
});

/**
 * Returns a child logger with a `context` field — mirrors NestJS Logger interface.
 * Usage: const logger = getLogger('GameService');
 */
export function getLogger(context: string): Logger {
  return rootLogger.child({ context });
}

export { rootLogger };
export type { Logger };
