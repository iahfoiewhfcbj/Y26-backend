import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get expenses for a workshop
router.get('/workshop/:workshopId', authenticate, async (req: Request, res: Response) => {
  try {
    const { workshopId } = req.params;

    const expenses = await prisma.workshopExpense.findMany({
      where: { workshopId },
      include: {
        category: true,
        addedBy: {
          select: { id: true, name: true, email: true }
        },
        product: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workshop expenses' });
  }
});

// Get expense summary for a workshop
router.get('/workshop/:workshopId/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { workshopId } = req.params;

    const budgets = await prisma.workshopBudget.findMany({
      where: { workshopId },
      include: { category: true }
    });

    const expenses = await prisma.workshopExpense.findMany({
      where: { workshopId },
      include: { category: true }
    });

    const summary = budgets.map(budget => {
      const categoryExpenses = expenses.filter(expense => expense.categoryId === budget.categoryId);
      const totalExpense = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);

      return {
        category: budget.category,
        budgetAmount: budget.approvedAmount || budget.amount,
        totalExpense: totalExpense,
        remaining: (budget.approvedAmount || budget.amount) - totalExpense,
        expenseCount: categoryExpenses.length
      };
    });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workshop expense summary' });
  }
});

// Create workshop expense
router.post('/', authenticate, authorize([UserRole.FACILITIES_TEAM, UserRole.FINANCE_TEAM, UserRole.ADMIN, UserRole.WORKSHOP_TEAM_LEAD]), [
  body('workshopId').isUUID(),
  body('categoryId').isUUID(),
  body('itemName').notEmpty().trim(),
  body('quantity').isFloat({ min: 0 }),
  body('unitPrice').isFloat({ min: 0 }),
  body('amount').isFloat({ min: 0 }),
  body('remarks').optional().trim(),
  body('productId').optional().isUUID(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const expenseData = {
      ...req.body,
      addedById: req.user!.userId
    };

    const expense = await prisma.workshopExpense.create({
      data: expenseData,
      include: {
        category: true,
        addedBy: {
          select: { id: true, name: true, email: true }
        },
        product: true,
        workshop: {
          include: {
            coordinator: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    // Send email to workshop coordinator
    if (expense.workshop.coordinator) {
      try {
        const emailContent = emailTemplates.workshopExpenseAdded(
          expense.workshop.title,
          expense.itemName,
          expense.amount,
          expense.addedBy.name
        );
        await sendEmail({
          to: expense.workshop.coordinator.email,
          subject: emailContent.subject,
          html: emailContent.html
        });
      } catch (emailError) {
        console.error('Failed to send workshop expense added email:', emailError);
      }
    }

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workshop expense' });
  }
});

// Update workshop expense
router.put('/:id', authenticate, authorize([UserRole.FACILITIES_TEAM, UserRole.FINANCE_TEAM, UserRole.ADMIN, UserRole.WORKSHOP_TEAM_LEAD]), [
  body('itemName').optional().notEmpty().trim(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('unitPrice').optional().isFloat({ min: 0 }),
  body('amount').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;

    const expense = await prisma.workshopExpense.update({
      where: { id },
      data: req.body,
      include: {
        category: true,
        addedBy: {
          select: { id: true, name: true, email: true }
        },
        product: true
      }
    });

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workshop expense' });
  }
});

// Delete workshop expense
router.delete('/:id', authenticate, authorize([UserRole.FACILITIES_TEAM, UserRole.FINANCE_TEAM, UserRole.ADMIN, UserRole.WORKSHOP_TEAM_LEAD]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.workshopExpense.delete({
      where: { id }
    });

    res.json({ message: 'Workshop expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workshop expense' });
  }
});

export default router;