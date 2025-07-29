import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';
// Activity logging will be handled by the middleware

const router = express.Router();
const prisma = new PrismaClient();

// Get all quotations
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const quotations = await prisma.quotation.findMany({
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        event: {
          select: { id: true, title: true }
        },
        workshop: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

// Get quotations by event ID
router.get('/event/:eventId', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    const quotations = await prisma.quotation.findMany({
      where: { eventId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        event: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

// Get quotations by workshop ID
router.get('/workshop/:workshopId', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { workshopId } = req.params;

    const quotations = await prisma.quotation.findMany({
      where: { workshopId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        workshop: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

// Get quotation by ID
router.get('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        event: {
          select: { id: true, title: true }
        },
        workshop: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    res.json(quotation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

// Create quotation
router.post('/', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), [
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('eventId').optional().isUUID(),
  body('workshopId').optional().isUUID(),
  body('items').isArray({ min: 1 }),
  body('items.*.productName').notEmpty().trim(),
  body('items.*.description').optional().trim(),
  body('items.*.quantity').isFloat({ min: 0 }),
  body('items.*.unitPrice').isFloat({ min: 0 }),
  body('items.*.categoryId').optional().isUUID(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { title, description, eventId, workshopId, items } = req.body;

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // Create quotation with items
    const quotation = await prisma.quotation.create({
      data: {
        title,
        description,
        eventId,
        workshopId,
        totalAmount,
        createdById: req.user!.userId,
        items: {
          create: items.map((item: any) => ({
            productName: item.productName,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            categoryId: item.categoryId
          }))
        }
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        event: {
          select: { id: true, title: true }
        },
        workshop: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      }
    });

    res.status(201).json(quotation);
  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

// Update quotation
router.put('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), [
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('items').isArray({ min: 1 }),
  body('items.*.productName').notEmpty().trim(),
  body('items.*.description').optional().trim(),
  body('items.*.quantity').isFloat({ min: 0 }),
  body('items.*.unitPrice').isFloat({ min: 0 }),
  body('items.*.categoryId').optional().isUUID(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;
    const { title, description, items } = req.body;

    // Get existing quotation
    const existingQuotation = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existingQuotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // Update quotation with items
    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        title,
        description,
        totalAmount,
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            productName: item.productName,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            categoryId: item.categoryId
          }))
        }
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        event: {
          select: { id: true, title: true }
        },
        workshop: {
          select: { id: true, title: true }
        },
        items: {
          include: {
            category: true
          }
        }
      }
    });

    res.json(quotation);
  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// Delete quotation
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const quotation = await prisma.quotation.findUnique({
      where: { id }
    });

    if (!quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    await prisma.quotation.delete({
      where: { id }
    });

    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

export default router; 