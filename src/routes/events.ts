import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole, EventStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all events
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { role, userId } = req.user!;
    
    let whereClause: any = {};
    
    // Role-based filtering
    if (role === UserRole.EVENT_TEAM_LEAD) {
      whereClause.creatorId = userId;
    } else if (role === UserRole.EVENT_COORDINATOR) {
      whereClause.coordinatorId = userId;
    }

    const events = await prisma.event.findMany({
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

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get event by ID
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, userId } = req.user!;

    const event = await prisma.event.findUnique({
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

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    if (role === UserRole.EVENT_TEAM_LEAD && event.creatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (role === UserRole.EVENT_COORDINATOR && event.coordinatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create event
router.post('/', authenticate, authorize([UserRole.EVENT_TEAM_LEAD, UserRole.ADMIN]), [
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

    const { title, type, coordinatorEmail, description, venue, startDate, startTime, endDate, endTime } = req.body;

    // Find event coordinator by email if provided
    let coordinatorId = null;
    if (coordinatorEmail) {
      const coordinator = await prisma.user.findUnique({
        where: { email: coordinatorEmail, role: UserRole.EVENT_COORDINATOR, isActive: true }
      });
      
      if (!coordinator) {
        return res.status(400).json({ error: 'Coordinator not found with the provided email' });
      }
      coordinatorId = coordinator.id;
    }

    const eventData = {
      title,
      type, // Add the required 'type' property
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

    const event = await prisma.event.create({
      data: eventData,
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
    if (event.coordinator) {
      try {
        const emailContent = emailTemplates.eventCreated(
          event.title,
          event.creator.name,
          event.coordinator.name
        );
        await sendEmail({
          to: event.coordinator.email,
          subject: emailContent.subject,
          html: emailContent.html
        });
      } catch (emailError) {
        console.error('Failed to send event created email:', emailError);
      }
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
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

    const existingEvent = await prisma.event.findUnique({
      where: { id },
      select: { creatorId: true, status: true }
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    if (role === UserRole.EVENT_TEAM_LEAD && existingEvent.creatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Event team leads can only edit if event is pending or rejected
    if (role === UserRole.EVENT_TEAM_LEAD && 
        existingEvent.status !== EventStatus.PENDING && 
        existingEvent.status !== EventStatus.REJECTED) {
      return res.status(400).json({ error: 'Cannot edit approved or completed events' });
    }

    const updateData = { ...req.body };

    // Only allow fields that exist in the Event model
    const allowedFields = [
      'title', 'type', 'coordinatorEmail', 'description', 'venue',
      'startDate', 'startTime', 'endDate', 'endTime', 'venueId'
    ];
    Object.keys(updateData).forEach(key => {
      if (!allowedFields.includes(key)) {
        delete updateData[key];
      }
    });

    // Convert dates to Date objects if present
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    // Handle coordinator email update
    if (req.body.coordinatorEmail) {
      const coordinator = await prisma.user.findUnique({
        where: { email: req.body.coordinatorEmail, role: UserRole.EVENT_COORDINATOR, isActive: true }
      });
      
      if (!coordinator) {
        return res.status(400).json({ error: 'Coordinator not found with the provided email' });
      }
      updateData.coordinatorId = coordinator.id;
    }

    const event = await prisma.event.update({
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

    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:id', authenticate, authorize([UserRole.ADMIN]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user!;

    // First, check if the event exists and get its details for logging
    const event = await prisma.event.findUnique({
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

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Log the deletion action before deleting
    await prisma.activityLog.create({
      data: {
        action: 'DELETE_EVENT',
        entity: 'Event',
        entityId: id,
        oldValues: {
          title: event.title,
          status: event.status,
          budgetsCount: event._count.budgets,
          expensesCount: event._count.expenses,
          approvalsCount: event._count.budgetApprovals
        },
        userId: userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    // Delete the event (this will cascade delete all related records)
    await prisma.event.delete({
      where: { id }
    });

    res.json({ 
      message: 'Event deleted successfully',
      deletedRecords: {
        event: 1,
        budgets: event._count.budgets,
        expenses: event._count.expenses,
        budgetApprovals: event._count.budgetApprovals
      }
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Assign venue to event
router.post('/:id/assign-venue', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { venueId } = req.body;
    const { userId } = req.user!;

    // Validate venue ID
    if (!venueId) {
      return res.status(400).json({ error: 'Venue ID is required' });
    }

    // Check if event exists and is approved
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    }) as any;

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if event is approved (has approved budget)
    if (event.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Venue can only be assigned to approved events' });
    }

    // Check if venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Check for venue conflicts with other events
    if (event.startDate && event.endDate) {
      const conflictingEvents = await prisma.event.findMany({
        where: ({
          venueId: venueId,
          id: { not: id },
          status: { in: ['APPROVED', 'PENDING'] },
          AND: [
            {
              OR: [
                {
                  AND: [
                    { startDate: { lte: event.startDate } },
                    { endDate: { gte: event.startDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { lte: event.endDate } },
                    { endDate: { gte: event.endDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { gte: event.startDate } },
                    { endDate: { lte: event.endDate } }
                  ]
                }
              ]
            }
          ]
        } as any),
        include: {
          creator: { select: { name: true } },
        },
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

    // Check for venue conflicts with workshops
    if (event.startDate && event.endDate) {
      const conflictingWorkshops = await prisma.workshop.findMany({
        where: ({
          venueId: venueId,
          status: { in: ['APPROVED', 'PENDING'] },
          AND: [
            {
              OR: [
                {
                  AND: [
                    { startDate: { lte: event.startDate } },
                    { endDate: { gte: event.startDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { lte: event.endDate } },
                    { endDate: { gte: event.endDate } }
                  ]
                },
                {
                  AND: [
                    { startDate: { gte: event.startDate } },
                    { endDate: { lte: event.endDate } }
                  ]
                }
              ]
            }
          ]
        } as any),
        include: {
          creator: { select: { name: true } },
        },
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

    // Update event with venue
    const updatedEvent = await prisma.event.update({
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
        entity: 'Event',
        entityId: id,
        oldValues: { venueId: event.venueId },
        newValues: { venueId },
        userId: userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error('Error assigning venue to event:', error);
    res.status(500).json({ error: 'Failed to assign venue to event' });
  }
});

export default router;