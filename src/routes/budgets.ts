import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole, EventStatus, ApprovalStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get budgets for an event
router.get('/event/:eventId', authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;

    const budgets = await prisma.budget.findMany({
      where: { eventId },
      include: {
        category: true,
        event: {
          include: {
            creator: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { category: { order: 'asc' } }
    });

    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// Create or update budget
router.post('/event/:eventId', authenticate, authorize([UserRole.EVENT_TEAM_LEAD, UserRole.FINANCE_TEAM, UserRole.ADMIN]), [
  body('budgets').isArray(),
  body('budgets.*.categoryId').isUUID(),
  body('budgets.*.amount').isFloat({ min: 0 }),
  body('budgets.*.sponsorAmount').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { eventId } = req.params;
    const { budgets } = req.body;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Create or update budgets
    const budgetPromises = budgets.map((budget: any) =>
      prisma.budget.upsert({
        where: {
          eventId_categoryId: {
            eventId: eventId,
            categoryId: budget.categoryId
          }
        },
        update: {
          amount: budget.amount,
          sponsorAmount: budget.sponsorAmount || 0,
          remarks: budget.remarks
        },
        create: {
          eventId: eventId,
          categoryId: budget.categoryId,
          amount: budget.amount,
          sponsorAmount: budget.sponsorAmount || 0,
          remarks: budget.remarks
        },
        include: {
          category: true
        }
      })
    );

    const updatedBudgets = await Promise.all(budgetPromises);

    // If submitted by team lead, send email to finance team
    if (req.user!.role === UserRole.EVENT_TEAM_LEAD) {
      try {
        const financeTeamUsers = await prisma.user.findMany({
          where: { role: UserRole.FINANCE_TEAM, isActive: true },
          select: { email: true }
        });

        const emailContent = emailTemplates.budgetSubmitted(event.title, event.creator.name);
        
        for (const user of financeTeamUsers) {
          await sendEmail({
            to: user.email,
            subject: emailContent.subject,
            html: emailContent.html
          });
        }
      } catch (emailError) {
        console.error('Failed to send budget submitted email:', emailError);
      }
    }

    res.json(updatedBudgets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save budgets' });
  }
});

// Approve/Reject budget
router.post('/event/:eventId/approve', authenticate, authorize([UserRole.FINANCE_TEAM, UserRole.ADMIN]), [
  body('status').isIn(['APPROVED', 'REJECTED']),
  body('remarks').notEmpty().trim(),
  body('budgetAdjustments').optional().isArray(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { eventId } = req.params;
    const { status, remarks, budgetAdjustments } = req.body;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Apply budget adjustments if provided
    if (budgetAdjustments && budgetAdjustments.length > 0) {
      const adjustmentPromises = budgetAdjustments.map((adjustment: any) =>
        prisma.budget.update({
          where: {
            eventId_categoryId: {
              eventId: eventId,
              categoryId: adjustment.categoryId
            }
          },
          data: {
            approvedAmount: adjustment.approvedAmount,
            sponsorAmount: adjustment.sponsorAmount || 0
          }
        })
      );
      await Promise.all(adjustmentPromises);
    }

    // Create budget approval record
    const approval = await prisma.budgetApproval.create({
      data: {
        eventId: eventId,
        reviewerId: req.user!.userId,
        status: status as ApprovalStatus,
        remarks: remarks
      },
      include: {
        reviewer: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Update event status
    await prisma.event.update({
      where: { id: eventId },
      data: { status: status === 'APPROVED' ? EventStatus.APPROVED : EventStatus.REJECTED }
    });

    // Send email to event creator and coordinator
    try {
      const emailContent = emailTemplates.budgetApproved(event.title, status, remarks);
      
      const emailRecipients = [event.creator.email];
      if (event.coordinator) {
        emailRecipients.push(event.coordinator.email);
      }

      for (const email of emailRecipients) {
        await sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html
        });
      }
    } catch (emailError) {
      console.error('Failed to send budget approval email:', emailError);
    }

    res.json(approval);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve/reject budget' });
  }
});

export default router;