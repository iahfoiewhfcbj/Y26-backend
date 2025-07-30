import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { activityLogger } from './middleware/activityLogger';

// Route imports
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import eventRoutes from './routes/events';
import workshopRoutes from './routes/workshops';
import budgetRoutes from './routes/budgets';
import workshopBudgetRoutes from './routes/workshop-budgets';
import expenseRoutes from './routes/expenses';
import workshopExpenseRoutes from './routes/workshop-expenses';
import categoryRoutes from './routes/categories';
import productRoutes from './routes/products';
import adminRoutes from './routes/admin';
import reportRoutes from './routes/reports';
import notificationRoutes from './routes/notifications';
import venueRoutes from './routes/venues';
import uploadRoutes from './routes/uploads';
import quotationRoutes from './routes/quotations';
import pushNotificationRoutes from './routes/pushNotifications';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Keep-alive configuration
const PORT = process.env.PORT || 5000;
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const INACTIVITY_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

// Helper to check if keep-alive is enabled
const isKeepAliveEnabled = () => {
  return !!(KEEP_ALIVE_URL && KEEP_ALIVE_URL.includes('onrender.com'));
};

// Activity tracking
let lastActivity = Date.now();
let keepAliveInterval: NodeJS.Timeout | null = null;

// Function to update last activity
const updateActivity = () => {
  lastActivity = Date.now();
};

// Function to send keep-alive request
const sendKeepAlive = async () => {
  try {
    const timeSinceLastActivity = Date.now() - lastActivity;
    logger.info(`Checking activity: ${Math.round(timeSinceLastActivity / 1000)}s since last activity`);
    
    if (timeSinceLastActivity > INACTIVITY_THRESHOLD) {
      logger.info('Sending keep-alive request to prevent spin-down');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${KEEP_ALIVE_URL}/api/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Keep-Alive-Bot',
          'X-Keep-Alive': 'true'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        logger.info('Keep-alive request successful');
      } else {
        logger.warn(`Keep-alive request failed with status: ${response.status}`);
      }
    } else {
      logger.info('Recent activity detected, skipping keep-alive request');
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.error('Keep-alive request timed out');
      } else {
        logger.error('Keep-alive request failed:', { error: error.message });
      }
    } else {
      logger.error('Keep-alive request failed with unknown error');
    }
  }
};

// Database connection test function
const testDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return false;
  }
};


// Get available endpoints
const getAvailableEndpoints = () => {
  return [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'POST', path: '/api/auth/register' },
    { method: 'GET', path: '/api/auth/me' },
    { method: 'GET', path: '/api/users' },
    { method: 'POST', path: '/api/events' },
    { method: 'GET', path: '/api/events' },
    { method: 'POST', path: '/api/workshops' },
    { method: 'GET', path: '/api/workshops' },
    { method: 'POST', path: '/api/budgets' },
    { method: 'GET', path: '/api/budgets' },
    { method: 'POST', path: '/api/expenses' },
    { method: 'GET', path: '/api/expenses' },
    { method: 'GET', path: '/api/categories' },
    { method: 'GET', path: '/api/products' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/events' },
    { method: 'GET', path: '/api/admin/workshops' },
    { method: 'GET', path: '/api/reports' },
    { method: 'GET', path: '/api/notifications' },
    { method: 'GET', path: '/api/venues' },
    { method: 'POST', path: '/api/uploads' },
    { method: 'POST', path: '/api/quotations' },
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/activity-status' }
  ];
};

// Start keep-alive monitoring (enable if KEEP_ALIVE_URL is set and includes onrender.com)
if (isKeepAliveEnabled()) {
  keepAliveInterval = setInterval(sendKeepAlive, KEEP_ALIVE_INTERVAL);
  logger.info(`Keep-alive monitoring started (checking every ${KEEP_ALIVE_INTERVAL / 60000} minutes)`);
}

// Trust proxy for rate limiting behind load balancers
app.set('trust proxy', 1);

