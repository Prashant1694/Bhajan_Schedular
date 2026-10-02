// ============================================================
// Notification Controller — Bhajan Planner
// Handles notification API endpoints and admin views
// ============================================================

const notificationService = require("../services/notificationService");
const PushSubscription = require("../models/PushSubscription");
const Singer = require("../models/Singer");
const { normalizeName } = require("../services/helpers");

// ── API: Get notifications for a device ──────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const deviceId = req.query.device_id;
    if (!deviceId) return res.json({ notifications: [] });

    // Find singer associated with this device or session
    const sub = await PushSubscription.findOne({ where: { device_id: deviceId } });
    const singerId = req.session?.singer?.id || (sub ? sub.singer_id : null);

    const notifications = await notificationService.getNotificationsForDevice(
      deviceId, singerId, 30
    );
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Get unread count ────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const deviceId = req.query.device_id;
    if (!deviceId) return res.json({ count: 0 });

    const sub = await PushSubscription.findOne({ where: { device_id: deviceId } });
    const singerId = req.session?.singer?.id || (sub ? sub.singer_id : null);

    const count = await notificationService.getUnreadCount(deviceId, singerId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Mark notification as read ───────────────────────────
exports.markRead = async (req, res) => {
  try {
    const { notification_id, device_id } = req.body;
    if (!notification_id || !device_id) {
      return res.status(400).json({ error: "Missing notification_id or device_id" });
    }
    await notificationService.markRead(notification_id, device_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Mark all as read ────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: "Missing device_id" });

    const sub = await PushSubscription.findOne({ where: { device_id } });
    const singerId = sub ? sub.singer_id : null;

    await notificationService.markAllRead(device_id, singerId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Check singer PIN status ────────────────────────────
exports.getSingerPinStatus = async (req, res) => {
  try {
    const { singer_id } = req.query;
    if (!singer_id) {
      return res.status(400).json({ error: "Missing singer_id" });
    }

    const singer = await Singer.findByPk(singer_id);
    if (!singer) {
      return res.status(404).json({ error: "Singer not found" });
    }

    res.json({
      hasPin: !!singer.pin,
      singer_id: singer.id,
      singer_name: singer.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Subscribe to push notifications ─────────────────────
exports.subscribe = async (req, res) => {
  try {
    const { singer_id, device_id, pin, subscription } = req.body;

    if (!singer_id || !device_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { Sequelize } = require("sequelize");
    const bcrypt = require("bcrypt");

    // Verify singer exists
    const singer = await Singer.findByPk(singer_id);
    if (!singer) {
      return res.status(404).json({ error: "Singer not found" });
    }

    // Validate 4-digit PIN
    const cleanPin = (pin || "").toString().trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: "Please enter a valid 4-digit numeric PIN." });
    }

    if (!singer.pin) {
      // First time claiming this name: set the 4-digit PIN!
      const hashed = await bcrypt.hash(cleanPin, 10);
      await singer.update({ pin: hashed });
    } else {
      // PIN is already set: verify it matches!
      const isMatch = await bcrypt.compare(cleanPin, singer.pin);
      if (!isMatch) {
        return res.status(403).json({
          error: `Incorrect 4-digit PIN for ${singer.name}. Please enter your correct PIN or contact the administrator to reset it.`
        });
      }
    }

    const endpoint = subscription?.endpoint || `in_app_${device_id}`;
    const p256dh = subscription?.keys?.p256dh || "";
    const auth = subscription?.keys?.auth || "";

    // Check if subscription for this device or endpoint already exists
    const existing = await PushSubscription.findOne({
      where: {
        [Sequelize.Op.or]: [
          { endpoint },
          { device_id }
        ]
      }
    });

    if (existing) {
      // Update the existing subscription
      await existing.update({
        singer_id,
        device_id,
        endpoint,
        p256dh,
        auth,
        enabled: true
      });
      return res.json({ success: true, updated: true, singer_name: singer.name });
    }

    // Create new subscription
    await PushSubscription.create({
      singer_id,
      device_id,
      endpoint,
      p256dh,
      auth,
      enabled: true
    });

    res.json({ success: true, created: true, singer_name: singer.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Unsubscribe from push notifications ─────────────────
exports.unsubscribe = async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: "Missing device_id" });

    await PushSubscription.destroy({ where: { device_id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Get subscription status ─────────────────────────────
exports.subscriptionStatus = async (req, res) => {
  try {
    const deviceId = req.query.device_id;
    if (!deviceId) return res.json({ subscribed: false });

    const sub = await PushSubscription.findOne({ where: { device_id: deviceId } });
    if (!sub) return res.json({ subscribed: false });

    const singer = await Singer.findByPk(sub.singer_id);
    res.json({
      subscribed: true,
      enabled: sub.enabled,
      singer_id: sub.singer_id,
      singer_name: singer ? singer.name : "Unknown"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── API: Get VAPID public key ────────────────────────────────
exports.getVapidKey = (req, res) => {
  res.json({ publicKey: notificationService.VAPID_PUBLIC_KEY });
};

// ── Admin: Notification overview ─────────────────────────────
exports.adminNotifications = async (req, res) => {
  try {
    const notifications = await notificationService.getAllNotifications(100);
    const subscriptions = await PushSubscription.findAll({
      order: [["created_at", "DESC"]]
    });

    // Get all singers for dropdown and for singerMap
    const allSingers = await Singer.findAll({
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    const singerMap = {};
    allSingers.forEach((s) => {
      singerMap[s.id] = s.name;
    });

    res.render("admin-notifications", {
      notifications,
      subscriptions,
      singerMap,
      allSingers,
      page: "notifications",
      pageTitle: "Notifications"
    });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

// ── Admin: Send custom notification ──────────────────────────
exports.sendCustomNotification = async (req, res) => {
  try {
    const { title, body, link, target_type, singer_id } = req.body;

    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).json({ error: "Title and message are required." });
    }

    const eventKey = `custom:${Date.now()}`;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanLink = link && link.trim() ? link.trim() : "/";

    let result;
    if (target_type === "singer" && singer_id) {
      const singerIdNum = parseInt(singer_id, 10);
      const singer = await Singer.findByPk(singerIdNum);
      if (!singer) {
        return res.status(404).json({ error: "Selected singer not found." });
      }

      result = await notificationService.createPersonalized({
        type: "custom",
        title: cleanTitle,
        body: cleanBody,
        link: cleanLink,
        eventKey,
        singerId: singerIdNum
      });
    } else {
      result = await notificationService.createAndBroadcast({
        type: "custom",
        title: cleanTitle,
        body: cleanBody,
        link: cleanLink,
        eventKey
      });
    }

    res.json({
      success: true,
      created: result.created,
      message: "Custom notification sent successfully!"
    });
  } catch (error) {
    console.error("sendCustomNotification error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ── Admin: Send test notification ────────────────────────────
exports.sendTestNotification = async (req, res) => {
  try {
    const eventKey = `test:${Date.now()}`;
    const result = await notificationService.createAndBroadcast({
      type: "test",
      title: "🔔 Test Notification",
      body: "This is a test notification from the Bhajan Planner admin panel.",
      link: "/",
      eventKey
    });
    res.json({ success: true, created: result.created });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Admin: Delete notification ───────────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    await notificationService.deleteNotification(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
