import express from 'express';
import { Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get event financial report
router.get('/event/:eventId/financial', authenticate, async (req: Request, res: Response) => {
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
        name: event.title,
        type: (event as any).type,
        status: event.status,
        creator: event.creator,
        coordinator: event.coordinator
      },
      budgets: event.budgets.map(budget => ({
        category: budget.category.name,
        budgetAmount: budget.amount,
        approvedAmount: budget.approvedAmount,
        sponsorAmount: budget.sponsorAmount
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
        totalSponsorAmount: event.budgets.reduce((sum, budget) => sum + budget.sponsorAmount, 0)
      }
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

// Get overall financial summary
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { role, userId } = req.user!;

    let events: any[] = [];
    
    // If user is coordinator, only get their assigned events
    if (role === UserRole.EVENT_COORDINATOR || role === UserRole.WORKSHOP_COORDINATOR) {
      events = await prisma.event.findMany({
        where: {
          coordinatorId: userId
        },
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
    } else if (role === UserRole.ADMIN || role === UserRole.FINANCE_TEAM) {
      // Admin and finance team can see all events
      events = await prisma.event.findMany({
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
    }

    const summary = events.map(event => ({
      id: event.id,
      name: event.title,
      type: (event as any).type,
      status: event.status,
      totalBudget: event.budgets.reduce((sum: number, budget: any) => sum + budget.amount, 0),
      totalApprovedBudget: event.budgets.reduce((sum: number, budget: any) => sum + (budget.approvedAmount || budget.amount), 0),
      totalExpenses: event.expenses.reduce((sum: number, expense: any) => sum + expense.amount, 0),
      totalSponsorAmount: event.budgets.reduce((sum: number, budget: any) => sum + budget.sponsorAmount, 0)
    }));

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate summary report' });
  }
});

export default router;