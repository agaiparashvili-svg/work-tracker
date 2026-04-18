// Firebase Cloud Messaging Service Worker
// ეს ფაილი GitHub repo ROOT-ში უნდა იყოს (index.html-ის გვერდით)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBiKjEDDug9McKWuLr6tLusSO5Kwf5m3RE",
  authDomain: "work-tracker-7aa42.firebaseapp.com",
  projectId: "work-tracker-7aa42",
  storageBucket: "work-tracker-7aa42.firebasestorage.app",
  messagingSenderId: "639886380518",
  appId: "1:639886380518:web:f8168469540549f9859a27"
});

const messaging = firebase.messaging();

// Background push notification handler
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '📨 შესრულებული სამუშაო', {
    body: body || '',
    icon: 'https://gaiparashvili-svg.github.io/work-tracker/icon-192.png',
    badge: 'https://gaiparashvili-svg.github.io/work-tracker/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'worktrack-push',
    renotify: true,
    requireInteraction: true,
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('work-tracker') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('https://gaiparashvili-svg.github.io/work-tracker/');
    })
  );
});
