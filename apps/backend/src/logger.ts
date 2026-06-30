import winston from 'winston';
import { format } from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;