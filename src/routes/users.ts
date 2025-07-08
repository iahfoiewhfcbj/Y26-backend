import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (Admin only)
router.get('/', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
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
], async (req, res) => {
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
        isActive: true,
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
], async (req, res) => {
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
        isActive: true,
        updatedAt: true
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;