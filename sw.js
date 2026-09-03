// CronoTerco Service Worker v3.0
// Notificaciones con cuenta atrás + acciones (+30s, -15s, cancelar, sacar del horno)

const CACHE = 'ct-v3';
const CACHE_URLS = ['./', './index.html', './manifest.json'];

const timers = {};          // groupId → setTimeout (alarma final)
const countdowns = {};      // groupId → setInterval (actualización de cuenta atrás)

// ── INSTALL ────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CACHE_URLS).catch(() => {})).then(() => self.skipWaiting()));
});

// ── ACTIVATE ───────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── HELPERS ────────────────────────────────────────────────────────
function fmtTime(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? m + ':' + s.toString().padStart(2, '0') : s + 's';
}

function clearGroup(id) {
  if (timers[id])    { clearTimeout(timers[id]);    delete timers[id]; }
  if (countdowns[id]){ clearInterval(countdowns[id]); delete countdowns[id]; }
}

async function msgClients(data) {
  const cls = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  cls.forEach(c => c.postMessage(data));
  return cls.length;
}

function notifActions(type) {
  if (type === 'countdown') return [
    { action: 'plus30',  title: '+30s' },
    { action: 'minus15', title: '−15s' },
    { action: 'dismiss', title: '✕ Cancelar' },
  ];
  if (type === 'alarm') return [
    { action: 'accept', title: '✓ Sacar del horno' },
    { action: 'snooze', title: '+2 min' },
  ];
  return [];
}

// ── SHOW COUNTDOWN NOTIFICATION (updates every 30s) ─────────────────
function showCountdown(groupId, groupNum, endTime, itemNames, isFirst) {
  const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  if (rem <= 0) return;
  const timeStr = fmtTime(rem);
  const body = (itemNames || []).join(', ');
  self.registration.showNotification(
    `⏱ Grupo #${groupNum}  —  ${timeStr} restantes`,
    {
      body,
      tag: 'ct-' + groupId,
      silent: !isFirst,
      requireInteraction: false,
      icon: '/CronoTerco/icons/icon-192.png',
      badge: '/CronoTerco/icons/icon-96.png',
      actions: notifActions('countdown'),
      data: { groupId, groupNum, endTime, itemNames, ntype: 'countdown' },
    }
  );
}

// ── SHOW ALARM NOTIFICATION ─────────────────────────────────────────
async function showAlarm(groupId, groupNum, itemNames) {
  // Close countdown notification first
  const existing = await self.registration.getNotifications({ tag: 'ct-' + groupId });
  existing.forEach(n => n.close());

  self.registration.showNotification(
    `🔥 ¡LISTO!  —  Grupo #${groupNum}`,
    {
      body: (itemNames || []).slice(0, 3).join(', ') + '\nSacar del horno',
      tag: 'alarm-' + groupId,
      requireInteraction: true,
      renotify: true,
      icon: '/CronoTerco/icons/icon-192.png',
      vibrate: [300, 100, 300, 100, 600, 100, 600],
      actions: notifActions('alarm'),
      data: { groupId, groupNum, itemNames, ntype: 'alarm' },
    }
  );
}

// ── SCHEDULE A GROUP ────────────────────────────────────────────────
function scheduleGroup({ groupId, groupNum, endTime, itemNames }) {
  clearGroup(groupId);
  const delay = endTime - Date.now();
  if (delay <= 0) { showAlarm(groupId, groupNum, itemNames); return; }

  // Show initial countdown notification
  showCountdown(groupId, groupNum, endTime, itemNames, true);

  // Update every 30 seconds
  countdowns[groupId] = setInterval(() => {
    const rem = Math.ceil((endTime - Date.now()) / 1000);
    if (rem <= 0) { clearInterval(countdowns[groupId]); delete countdowns[groupId]; return; }
    showCountdown(groupId, groupNum, endTime, itemNames, false);
  }, 30000);

  // Final alarm
  timers[groupId] = setTimeout(async () => {
    clearInterval(countdowns[groupId]); delete countdowns[groupId];
    await showAlarm(groupId, groupNum, itemNames);
    // Tell open pages to trigger in-app alarm
    await msgClients({ type: 'TIMER_DONE', groupId, groupNum });
  }, delay);
}

// ── MESSAGE HANDLER ─────────────────────────────────────────────────
self.addEventListener('message', e => {
  const d = e.data || {};
  switch (d.type) {
    case 'SCHEDULE':
      scheduleGroup(d);
      break;
    case 'CANCEL':
      clearGroup(d.groupId);
      self.registration.getNotifications({ tag: 'ct-' + d.groupId }).then(ns => ns.forEach(n => n.close()));
      self.registration.getNotifications({ tag: 'alarm-' + d.groupId }).then(ns => ns.forEach(n => n.close()));
      break;
    case 'DISMISS_ALL':
      Object.keys(timers).forEach(clearGroup);
      self.registration.getNotifications().then(ns => ns.forEach(n => n.close()));
      break;
    case 'ADJUST':
      clearGroup(d.groupId);
      scheduleGroup({ groupId: d.groupId, groupNum: d.groupNum, endTime: d.newEndTime, itemNames: d.itemNames });
      break;
  }
});

// ── NOTIFICATION ACTION HANDLER ─────────────────────────────────────
self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const action = e.action || '';
  const { groupId, groupNum, endTime, itemNames, ntype } = n.data || {};

  n.close();

  if (action === 'plus30') {
    const newEnd = (endTime || Date.now()) + 30000;
    clearGroup(groupId);
    scheduleGroup({ groupId, groupNum, endTime: newEnd, itemNames });
    e.waitUntil(msgClients({ type: 'ADJUST_TIME', groupId, delta: 30 }));
    return;
  }

  if (action === 'minus15') {
    const newEnd = Math.max(Date.now() + 5000, (endTime || Date.now()) - 15000);
    clearGroup(groupId);
    scheduleGroup({ groupId, groupNum, endTime: newEnd, itemNames });
    e.waitUntil(msgClients({ type: 'ADJUST_TIME', groupId, delta: -15 }));
    return;
  }

  if (action === 'dismiss') {
    clearGroup(groupId);
    e.waitUntil(msgClients({ type: 'CANCEL_GROUP', groupId }));
    return;
  }

  if (action === 'accept') {
    clearGroup(groupId);
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
        if (cls.length) { cls[0].focus(); cls[0].postMessage({ type: 'ACCEPT_GROUP', groupId }); }
        else clients.openWindow('./#accept=' + groupId);
      })
    );
    return;
  }

  if (action === 'snooze') {
    const newEnd = Date.now() + 120000;
    clearGroup(groupId);
    scheduleGroup({ groupId, groupNum, endTime: newEnd, itemNames });
    e.waitUntil(msgClients({ type: 'ADJUST_TIME', groupId, delta: 120 }));
    return;
  }

  // Default tap → open/focus app and signal alarm
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      if (cls.length) { cls[0].focus(); cls[0].postMessage({ type: 'ALARM_TAPPED', groupId }); return; }
      return clients.openWindow('./#alarm=' + groupId);
    })
  );
});
