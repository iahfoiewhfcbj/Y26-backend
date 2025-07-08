import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all products
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req, res) => {
  try {
    const products = await prisma.productCatalog.findMany({
      where: { isActive: true },
      include: {
        category: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create product
router.post('/', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), [
  body('name').notEmpty().trim(),
  body('description').optional().trim(),
  body('unitPrice').optional().isFloat({ min: 0 }),
  body('unit').optional().trim(),
  body('categoryId').optional().isUUID(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const product = await prisma.productCatalog.create({
      data: req.body,
      include: {
        category: true
      }
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), [
  body('name').optional().notEmpty().trim(),
  body('description').optional().trim(),
  body('unitPrice').optional().isFloat({ min: 0 }),
  body('unit').optional().trim(),
  body('categoryId').optional().isUUID(),
  body('isActive').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;

    const product = await prisma.productCatalog.update({
      where: { id },
      data: req.body,
      include: {
        category: true
      }
    });

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete
    await prisma.productCatalog.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;