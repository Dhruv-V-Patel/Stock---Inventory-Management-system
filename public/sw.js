self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {

    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body: data.body,
        icon: data.icon || "/images/logo-192.png",
        badge: data.badge || "/images/icon-192.png",    // Change to your badge
        vibrate: [200, 100, 200],
        data: {
            url: data.url || "/"
        }
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title,
            options
        )
    );

});

self.addEventListener("notificationclick", (event) => {

    event.notification.close();

    event.waitUntil(

        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) {
                    client.navigate(event.notification.data.url);
                    return client.focus();
                }
            }
            return clients.openWindow(event.notification.data.url);
        })
    );
});