import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, NotificationType, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';

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
  body('targetUserId').optional().isUUID(),
  body('sendToAll').optional().isBoolean()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { title, message, type, targetRole, targetUserId, sendToAll } = req.body;

    let users;
    let targetType = '';
    let targetRoleValue = null;
    let targetUserIdValue = null;

    if (sendToAll) {
      users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      targetType = 'all';
    } else if (targetUserId) {
      // Verify the target user exists and is active
      const targetUser = await prisma.user.findFirst({
        where: { id: targetUserId, isActive: true },
        select: { id: true }
      });
      
      if (!targetUser) {
        return res.status(400).json({ error: 'Target user not found or inactive' });
      }
      
      users = [targetUser];
      targetType = 'user';
      targetUserIdValue = targetUserId;
    } else if (targetRole) {
      users = await prisma.user.findMany({
        where: { role: targetRole, isActive: true },
        select: { id: true }
      });
      targetType = 'role';
      targetRoleValue = targetRole;
    } else {
      return res.status(400).json({ error: 'Either sendToAll, targetRole, or targetUserId must be specified' });
    }

    const notifications = users.map(user => ({
      userId: user.id,
      title,
      message,
      type: type as NotificationType
    }));

    // Create notifications and notification history in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create individual notifications
      await tx.notification.createMany({
        data: notifications
      });

      // Create notification history entry
      const historyEntry = await tx.notificationHistory.create({
        data: {
          title,
          message,
          type: type as NotificationType,
          targetType,
          targetRole: targetRoleValue,
          targetUserId: targetUserIdValue,
          sentToCount: users.length,
          sentBy: req.user!.userId
        }
      });

      return { count: notifications.length, historyId: historyEntry.id };
    });

    res.json({ 
      message: 'Notifications sent successfully', 
      count: result.count,
      historyId: result.historyId
    });
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

// Get notification history (Admin only)
router.get('/history', authenticate, authorize([UserRole.ADMIN]), async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const history = await prisma.notificationHistory.findMany({
      include: {
        sentByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { sentAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    const total = await prisma.notificationHistory.count();

    res.json({
      history,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});

// Resend notification (Admin only)
router.post('/resend/:historyId', authenticate, authorize([UserRole.ADMIN]), async (req: Request, res: Response) => {
  try {
    const { historyId } = req.params;

    // Get the notification history entry
    const historyEntry = await prisma.notificationHistory.findUnique({
      where: { id: historyId }
    });

    if (!historyEntry) {
      return res.status(404).json({ error: 'Notification history not found' });
    }

    let users;
    if (historyEntry.targetType === 'all') {
      users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });
    } else if (historyEntry.targetType === 'user' && historyEntry.targetUserId) {
      const targetUser = await prisma.user.findFirst({
        where: { id: historyEntry.targetUserId, isActive: true },
        select: { id: true }
      });
      
      if (!targetUser) {
        return res.status(400).json({ error: 'Target user not found or inactive' });
      }
      
      users = [targetUser];
    } else if (historyEntry.targetType === 'role' && historyEntry.targetRole) {
      users = await prisma.user.findMany({
        where: { role: historyEntry.targetRole as UserRole, isActive: true },
        select: { id: true }
      });
    } else {
      return res.status(400).json({ error: 'Invalid notification history entry' });
    }

    const notifications = users.map(user => ({
      userId: user.id,
      title: historyEntry.title,
      message: historyEntry.message,
      type: historyEntry.type
    }));

    // Create new notifications
    await prisma.notification.createMany({
      data: notifications
    });

    // Create new history entry for the resend
    const newHistoryEntry = await prisma.notificationHistory.create({
      data: {
        title: historyEntry.title,
        message: historyEntry.message,
        type: historyEntry.type,
        targetType: historyEntry.targetType,
        targetRole: historyEntry.targetRole,
        targetUserId: historyEntry.targetUserId,
        sentToCount: users.length,
        sentBy: req.user!.userId
      }
    });

    res.json({ 
      message: 'Notification resent successfully', 
      count: notifications.length,
      historyId: newHistoryEntry.id
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend notification' });
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
    logger.error('Failed to create notification:', error);
  }
};

export default router;