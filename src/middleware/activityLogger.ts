import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const activityLogger = async (req: Request, res: Response, next: NextFunction) => {
  // Enhanced user identification for logging
  let userInfo = 'anonymous';
  
  if (req.user) {
    // If user is already authenticated via middleware
    userInfo = `${req.user.email} (${req.user.userId})`;
  } else {
    // Try to extract user info from token for logging purposes only
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET!);
        
        // Fetch user name from database for better logging
        try {
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { name: true, email: true }
          });
          
          if (user) {
            userInfo = `${user.name} | ${user.email}`;
          } else {
            userInfo = `${decoded.email} (${decoded.userId})`;
          }
        } catch (dbError) {
          // Fallback to token info if database query fails
          userInfo = `${decoded.email} (${decoded.userId})`;
        }
      } catch (error) {
        userInfo = 'invalid-token';
      }
    }
  }

  // Log incoming request with enhanced user info (skip notifications, logs, and health checks)
  const shouldSkipConsoleLog = req.path.startsWith('/api/notifications') || 
                              req.path.startsWith('/api/admin/logs') || 
                              req.path.startsWith('/api/admin/system-logs') ||
                              req.path === '/api/health' ||
                              req.path === '/api/activity-status';
  
  if (!shouldSkipConsoleLog) {
    logger.info(`${req.method} ${req.path} (User: ${userInfo})`);
  }

  // Store original json method
  const originalJson = res.json;
  
  // Override json method to capture response
  res.json = function(body: any) {
    // Log the activity
    logActivity(req, res, body);
    
    // Call original json method
    return originalJson.call(this, body);
  };

  next();
};

const logActivity = async (req: Request, res: Response, responseBody: any) => {
  try {
    // Skip logging for health checks, static files, and activity status
    if (req.path === '/api/health' || 
        req.path.startsWith('/static/') || 
        req.path === '/api/activity-status') {
      return;
    }

    const action = `${req.method} ${req.path}`;
    const entity = extractEntityFromPath(req.path);
    const entityId = req.params.id || null;

    // Enhanced user identification for database logging
    let userId = null;
    let userEmail = null;
    
    if (req.user) {
      userId = req.user.userId;
      userEmail = req.user.email;
    } else {
      // Try to extract user info from token for database logging
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET!);
          userId = decoded.userId;
          userEmail = decoded.email;
        } catch (error) {
          // Token is invalid, leave userId as null
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        action,
        entity,
        entityId,
        oldValues: req.method === 'PUT' || req.method === 'PATCH' ? req.body : null,
        newValues: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? responseBody : null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        userId: userId,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to log activity:', { error: errorMessage, stack: errorStack });
  }
};

const extractEntityFromPath = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return segments[1]; // e.g., /api/events -> events
  }
  return 'unknown';
};