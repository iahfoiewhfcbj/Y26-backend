import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

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