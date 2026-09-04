// CronoTerco Service Worker v4.0
// Notificación única al terminar el temporizador, solo si la app está en
// segundo plano (si está en primer plano, ya se ve/oye la alarma en la app).

const CACHE = 'ct-v4';
const CACHE_URLS = ['./', './index.html', './manifest.json'];

const timers = {};          // groupId → setTimeout (alarma final)

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
function clearGroup(id) {
  if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
}

async function getWindowClients() {
  return clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function msgClients(data) {
  const cls = await getWindowClients();
  cls.forEach(c => c.postMessage(data));
  return cls.length;
}

// True if the app is open AND visible (foreground) in at least one tab/window.
// If so, the page itself already shows/plays the alarm — no OS notification needed.
async function isAppInForeground() {
  const cls = await getWindowClients();
  return cls.some(c => c.visibilityState === 'visible' && c.focused !== false);
}

function notifActions(type) {
  if (type === 'alarm') return [
    { action: 'accept', title: '✓ Sacar del horno' },
    { action: 'snooze', title: '+2 min' },
  ];
  return [];
}

// ── SHOW ALARM NOTIFICATION ─────────────────────────────────────────
async function showAlarm(groupId, groupNum, itemNames) {
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
// No hay notificación de cuenta atrás (la Notification API no permite un
// contador en vivo dentro de la propia notificación, como sí hace el
// temporizador nativo del sistema). En su lugar: al terminar, si la app
// está en primer plano no hace falta avisar (ya se ve y se oye ahí mismo);
// si está en segundo plano (o cerrada), se muestra una notificación única.
function scheduleGroup({ groupId, groupNum, endTime, itemNames }) {
  clearGroup(groupId);
  const delay = endTime - Date.now();

  const fire = async () => {
    delete timers[groupId];
    const foreground = await isAppInForeground();
    if (!foreground) {
      await showAlarm(groupId, groupNum, itemNames);
    }
    // Tell open pages (foreground or backgrounded) to trigger in-app alarm
    await msgClients({ type: 'TIMER_DONE', groupId, groupNum });
  };

  if (delay <= 0) { fire(); return; }
  timers[groupId] = setTimeout(fire, delay);
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
