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

dotenv.config();

const app = express();
const prisma = new PrismaClient();

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  try {
    await prisma.$disconnect();
    logger.info('✅ Database connection closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', { error: error instanceof Error ? error.message : 'Unknown error' });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  try {
    await prisma.$disconnect();
    logger.info('✅ Database connection closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', { error: error instanceof Error ? error.message : 'Unknown error' });
    process.exit(1);
  }
});

export default app;