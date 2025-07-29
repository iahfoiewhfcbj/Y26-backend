import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

// Get system logs from log files
router.get('/system-logs', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      level, 
      startDate, 
      endDate, 
      search,
      service 
    } = req.query;

    const logFilePath = path.join(process.cwd(), 'logs', 'combined.log');
    
    if (!fs.existsSync(logFilePath)) {
      return res.json({
        logs: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          pages: 0
        },
        stats: {
          total: 0,
          last24h: 0,
          errors: 0,
          warnings: 0
        }
      });
    }

    const logContent = fs.readFileSync(logFilePath, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    // Parse and filter logs
    const parsedLogs = logLines
      .map(line => {
        try {
          const logEntry = JSON.parse(line);
          return {
            timestamp: logEntry.timestamp,
            level: logEntry.level,
            message: logEntry.message,
            service: logEntry.service || 'yugam-finance-backend',
            userId: logEntry.userId,
            method: logEntry.method,
            url: logEntry.url,
            stack: logEntry.stack
          };
        } catch (error) {
          return null;
        }
      })
      .filter(log => log !== null)
      .filter(log => {
        // Filter by level
        if (level && level !== 'all' && log.level !== level) {
          return false;
        }
        
        // Filter by service
        if (service && log.service !== service) {
          return false;
        }
        
        // Filter by date range
        if (startDate || endDate) {
          const logDate = new Date(log.timestamp);
          if (startDate && logDate < new Date(startDate as string)) {
            return false;
          }
          if (endDate && logDate > new Date(endDate as string)) {
            return false;
          }
        }
        
        // Filter by search term
        if (search && !log.message.toLowerCase().includes((search as string).toLowerCase())) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate statistics
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const stats = {
      total: logLines.length,
      last24h: logLines.filter(line => {
        try {
          const logEntry = JSON.parse(line);
          return new Date(logEntry.timestamp) >= last24h;
        } catch {
          return false;
        }
      }).length,
      errors: logLines.filter(line => {
        try {
          const logEntry = JSON.parse(line);
          return logEntry.level === 'error';
        } catch {
          return false;
        }
      }).length,
      warnings: logLines.filter(line => {
        try {
          const logEntry = JSON.parse(line);
          return logEntry.level === 'warn';
        } catch {
          return false;
        }
      }).length
    };

    // Pagination
    const total = parsedLogs.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedLogs = parsedLogs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      stats
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system logs' });
  }
});

// Get activity logs
router.get('/logs', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const { page = 1, limit = 50, entity, userId } = req.query;
    
    const whereClause: any = {};
    if (entity) whereClause.entity = entity;
    if (userId) whereClause.userId = userId;

    const logs = await prisma.activityLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    const total = await prisma.activityLog.count({ where: whereClause });

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get dashboard statistics
router.get('/stats', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const [
      totalUsers,
      totalEvents,
      pendingEvents,
      approvedEvents,
      totalExpenses,
      totalBudget
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.event.count(),
      prisma.event.count({ where: { status: 'PENDING' } }),
      prisma.event.count({ where: { status: 'APPROVED' } }),
      prisma.expense.count(),
      prisma.budget.aggregate({
        _sum: { amount: true }
      })
    ]);

    res.json({
      totalUsers,
      totalEvents,
      pendingEvents,
      approvedEvents,
      totalExpenses,
      totalBudget: totalBudget._sum.amount || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;