import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get event financial report
router.get('/event/:eventId/financial', authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { role, userId } = req.user!;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        },
        budgets: {
          include: {
            category: true
          }
        },
        expenses: {
          include: {
            category: true,
            addedBy: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    if (role === UserRole.EVENT_COORDINATOR && event.coordinatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const report = {
      event: {
        id: event.id,
        name: event.name,
        type: event.type,
        status: event.status,
        creator: event.creator,
        coordinator: event.coordinator
      },
      budgets: event.budgets.map(budget => ({
        category: budget.category.name,
        budgetAmount: budget.amount,
        approvedAmount: budget.approvedAmount,
        sponsorContribution: budget.sponsorContribution
      })),
      expenses: event.expenses.map(expense => ({
        itemName: expense.itemName,
        category: expense.category.name,
        quantity: expense.quantity,
        unitPrice: expense.unitPrice,
        amount: expense.amount,
        addedBy: expense.addedBy.name,
        createdAt: expense.createdAt
      })),
      summary: {
        totalBudget: event.budgets.reduce((sum, budget) => sum + budget.amount, 0),
        totalApprovedBudget: event.budgets.reduce((sum, budget) => sum + (budget.approvedAmount || budget.amount), 0),
        totalExpenses: event.expenses.reduce((sum, expense) => sum + expense.amount, 0),
        totalSponsorContribution: event.budgets.reduce((sum, budget) => sum + budget.sponsorContribution, 0)
      }
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

// Get overall financial summary
router.get('/summary', authenticate, authorize([UserRole.ADMIN, UserRole.FINANCE_TEAM]), async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: {
        budgets: {
          include: {
            category: true
          }
        },
        expenses: {
          include: {
            category: true
          }
        }
      }
    });

    const summary = events.map(event => ({
      id: event.id,
      name: event.name,
      type: event.type,
      status: event.status,
      totalBudget: event.budgets.reduce((sum, budget) => sum + budget.amount, 0),
      totalApprovedBudget: event.budgets.reduce((sum, budget) => sum + (budget.approvedAmount || budget.amount), 0),
      totalExpenses: event.expenses.reduce((sum, expense) => sum + expense.amount, 0),
      totalSponsorContribution: event.budgets.reduce((sum, budget) => sum + budget.sponsorContribution, 0)
    }));

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate summary report' });
  }
});

export default router;