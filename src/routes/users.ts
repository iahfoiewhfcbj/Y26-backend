import express from 'express';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (Admin, Event Team Lead, Workshop Team Lead)
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.EVENT_TEAM_LEAD, UserRole.WORKSHOP_TEAM_LEAD]), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user (Admin only)
router.post('/', authenticate, authorize([UserRole.ADMIN]), [
  body('email').isEmail().normalizeEmail(),
  body('name').notEmpty().trim(),
  body('role').isIn(Object.values(UserRole)),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { email, name, role } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Generate password in format: Iam<NAME>123!@#
    const cleanName = name.replace(/\s+/g, '');
    const tempPassword = `Iam${cleanName}123!@#`;
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        password: hashedPassword
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    // Send welcome email
    try {
      const emailContent = emailTemplates.userWelcome(name, email, tempPassword);
      await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (Admin only)
router.put('/:id', authenticate, authorize([UserRole.ADMIN]), [
  body('email').optional().isEmail().normalizeEmail(),
  body('name').optional().notEmpty().trim(),
  body('role').optional().isIn(Object.values(UserRole)),
  body('isActive').optional().isBoolean(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticate, authorize([UserRole.ADMIN]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log('Delete user request received for ID:', id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      console.log('User not found:', id);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Found user:', user.name);

    // Use transaction to handle all related deletions
    await prisma.$transaction(async (tx) => {
      // Delete related records first
      
      // Delete activity logs
      await tx.activityLog.deleteMany({
        where: { userId: id }
      });

      // Delete notifications
      await tx.notification.deleteMany({
        where: { userId: id }
      });

      // Delete budget approvals
      await tx.budgetApproval.deleteMany({
        where: { reviewerId: id }
      });

      // Delete workshop budget approvals
      await tx.workshopBudgetApproval.deleteMany({
        where: { reviewerId: id }
      });

      // Delete expenses
      await tx.expense.deleteMany({
        where: { addedById: id }
      });

      // Delete workshop expenses
      await tx.workshopExpense.deleteMany({
        where: { addedById: id }
      });

      // Delete quotations
      await tx.quotation.deleteMany({
        where: { createdById: id }
      });

      // Delete events where user is the creator (since creatorId is required)
      await tx.event.deleteMany({
        where: { creatorId: id }
      });

      // Update events to remove coordinator references (coordinatorId is optional)
      await tx.event.updateMany({
        where: { coordinatorId: id },
        data: { coordinatorId: null }
      });

      // Delete workshops where user is the creator (since creatorId is required)
      await tx.workshop.deleteMany({
        where: { creatorId: id }
      });

      // Update workshops to remove coordinator references (coordinatorId is optional)
      await tx.workshop.updateMany({
        where: { coordinatorId: id },
        data: { coordinatorId: null }
      });

      // Finally delete the user
      await tx.user.delete({
        where: { id }
      });
    });

    console.log('User and all related data permanently deleted from database:', user.name);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});



// Change user password (Admin only)
router.patch('/:id/password', authenticate, authorize([UserRole.ADMIN]), [
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;
    const { newPassword } = req.body;
    console.log('Change password request received for user ID:', id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      console.log('User not found:', id);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Found user:', user.name);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the password
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });

    console.log('Password changed successfully for user:', user.name);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;