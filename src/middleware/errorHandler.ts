import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(error.message, { 
    error: error.stack, 
    url: req.url, 
    method: req.method,
    userId: req.user?.userId 
  });

  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: error.message });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({ error: 'Database error', details: error.message });
  }

  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
};