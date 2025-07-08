import express from 'express';
import { body, validationResult } from 'express-validator';
import { PrismaClient, UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all venues
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            dateTime: true,
            status: true
          }
        }
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
  body('description').optional().trim(),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().trim(),
  body('facilities').optional().trim(),
], async (req, res) => {
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
  body('description').optional().trim(),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().trim(),
  body('facilities').optional().trim(),
  body('isActive').optional().isBoolean(),
], async (req, res) => {
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
router.delete('/:id', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req, res) => {
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
router.post('/:venueId/assign/:eventId', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req, res) => {
  try {
    const { venueId, eventId } = req.params;

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

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign venue' });
  }
});

// Get events for venue assignment
router.get('/events-for-assignment', authenticate, authorize([UserRole.ADMIN, UserRole.FACILITIES_TEAM]), async (req, res) => {
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
      orderBy: { dateTime: 'asc' }
    });

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events for assignment' });
  }
});

export default router;