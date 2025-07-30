import express from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getVapidPublicKey, 
  savePushSubscription, 
  deletePushSubscription,
  sendPushNotification,
  sendNotificationToRole
} from '../utils/pushNotifications';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Get VAPID public key
router.get('/vapid-public-key', (req, res) => {
  try {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (error) {
    console.error('Error getting VAPID public key:', error);
    res.status(500).json({ error: 'Failed to get VAPID public key' });
  }
});

// Subscribe to push notifications
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription, deviceInfo } = req.body;
    const userId = req.user!.userId;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    // Save subscription to database
    const savedSubscription = await savePushSubscription(
      userId,
      subscription,
      deviceInfo
    );

    // Update user's notification permission status
    await prisma.user.update({
      where: { id: userId },
      data: { notificationPermission: true }
    });

    // Send a test notification
    await sendPushNotification(userId, {
      title: 'Notifications Enabled',
      message: 'You will now receive notifications for all activities.',
      icon: '/favicon.ico'
    });

    res.json({ 
      success: true, 
      message: 'Successfully subscribed to push notifications',
      subscription: savedSubscription
    });
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user!.userId;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    // Delete subscription from database
    await deletePushSubscription(userId, endpoint);

    // Check if user has any remaining subscriptions
    const remainingSubscriptions = await prisma.pushSubscription.count({
      where: { userId }
    });

    // If no subscriptions remain, update user's notification permission status
    if (remainingSubscriptions === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { notificationPermission: false }
      });
    }

    res.json({ 
      success: true, 
      message: 'Successfully unsubscribed from push notifications' 
    });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

// Update notification permission status
router.post('/permission-status', authenticate, async (req, res) => {
  try {
    const { hasPermission } = req.body;
    const userId = req.user!.userId;

    await prisma.user.update({
      where: { id: userId },
      data: { notificationPermission: hasPermission }
    });

    res.json({ 
      success: true, 
      message: 'Notification permission status updated' 
    });
  } catch (error) {
    console.error('Error updating notification permission status:', error);
    res.status(500).json({ error: 'Failed to update notification permission status' });
  }
});

// Get user's notification permission status
router.get('/permission-status', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPermission: true }
    });

    res.json({ 
      hasPermission: user?.notificationPermission || false 
    });
  } catch (error) {
    console.error('Error getting notification permission status:', error);
    res.status(500).json({ error: 'Failed to get notification permission status' });
  }
});

// Get user's subscriptions
router.get('/subscriptions', authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        deviceInfo: true,
        createdAt: true
      }
    });

    res.json({ subscriptions });
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    res.status(500).json({ error: 'Failed to get user subscriptions' });
  }
});

// Send push notification to specific user
router.post('/send', authenticate, async (req, res) => {
  try {
    const { userId, payload } = req.body;
    
    if (!userId || !payload) {
      return res.status(400).json({ error: 'User ID and payload are required' });
    }

    const result = await sendPushNotification(userId, payload);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error sending push notification:', error);
    res.status(500).json({ error: 'Failed to send push notification' });
  }
});

// Send notification to role
router.post('/send-to-role', authenticate, async (req, res) => {
  try {
    const { role, payload } = req.body;
    
    if (!role || !payload) {
      return res.status(400).json({ error: 'Role and payload are required' });
    }

    const result = await sendNotificationToRole(role, payload);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error sending role-based notification:', error);
    res.status(500).json({ error: 'Failed to send role-based notification' });
  }
});

export default router; 