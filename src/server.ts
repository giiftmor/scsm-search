import { pino } from 'pino';
import { loadConfig } from './config.js';
import { start } from './start.js';

const logger = pino();

start(loadConfig()).catch((err) => {
  logger.error(err);
  process.exit(1);
});
