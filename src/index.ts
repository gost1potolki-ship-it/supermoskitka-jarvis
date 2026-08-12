import { config } from './app/config.js';
import { createLogger } from './app/logger.js';
import { createApp } from './app/server.js';

const logger = createLogger(config.logLevel);
const app = createApp(logger);

const server = app.listen(config.port, () => {
  logger.info('server.started', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info('server.shutdown.start', { signal });

  server.close((error) => {
    if (error) {
      logger.error('server.shutdown.error', { err: error });
      process.exit(1);
      return;
    }

    logger.info('server.shutdown.complete', { signal });
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('server.shutdown.timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
