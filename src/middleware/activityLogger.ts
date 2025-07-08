import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const activityLogger = async (req: Request, res: Response, next: NextFunction) => {
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
    // Skip logging for health checks and static files
    if (req.path === '/api/health' || req.path.startsWith('/static/')) {
      return;
    }

    const action = `${req.method} ${req.path}`;
    const entity = extractEntityFromPath(req.path);
    const entityId = req.params.id || null;

    await prisma.activityLog.create({
      data: {
        action,
        entity,
        entityId,
        oldValues: req.method === 'PUT' || req.method === 'PATCH' ? req.body : null,
        newValues: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? responseBody : null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.userId || null,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

const extractEntityFromPath = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return segments[1]; // e.g., /api/events -> events
  }
  return 'unknown';
};