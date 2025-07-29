import express from 'express';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Get all venues
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        events: true
      }
    });

    res.json(venues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

// Create venue
router.post('/', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), [
  body('name').notEmpty().trim(),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().trim(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const venue = await prisma.venue.create({
      data: req.body
    });

    res.status(201).json(venue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create venue' });
  }
});

// Update venue
router.put('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), [
  body('name').optional().notEmpty().trim(),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().trim(),
  body('isActive').optional().isBoolean(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { id } = req.params;

    const venue = await prisma.venue.update({
      where: { id },
      data: req.body
    });

    res.json(venue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

// Delete venue
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Soft delete
    await prisma.venue.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'Venue deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete venue' });
  }
});

// Assign venue to event
router.post('/:venueId/assign/:eventId', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const { venueId, eventId } = req.params;

    // Get the current event to check if it already has a venue
    const currentEvent = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: true,
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!currentEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get the venue details
    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const previousVenueId = currentEvent.venueId;
    const isVenueChange = previousVenueId && previousVenueId !== venueId;

    // Update the event with the new venue
    const event = await prisma.event.update({
      where: { id: eventId },
      data: { venueId },
      include: {
        venue: true,
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Send email notification to coordinator
    if (event.coordinator?.email) {
      try {
        if (isVenueChange) {
          // Venue changed notification
          const previousVenue = await prisma.venue.findUnique({
            where: { id: previousVenueId }
          });

          const emailTemplate = emailTemplates.venueChanged(
            event.title,
            event.coordinator.name,
            previousVenue?.name || 'Previous venue',
            venue.name
          );

          await sendEmail({
            to: event.coordinator.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html
          });
        } else {
          // New venue assignment notification
          const emailTemplate = emailTemplates.venueAssigned(
            event.title,
            event.coordinator.name,
            venue.name
          );

          await sendEmail({
            to: event.coordinator.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html
          });
        }
      } catch (emailError) {
        console.error('Failed to send venue assignment email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign venue' });
  }
});

// Get events for venue assignment
router.get('/events-for-assignment', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        status: 'APPROVED'
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        coordinator: {
          select: { id: true, name: true, email: true }
        },
        venue: true
      },
      orderBy: ({ startDate: 'asc' } as any)
    });

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events for assignment' });
  }
});

export default router;