// HTTP request logging middleware - disabled for cleaner logs
// app.use(morgan('combined', {
//   stream: {
//     write: (message: string) => {
//       logger.info(message.trim());
//     }
//   }
// }));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    // Allow all origins
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Rate limiting with keep-alive exception
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for keep-alive requests
    return req.get('X-Keep-Alive') === 'true';
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Activity tracking middleware (must be before other middleware)
app.use((req: Request, res: Response, next: NextFunction) => {
  // Don't count keep-alive requests as activity
  if (req.get('X-Keep-Alive') !== 'true') {
    updateActivity();
  }
  next();
});

// Enhanced logging middleware for keep-alive requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const isKeepAlive = req.get('X-Keep-Alive') === 'true';
  if (isKeepAlive) {
    logger.info(`Keep-alive request: ${req.method} ${req.path}`);
  }
  next();
});

// Activity logging middleware
app.use(activityLogger);

// Response time logging middleware - disabled for cleaner logs
// app.use((req: Request, res: Response, next: NextFunction) => {
//   const start = Date.now();
//   
//   res.on('finish', () => {
//     const duration = Date.now() - start;
//     logger.info(`Response completed: ${req.method} ${req.url}`, {
//       method: req.method,
//       url: req.url,
//       statusCode: res.statusCode,
//       duration: `${duration}ms`,
//       userId: (req as any).user?.userId || 'anonymous'
//     });
//   });
//   
//   next();
// });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/workshop-budgets', workshopBudgetRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/workshop-expenses', workshopExpenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/push-notifications', pushNotificationRoutes);

// Enhanced health check with activity info
app.get('/api/health', (req, res) => {
  const isKeepAlive = req.get('X-Keep-Alive') === 'true';
  const timeSinceLastActivity = Date.now() - lastActivity;
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    lastActivity: new Date(lastActivity).toISOString(),
    timeSinceLastActivity: Math.round(timeSinceLastActivity / 1000),
    isKeepAliveRequest: isKeepAlive
  });
});

// Activity status endpoint
app.get('/api/activity-status', (req, res) => {
  const timeSinceLastActivity = Date.now() - lastActivity;
  res.json({
    lastActivity: new Date(lastActivity).toISOString(),
    timeSinceLastActivity: Math.round(timeSinceLastActivity / 1000),
    thresholdSeconds: INACTIVITY_THRESHOLD / 1000,
    isInactive: timeSinceLastActivity > INACTIVITY_THRESHOLD,
    keepAliveEnabled: isKeepAliveEnabled()
  });
});

// Test endpoint for demonstration
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Yugam Facilities Management System is running!',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Clear keep-alive interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    logger.info('⏰ Keep-alive monitoring stopped');
  }
  
  try {
    await prisma.$disconnect();
    logger.info('✅ Database connection closed successfully');
    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
};

// Handle shutdown signals with keep-alive check
process.on('SIGTERM', () => {
  if (isKeepAliveEnabled()) {
    logger.info('🟡 SIGTERM received but ignored due to keep-alive being enabled (Render platform)');
    return;
  }
  gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  if (isKeepAliveEnabled()) {
    logger.info('🟡 SIGINT received but ignored due to keep-alive being enabled (Render platform)');
    return;
  }
  gracefulShutdown('SIGINT');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', { error: error.message });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection:', { reason, promise });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Enhanced startup function
const startServer = async () => {
  logger.info('🚀 Starting Yugam Facilities Management System...');
  
  // Test database connection
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    logger.error('❌ Failed to connect to database. Exiting...');
    process.exit(1);
  }
  
  // Start the server
  app.listen(PORT, () => {
    logger.info('🎉 Server started successfully!');
    logger.info(`📡 Server running on port ${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
    logger.info(`📊 Health check: ${process.env.KEEP_ALIVE_URL || 'http://localhost:' + PORT}/api/health`);
    logger.info(`🧪 Test endpoint: ${process.env.KEEP_ALIVE_URL || 'http://localhost:' + PORT}/api/test`);
    logger.info(`⏰ Keep-alive monitoring: ${isKeepAliveEnabled() ? 'ENABLED' : 'DISABLED'}`);
    
    // Log available endpoints
    const endpoints = getAvailableEndpoints();
    logger.info('📋 Available endpoints:');
    endpoints.forEach(endpoint => {
      logger.info(`   ${endpoint.method} ${endpoint.path}`);
    });
    
    logger.info('✨ Ready to accept connections!');
  });
};

// Start the server
startServer();

export default app;