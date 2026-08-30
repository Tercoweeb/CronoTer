// CronoTerco Service Worker v2.0
// Maneja notificaciones programadas aunque la app esté en background

const CACHE = 'ct-v2';
const URLS = ['./', './index.html', './manifest.json'];
let scheduledTimers = {};  // groupId → setTimeout handle

// ── INSTALL ────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS).catch(()=>{})).then(() => self.skipWaiting()));
});

// ── ACTIVATE ───────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH (offline support) ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── MESSAGES from page ─────────────────────────────────────────────
self.addEventListener('message', e => {
  const { type, groupId, groupNum, endTime, itemNames } = e.data || {};

  if (type === 'SCHEDULE') {
    // Clear previous timer for this group
    if (scheduledTimers[groupId]) {
      clearTimeout(scheduledTimers[groupId]);
      delete scheduledTimers[groupId];
    }
    const delay = endTime - Date.now();
    if (delay <= 0) {
      showAlarmNotif(groupId, groupNum, itemNames);
    } else {
      scheduledTimers[groupId] = setTimeout(() => {
        showAlarmNotif(groupId, groupNum, itemNames);
        delete scheduledTimers[groupId];
      }, delay);
    }
  }

  if (type === 'CANCEL') {
    if (scheduledTimers[groupId]) {
      clearTimeout(scheduledTimers[groupId]);
      delete scheduledTimers[groupId];
    }
  }

  if (type === 'DISMISS_ALL') {
    Object.values(scheduledTimers).forEach(clearTimeout);
    scheduledTimers = {};
    self.registration.getNotifications().then(ns => ns.forEach(n => n.close()));
  }
});

function showAlarmNotif(groupId, groupNum, items) {
  const body = (items || []).slice(0,3).join(', ') || 'Sacar del horno';
  self.registration.showNotification('🔥 ¡HORNO LISTO! — Grupo #' + groupNum, {
    body,
    tag: 'alarm-' + groupId,
    requireInteraction: true,
    renotify: true,
    vibrate: [300, 100, 300, 100, 600],
    actions: [
      { action: 'ok', title: '✓ Sacar' },
      { action: 'snooze', title: '+2 min' },
    ],
    data: { groupId, groupNum },
  });
}

// ── NOTIFICATION CLICK ─────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { groupId, groupNum } = e.notification.data || {};

  if (e.action === 'snooze') {
    // Re-schedule +2 min
    showAlarmNotif(groupId, groupNum, []);
    setTimeout(() => showAlarmNotif(groupId, groupNum, []), 120000);
    return;
  }

  // Open/focus app
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      for (const c of cls) {
        if ('focus' in c) { c.focus(); c.postMessage({ type: 'ALARM_TAPPED', groupId }); return; }
      }
      return clients.openWindow('./');
    })
  );
});

// ── PERIODIC BACKGROUND SYNC (Chrome Android) ──────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-timers') {
    e.waitUntil(checkStoredTimers());
  }
});

async function checkStoredTimers() {
  // Read from localStorage via client or IDB (simplified: fire notifications for overdue timers)
  const cls = await clients.matchAll();
  cls.forEach(c => c.postMessage({ type: 'SYNC_CHECK' }));
}
