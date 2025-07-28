import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole, WorkshopStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all workshops
router.get('/', authenticate, async (req: Request, res: Response) => {
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
router.get('/:id', authenticate, async (req: Request, res: Response) => {
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
  body('startDate').optional().isISO8601(),
  body('startTime').optional().isString(),
  body('endDate').optional().isISO8601(),
  body('endTime').optional().isString(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { title, coordinatorEmail, description, venue, startDate, startTime, endDate, endTime } = req.body;

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
      startDate: startDate ? new Date(startDate) : null,
      startTime: startTime || null,
      endDate: endDate ? new Date(endDate) : null,
      endTime: endTime || null,
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
], async (req: Request, res: Response) => {
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
router.delete('/:id', authenticate, authorize([UserRole.ADMIN]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user!;

    // First, check if the workshop exists and get its details for logging
    const workshop = await prisma.workshop.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            budgets: true,
            expenses: true,
            budgetApprovals: true
          }
        }
      }
    });

    if (!workshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Log the deletion action before deleting
    await prisma.activityLog.create({
      data: {
        action: 'DELETE_WORKSHOP',
        entity: 'Workshop',
        entityId: id,
        oldValues: {
          title: workshop.title,
          status: workshop.status,
          budgetsCount: workshop._count.budgets,
          expensesCount: workshop._count.expenses,
          approvalsCount: workshop._count.budgetApprovals
        },
        userId: userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    // Delete the workshop (this will cascade delete all related records)
    await prisma.workshop.delete({
      where: { id }
    });

    res.json({ 
      message: 'Workshop deleted successfully',
      deletedRecords: {
        workshop: 1,
        budgets: workshop._count.budgets,
        expenses: workshop._count.expenses,
        budgetApprovals: workshop._count.budgetApprovals
      }
    });
  } catch (error) {
    console.error('Error deleting workshop:', error);
    res.status(500).json({ error: 'Failed to delete workshop' });
  }
});

// Assign venue to workshop
router.post('/:id/assign-venue', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { venueId } = req.body;
    const { userId } = req.user!;

    // Validate venue ID
    if (!venueId) {
      return res.status(400).json({ error: 'Venue ID is required' });
    }

    // Check if workshop exists and is approved
    const workshop = await prisma.workshop.findUnique({
      where: { id },
      include: {
        budgetApprovals: {
          where: { status: 'APPROVED' },
          take: 1
        }
      }
    }) as any;

    if (!workshop) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    // Check if workshop is approved (has approved budget)
    if (workshop.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Venue can only be assigned to approved workshops' });
    }

    // Check if venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Check for venue conflicts with other workshops
    if (workshop.startDate && workshop.endDate) {
      const conflictingWorkshops = await prisma.workshop.findMany({
        where: ({
          venueId: venueId,
          id: { not: id }, // Exclude current workshop
          status: { in: ['APPROVED', 'PENDING'] },
          AND: [
            {
              OR: [
                {
                  AND: [
                    { startDate: { lte: workshop.startDate } },
                    { endDate: { gte: workshop.startDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { lte: workshop.endDate } },
                    { endDate: { gte: workshop.endDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { gte: workshop.startDate } },
                    { endDate: { lte: workshop.endDate } }
                  ]
                }
              ]
            }
          ]
        } as any),
        include: {
          creator: {
            select: { id: true, name: true, email: true }
          }
        }
      }) as any[];

      if (conflictingWorkshops.length > 0) {
        const conflictDetails = conflictingWorkshops.map(w => ({
          title: w.title,
          startDate: w.startDate,
          endDate: w.endDate,
          creator: w.creator?.name || '',
        }));
        return res.status(409).json({ 
          error: 'Venue conflict detected',
          message: 'This venue is already assigned to another workshop during the specified time period',
          conflicts: conflictDetails
        });
      }
    }

    // Check for venue conflicts with events
    if (workshop.startDate && workshop.endDate) {
      const conflictingEvents = await prisma.event.findMany({
        where: ({
          venueId: venueId,
          status: { in: ['APPROVED', 'PENDING'] },
          AND: [
            {
              OR: [
                {
                  AND: [
                    { startDate: { lte: workshop.startDate } },
                    { endDate: { gte: workshop.startDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { lte: workshop.endDate } },
                    { endDate: { gte: workshop.endDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { gte: workshop.startDate } },
                    { endDate: { lte: workshop.endDate } }
                  ]
                }
              ]
            }
          ]
        } as any),
        include: {
          creator: {
            select: { id: true, name: true, email: true }
          }
        }
      }) as any[];

      if (conflictingEvents.length > 0) {
        const conflictDetails = conflictingEvents.map(e => ({
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          creator: e.creator?.name || '',
        }));
        return res.status(409).json({ 
          error: 'Venue conflict detected',
          message: 'This venue is already assigned to another event during the specified time period',
          conflicts: conflictDetails
        });
      }
    }

    // Update workshop with venue
    const updatedWorkshop = await prisma.workshop.update({
      where: { id },
      data: { venueId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        },
        venue: true
      }
    });

    // Log the venue assignment
    await prisma.activityLog.create({
      data: {
        action: 'ASSIGN_VENUE',
        entity: 'Workshop',
        entityId: id,
        oldValues: { venueId: workshop.venueId },
        newValues: { venueId },
        userId: userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json(updatedWorkshop);
  } catch (error) {
    console.error('Error assigning venue to workshop:', error);
    res.status(500).json({ error: 'Failed to assign venue to workshop' });
  }
});

export default router;