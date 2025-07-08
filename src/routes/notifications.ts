import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, NotificationType, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get user notifications
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const whereClause: any = { userId: req.user!.userId };
    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    const total = await prisma.notification.count({ where: whereClause });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false }
    });

    res.json({
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Create notification (Admin only)
router.post('/', authenticate, authorize([UserRole.ADMIN]), [
  body('title').notEmpty().trim(),
  body('message').notEmpty().trim(),
  body('type').isIn(['INFO', 'SUCCESS', 'WARNING', 'ERROR']),
  body('targetRole').optional().isIn(Object.values(UserRole)),
  body('sendToAll').optional().isBoolean()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { title, message, type, targetRole, sendToAll } = req.body;

    let users;
    if (sendToAll) {
      users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });
    } else if (targetRole) {
      users = await prisma.user.findMany({
        where: { role: targetRole, isActive: true },
        select: { id: true }
      });
    } else {
      return res.status(400).json({ error: 'Either sendToAll or targetRole must be specified' });
    }

    const notifications = users.map(user => ({
      userId: user.id,
      title,
      message,
      type: type as NotificationType
    }));

    await prisma.notification.createMany({
      data: notifications
    });

    res.json({ message: 'Notifications sent successfully', count: notifications.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { 
        id,
        userId: req.user!.userId 
      },
      data: { isRead: true }
    });

    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { 
        userId: req.user!.userId,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Create notification helper function
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'INFO'
) => {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type
      }
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
};

export default router;