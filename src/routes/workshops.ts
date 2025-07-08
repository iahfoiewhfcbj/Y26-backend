import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole, WorkshopStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all workshops
router.get('/', authenticate, async (req, res) => {
  try {
    const { role, userId } = req.user!;
    
    let whereClause: any = {};
    
    // Role-based filtering
    if (role === UserRole.WORKSHOP_TEAM_LEAD) {
      whereClause.creatorId = userId;
    } else if (role === UserRole.WORKSHOP_COORDINATOR) {
      whereClause.coordinatorId = userId;
    }

    const workshops = await prisma.workshop.findMany({
      where: whereClause,
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
        budgetApprovals: {
          include: {
            reviewer: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            expenses: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(workshops);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workshops' });
  }
});

// Get workshop by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, userId } = req.user!;

    const workshop = await prisma.workshop.findUnique({
      where: { id },
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
        budgetApprovals: {
          include: {
            reviewer: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        expenses: {
          include: {
            category: true,
            addedBy: {
              select: { id: true, name: true, email: true }
            },
            product: true
          }
        }
      }
    });

    if (!workshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Check permissions
    if (role === UserRole.WORKSHOP_TEAM_LEAD && workshop.creatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (role === UserRole.WORKSHOP_COORDINATOR && workshop.coordinatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(workshop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workshop' });
  }
});

// Create workshop
router.post('/', authenticate, authorize([UserRole.WORKSHOP_TEAM_LEAD, UserRole.ADMIN]), [
  body('title').notEmpty().trim(),
  body('coordinatorEmail').optional().isEmail(),
  body('description').optional().trim(),
  body('venue').optional().trim(),
  body('dateTime').optional().isISO8601(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { title, coordinatorEmail, description, venue, dateTime } = req.body;

    // Find coordinator by email if provided
    let coordinatorId = null;
    if (coordinatorEmail) {
      const coordinator = await prisma.user.findUnique({
        where: { email: coordinatorEmail, role: UserRole.WORKSHOP_COORDINATOR, isActive: true }
      });
      
      if (!coordinator) {
        return res.status(400).json({ error: 'Workshop coordinator not found with the provided email' });
      }
      coordinatorId = coordinator.id;
    }

    const workshopData = {
      title,
      coordinatorEmail,
      description,
      venue,
      dateTime: dateTime ? new Date(dateTime) : null,
      creatorId: req.user!.userId,
      coordinatorId
    };

    const workshop = await prisma.workshop.create({
      data: workshopData,
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Send email to coordinator if assigned
    if (workshop.coordinator) {
      try {
        const emailContent = emailTemplates.workshopCreated(
          workshop.title,
          workshop.creator.name,
          workshop.coordinator.name
        );
        await sendEmail({
          to: workshop.coordinator.email,
          subject: emailContent.subject,
          html: emailContent.html
        });
      } catch (emailError) {
        console.error('Failed to send workshop created email:', emailError);
      }
    }

    res.status(201).json(workshop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workshop' });
  }
});

// Update workshop
router.put('/:id', authenticate, [
  body('title').optional().notEmpty().trim(),
  body('coordinatorEmail').optional().isEmail(),
  body('description').optional().trim(),
  body('venue').optional().trim(),
  body('dateTime').optional().isISO8601(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;
    const { role, userId } = req.user!;

    const existingWorkshop = await prisma.workshop.findUnique({
      where: { id },
      select: { creatorId: true, status: true }
    });

    if (!existingWorkshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Check permissions
    if (role === UserRole.WORKSHOP_TEAM_LEAD && existingWorkshop.creatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Workshop team leads can only edit if workshop is pending or rejected
    if (role === UserRole.WORKSHOP_TEAM_LEAD && 
        existingWorkshop.status !== WorkshopStatus.PENDING && 
        existingWorkshop.status !== WorkshopStatus.REJECTED) {
      return res.status(400).json({ error: 'Cannot edit approved or completed workshops' });
    }

    const updateData = { ...req.body };
    
    // Handle coordinator email update
    if (req.body.coordinatorEmail) {
      const coordinator = await prisma.user.findUnique({
        where: { email: req.body.coordinatorEmail, role: UserRole.WORKSHOP_COORDINATOR, isActive: true }
      });
      
      if (!coordinator) {
        return res.status(400).json({ error: 'Workshop coordinator not found with the provided email' });
      }
      updateData.coordinatorId = coordinator.id;
    }

    if (req.body.dateTime) {
      updateData.dateTime = new Date(req.body.dateTime);
    }

    const workshop = await prisma.workshop.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(workshop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workshop' });
  }
});

// Delete workshop
router.delete('/:id', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.workshop.delete({
      where: { id }
    });

    res.json({ message: 'Workshop deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workshop' });
  }
});

export default router;