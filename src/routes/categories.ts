import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/', authenticate, async (req: Request, res: Response) => {
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
  body('order').optional().isInt({ min: 0 }).toInt(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    console.log('Creating category with data:', req.body);

    // If order is not provided, find the highest order and add 1
    let categoryData = { ...req.body };
    if (!categoryData.order) {
      const highestOrderCategory = await prisma.budgetCategory.findFirst({
        where: { isActive: true },
        orderBy: { order: 'desc' },
        select: { order: true }
      });
      
      categoryData.order = (highestOrderCategory?.order ?? -1) + 1;
      console.log('Auto-assigned order:', categoryData.order);
    }

    const category = await prisma.budgetCategory.create({
      data: categoryData
    });

    res.status(201).json(category);
  } catch (error: any) {
    console.error('Error creating category:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid foreign key reference' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create category',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update category
router.put('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), [
  body('name').optional().notEmpty().trim(),
  body('description').optional().trim(),
  body('order').optional().isInt({ min: 0 }).toInt(),
  body('isActive').optional().isBoolean(),
], async (req: Request, res: Response) => {
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
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), async (req: Request, res: Response) => {
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