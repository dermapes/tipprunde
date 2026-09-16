const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const webpush = require('web-push');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dataFile = path.resolve(__dirname, process.env.SUBSCRIPTIONS_FILE || './data/subscriptions.json');
const corsOrigin = process.env.CORS_ORIGIN || 'https://dermapes.github.io';

if (!process.env.PUBLIC_VAPID_KEY || !process.env.PRIVATE_VAPID_KEY || !process.env.VAPID_SUBJECT) {
  throw new Error('PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY und VAPID_SUBJECT müssen gesetzt sein.');
}
if (!process.env.ADMIN_TOKEN) {
  throw new Error('ADMIN_TOKEN muss gesetzt sein.');
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.PUBLIC_VAPID_KEY,
  process.env.PRIVATE_VAPID_KEY
);

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '32kb' }));

function readSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeSubscriptions(subscriptions) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(subscriptions, null, 2));
}

function isValidSubscription(subscription) {
  return subscription && typeof subscription.endpoint === 'string' &&
    subscription.keys && typeof subscription.keys.p256dh === 'string' &&
    typeof subscription.keys.auth === 'string';
}

function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') ||
    (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }
  next();
}

async function sendToUser(userId, payload) {
  const subscriptions = readSubscriptions();
  const userSubscriptions = subscriptions[userId] || [];
  const remaining = [];
  let sent = 0;

  for (const subscription of userSubscriptions) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      remaining.push(subscription);
      sent += 1;
    } catch (error) {
      // 404/410 bedeutet: Browser hat die Subscription widerrufen.
      if (error.statusCode !== 404 && error.statusCode !== 410) remaining.push(subscription);
      console.error(`Push für ${userId} fehlgeschlagen:`, error.statusCode || error.message);
    }
  }

  if (remaining.length) subscriptions[userId] = remaining;
  else delete subscriptions[userId];
  writeSubscriptions(subscriptions);
  return sent;
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => res.json({ publicVapidKey: process.env.PUBLIC_VAPID_KEY }));

// Eine Subscription pro Gerät; mehrere Geräte desselben Users werden unterstützt.
app.post('/api/subscribe', (req, res) => {
  const { userId, subscription } = req.body || {};
  if (!userId || typeof userId !== 'string' || !isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'userId und eine gültige subscription sind erforderlich' });
  }

  const subscriptions = readSubscriptions();
  const current = subscriptions[userId] || [];
  const withoutSameEndpoint = current.filter(item => item.endpoint !== subscription.endpoint);
  subscriptions[userId] = [...withoutSameEndpoint, subscription];
  writeSubscriptions(subscriptions);
  res.status(201).json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { userId, endpoint } = req.body || {};
  if (!userId || !endpoint) return res.status(400).json({ error: 'userId und endpoint sind erforderlich' });
  const subscriptions = readSubscriptions();
  subscriptions[userId] = (subscriptions[userId] || []).filter(item => item.endpoint !== endpoint);
  if (!subscriptions[userId].length) delete subscriptions[userId];
  writeSubscriptions(subscriptions);
  res.json({ success: true });
});

app.post('/api/send-notification', requireAdmin, async (req, res) => {
  const { userId, title, body, tag, data, requireInteraction } = req.body || {};
  if (!userId || !body) return res.status(400).json({ error: 'userId und body sind erforderlich' });

  const sent = await sendToUser(userId, {
    title: title || 'Tipprunde', body, tag: tag || 'tipprunde-manual',
    data: data || { url: 'https://dermapes.github.io/tipprunde/viewer.html' },
    requireInteraction: Boolean(requireInteraction)
  });
  res.json({ success: true, sent });
});

// Erwartet Gewinner, die bereits durch deine Ergebnislogik ermittelt wurden.
app.post('/api/check-winners', requireAdmin, async (req, res) => {
  const winners = Array.isArray(req.body?.winners) ? req.body.winners : [];
  let sent = 0;
  for (const winner of winners) {
    if (!winner.userId) continue;
    sent += await sendToUser(winner.userId, {
      title: '🎉 Wette gewonnen!',
      body: winner.betName ? `${winner.betName} war ein Treffer.` : 'Deine Wette wurde gewonnen.',
      tag: `bet-won-${winner.betId || Date.now()}`,
      requireInteraction: true,
      data: { url: 'https://dermapes.github.io/tipprunde/viewer.html' }
    });
  }
  res.json({ success: true, winners: winners.length, sent });
});

app.listen(port, () => console.log(`Tipprunde-Push-Backend läuft auf Port ${port}`));
