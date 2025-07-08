import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await prisma.budgetCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), [
  body('name').notEmpty().trim(),
  body('description').optional().trim(),
  body('order').optional().isInt({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const category = await prisma.budgetCategory.create({
      data: req.body
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), [
  body('name').optional().notEmpty().trim(),
  body('description').optional().trim(),
  body('order').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;

    const category = await prisma.budgetCategory.update({
      where: { id },
      data: req.body
    });

    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete
    await prisma.budgetCategory.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;