import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// Configure VAPID keys
const vapidKeys = {
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.VAPID_PUBLIC,
  privateKey: process.env.VAPID_PRIVATE
};

if (
  typeof vapidKeys.subject !== 'string' ||
  typeof vapidKeys.publicKey !== 'string' ||
  typeof vapidKeys.privateKey !== 'string'
) {
  throw new Error('VAPID environment variables are not set or are invalid.');
}

webpush.setVapidDetails(
  vapidKeys.subject,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export interface PushNotificationPayload {
  title: string;
  message: string;
  icon?: string;
  badge?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export const sendPushNotification = async (
  userId: string,
  payload: PushNotificationPayload
) => {
  try {
    console.log(`Sending push notification to user ${userId}`);
    
    // Get all push subscriptions for the user
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    console.log(`Found ${subscriptions.length} push subscriptions for user ${userId}`);

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions found for user ${userId}`);
      return;
    }

    const pushPayload = JSON.stringify({
      ...payload,
      data: {
        ...payload.data,
        url: `${process.env.FRONTEND_URL}/login`,
        timestamp: new Date().toISOString()
      }
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            },
            pushPayload
          );
          return { success: true, subscriptionId: subscription.id };
        } catch (error: any) {
          // If subscription is invalid, remove it
          if (error.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { id: subscription.id }
            });
            console.log(`Removed invalid subscription ${subscription.id}`);
          }
          throw error;
        }
      })
    );

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`Push notification sent to user ${userId}: ${successful} successful, ${failed} failed`);

    return { successful, failed };
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

export const sendNotificationToRole = async (
  role: string,
  payload: PushNotificationPayload
) => {
  try {
    console.log(`Sending notification to role: ${role}`);
    
    const users = await prisma.user.findMany({
      where: { 
        role: role as any,
        notificationPermission: true,
        isActive: true
      },
      include: {
        pushSubscriptions: true
      }
    });

    console.log(`Found ${users.length} users with role ${role} and notification permission`);

    if (users.length === 0) {
      console.log(`No users found for role ${role} with notification permission`);
      return { successful: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      users.map(user => {
        console.log(`Sending notification to user ${user.id} (${user.email}) with ${user.pushSubscriptions.length} subscriptions`);
        return sendPushNotification(user.id, payload);
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Role-based notification sent to ${role}: ${successful} successful, ${failed} failed`);
    return { successful, failed };
  } catch (error) {
    console.error('Error sending role-based notification:', error);
    throw error;
  }
};

export const getVapidPublicKey = () => {
  return vapidKeys.publicKey;
};

export const savePushSubscription = async (
  userId: string,
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  deviceInfo?: string
) => {
  try {
    // Check if subscription already exists
    const existingSubscription = await prisma.pushSubscription.findFirst({
      where: {
        userId,
        endpoint: subscription.endpoint
      }
    });

    if (existingSubscription) {
      // Update existing subscription
      return await prisma.pushSubscription.update({
        where: { id: existingSubscription.id },
        data: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          deviceInfo,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new subscription
      return await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          deviceInfo
        }
      });
    }
  } catch (error) {
    console.error('Error saving push subscription:', error);
    throw error;
  }
};

export const deletePushSubscription = async (
  userId: string,
  endpoint: string
) => {
  try {
    await prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint
      }
    });
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    throw error;
  }
}; 