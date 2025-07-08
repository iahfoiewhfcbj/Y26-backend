import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole, WorkshopStatus, ApprovalStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get budgets for a workshop
router.get('/workshop/:workshopId', authenticate, async (req, res) => {
  try {
    const { workshopId } = req.params;

    const budgets = await prisma.workshopBudget.findMany({
      where: { workshopId },
      include: {
        category: true,
        workshop: {
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
    res.status(500).json({ error: 'Failed to fetch workshop budgets' });
  }
});

// Create or update workshop budget
router.post('/workshop/:workshopId', authenticate, authorize([UserRole.WORKSHOP_TEAM_LEAD, UserRole.FINANCE_TEAM, UserRole.ADMIN]), [
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

    const { workshopId } = req.params;
    const { budgets } = req.body;

    // Check if workshop exists
    const workshop = await prisma.workshop.findUnique({
      where: { id: workshopId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!workshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Create or update budgets
    const budgetPromises = budgets.map((budget: any) =>
      prisma.workshopBudget.upsert({
        where: {
          workshopId_categoryId: {
            workshopId: workshopId,
            categoryId: budget.categoryId
          }
        },
        update: {
          amount: budget.amount,
          sponsorAmount: budget.sponsorAmount || 0,
          remarks: budget.remarks
        },
        create: {
          workshopId: workshopId,
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
    if (req.user!.role === UserRole.WORKSHOP_TEAM_LEAD) {
      try {
        const financeTeamUsers = await prisma.user.findMany({
          where: { role: UserRole.FINANCE_TEAM, isActive: true },
          select: { email: true }
        });

        const emailContent = emailTemplates.workshopBudgetSubmitted(workshop.title, workshop.creator.name);
        
        for (const user of financeTeamUsers) {
          await sendEmail({
            to: user.email,
            subject: emailContent.subject,
            html: emailContent.html
          });
        }
      } catch (emailError) {
        console.error('Failed to send workshop budget submitted email:', emailError);
      }
    }

    res.json(updatedBudgets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save workshop budgets' });
  }
});

// Approve/Reject workshop budget
router.post('/workshop/:workshopId/approve', authenticate, authorize([UserRole.FINANCE_TEAM, UserRole.ADMIN]), [
  body('status').isIn(['APPROVED', 'REJECTED']),
  body('remarks').notEmpty().trim(),
  body('budgetAdjustments').optional().isArray(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { workshopId } = req.params;
    const { status, remarks, budgetAdjustments } = req.body;

    const workshop = await prisma.workshop.findUnique({
      where: { id: workshopId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!workshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Apply budget adjustments if provided
    if (budgetAdjustments && budgetAdjustments.length > 0) {
      const adjustmentPromises = budgetAdjustments.map((adjustment: any) =>
        prisma.workshopBudget.update({
          where: {
            workshopId_categoryId: {
              workshopId: workshopId,
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
    const approval = await prisma.workshopBudgetApproval.create({
      data: {
        workshopId: workshopId,
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

    // Update workshop status
    await prisma.workshop.update({
      where: { id: workshopId },
      data: { status: status === 'APPROVED' ? WorkshopStatus.APPROVED : WorkshopStatus.REJECTED }
    });

    // Send email to workshop creator and coordinator
    try {
      const emailContent = emailTemplates.workshopBudgetApproved(workshop.title, status, remarks);
      
      const emailRecipients = [workshop.creator.email];
      if (workshop.coordinator) {
        emailRecipients.push(workshop.coordinator.email);
      }

      for (const email of emailRecipients) {
        await sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html
        });
      }
    } catch (emailError) {
      console.error('Failed to send workshop budget approval email:', emailError);
    }

    res.json(approval);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve/reject workshop budget' });
  }
});

export default router;