// ============================================================
// Notification Service — Bhajan Planner
// Handles notification creation, push delivery, and read state
// ============================================================

const webpush = require("web-push");
const Notification = require("../models/Notification");
const NotificationRead = require("../models/NotificationRead");
const PushSubscription = require("../models/PushSubscription");
const { Sequelize } = require("sequelize");

// ── VAPID configuration ──────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ── Create a notification (idempotent via event_key) ─────────
async function createNotification({
  type,
  title,
  body,
  link,
  eventKey,
  targetSingerId = null,
  metadata = null
}) {
  try {
    const [notification, created] = await Notification.findOrCreate({
      where: { event_key: eventKey },
      defaults: {
        type,
        title,
        body,
        link: link || null,
        target_singer_id: targetSingerId,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });
    return { notification, created };
  } catch (error) {
    // Handle unique constraint race condition gracefully
    if (error.name === "SequelizeUniqueConstraintError") {
      const existing = await Notification.findOne({ where: { event_key: eventKey } });
      return { notification: existing, created: false };
    }
    throw error;
  }
}

// ── Send Web Push to ALL enabled subscriptions ───────────────
async function sendPushToAll(notification) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await PushSubscription.findAll({ where: { enabled: true } });
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.link || "/",
    icon: "/images/icons/icon-192x192.png",
    badge: "/images/icons/icon-192x192.png"
  });

  const results = await Promise.allSettled(subscriptions.map((sub) => sendPush(sub, payload)));

  return results;
}

// ── Send Web Push to a specific Singer's devices ─────────────
async function sendPushToSinger(singerId, notification) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await PushSubscription.findAll({
    where: { singer_id: singerId, enabled: true }
  });

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.link || "/",
    icon: "/images/icons/icon-192x192.png",
    badge: "/images/icons/icon-192x192.png"
  });

  const results = await Promise.allSettled(subscriptions.map((sub) => sendPush(sub, payload)));

  return results;
}

// ── Internal: send push to a single subscription ─────────────
async function sendPush(sub, payload) {
  if (!sub.endpoint || sub.endpoint.startsWith("in_app_") || !sub.p256dh || !sub.auth) {
    return;
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      },
      payload
    );
  } catch (error) {
    // 404/410 = subscription expired or unsubscribed — remove it
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log(`[Push] Removing expired subscription ${sub.id}`);
      await sub.destroy();
    } else {
      console.error(`[Push] Failed to send to subscription ${sub.id}:`, error.message);
    }
  }
}

// ── Get notifications for a device ───────────────────────────
// Returns broadcast notifications + personalized notifications for the device's singer
async function getNotificationsForDevice(deviceId, singerId = null, limit = 30) {
  const whereClause = singerId
    ? {
        [Sequelize.Op.or]: [{ target_singer_id: null }, { target_singer_id: singerId }]
      }
    : { target_singer_id: null };

  const notifications = await Notification.findAll({
    where: whereClause,
    order: [["created_at", "DESC"]],
    limit
  });

  // Get read status for each notification
  const notificationIds = notifications.map((n) => n.id);
  const reads = await NotificationRead.findAll({
    where: {
      notification_id: { [Sequelize.Op.in]: notificationIds },
      device_id: deviceId
    }
  });
  const readSet = new Set(reads.map((r) => r.notification_id));

  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: readSet.has(n.id),
    createdAt: n.created_at,
    metadata: n.metadata ? JSON.parse(n.metadata) : null
  }));
}

// ── Get unread count for a device ────────────────────────────
async function getUnreadCount(deviceId, singerId = null) {
  const whereClause = singerId
    ? {
        [Sequelize.Op.or]: [{ target_singer_id: null }, { target_singer_id: singerId }]
      }
    : { target_singer_id: null };

  // Since include with count can be tricky with SQLite, use a simpler approach
  const allNotifications = await Notification.findAll({
    where: whereClause,
    attributes: ["id"]
  });
  const notificationIds = allNotifications.map((n) => n.id);

  if (notificationIds.length === 0) return 0;

  const readIds = await NotificationRead.count({
    where: {
      device_id: deviceId,
      notification_id: { [Sequelize.Op.in]: notificationIds }
    }
  });

  return notificationIds.length - readIds;
}

// ── Mark a notification as read ──────────────────────────────
async function markRead(notificationId, deviceId) {
  try {
    await NotificationRead.findOrCreate({
      where: { notification_id: notificationId, device_id: deviceId },
      defaults: { read_at: new Date() }
    });
    return true;
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") return true;
    throw error;
  }
}

// ── Mark all notifications as read for a device ──────────────
async function markAllRead(deviceId, singerId = null) {
  const whereClause = singerId
    ? {
        [Sequelize.Op.or]: [{ target_singer_id: null }, { target_singer_id: singerId }]
      }
    : { target_singer_id: null };

  const notifications = await Notification.findAll({
    where: whereClause,
    attributes: ["id"]
  });

  const bulkData = notifications.map((n) => ({
    notification_id: n.id,
    device_id: deviceId,
    read_at: new Date()
  }));

  // Use ignoreDuplicates to skip already-read ones
  await NotificationRead.bulkCreate(bulkData, { ignoreDuplicates: true });
  return true;
}

// ── Create and broadcast a notification ──────────────────────
async function createAndBroadcast({ type, title, body, link, eventKey, metadata = null }) {
  const { notification, created } = await createNotification({
    type,
    title,
    body,
    link,
    eventKey,
    targetSingerId: null,
    metadata
  });
  if (created) {
    await sendPushToAll(notification);
  }
  return { notification, created };
}

// ── Create a personalized notification ───────────────────────
async function createPersonalized({
  type,
  title,
  body,
  link,
  eventKey,
  singerId,
  metadata = null
}) {
  const { notification, created } = await createNotification({
    type,
    title,
    body,
    link,
    eventKey,
    targetSingerId: singerId,
    metadata
  });
  if (created) {
    await sendPushToSinger(singerId, notification);
  }
  return { notification, created };
}

// ── Get all notifications (admin view) ───────────────────────
async function getAllNotifications(limit = 100) {
  return Notification.findAll({
    order: [["created_at", "DESC"]],
    limit
  });
}

// ── Delete a notification ────────────────────────────────────
async function deleteNotification(id) {
  await NotificationRead.destroy({ where: { notification_id: id } });
  await Notification.destroy({ where: { id } });
}

module.exports = {
  createNotification,
  createAndBroadcast,
  createPersonalized,
  sendPushToAll,
  sendPushToSinger,
  getNotificationsForDevice,
  getUnreadCount,
  markRead,
  markAllRead,
  getAllNotifications,
  deleteNotification,
  VAPID_PUBLIC_KEY
};
