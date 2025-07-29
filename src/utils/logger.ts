import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug', // Set to debug to show all logs
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'yugam-finance-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Always add console transport for better debugging
logger.add(new winston.transports.Console({
  level: 'debug', // Show all log levels on console
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, service, userId, method, url, stack }) => {
      // Enhanced formatting for startup messages
      const messageStr = String(message);
      if (messageStr.includes('🚀') || messageStr.includes('✅') || messageStr.includes('❌') || 
          messageStr.includes('🎉') || messageStr.includes('📡') || messageStr.includes('🌍') || 
          messageStr.includes('🔗') || messageStr.includes('📊') || messageStr.includes('🧪') || 
          messageStr.includes('⏰') || messageStr.includes('📋') || messageStr.includes('✨')) {
        // For startup messages, use a cleaner format
        return `${messageStr}`;
      }
      
      // For regular logs, use the standard format
      let log = `${timestamp} [${level.toUpperCase()}] ${messageStr}`;
      if (userId) log += ` (User: ${userId})`;
      if (method && url) log += ` ${method} ${url}`;
      if (stack) log += `\n${stack}`;
      return log;
    })
  )
}));

// Add request logging
logger.info('Logger initialized with debug level');

export { logger };