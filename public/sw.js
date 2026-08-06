/*
 * Service worker for Web Push.
 *
 * iOS requires a registered service worker before it will deliver push to an
 * installed PWA, and it requires that every push RENDER a visible notification.
 * A push handler that stays silent risks having push permission revoked
 * entirely, so showNotification() is called unconditionally — even when the
 * payload fails to parse.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = { title: "Family Payroll", body: "Something needs your attention." };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Fall through to the default — silence is not an option on iOS.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "family-payroll",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
