const token = localStorage.getItem("accessToken");

const getPublicKey = async () => {
  const response = await fetch("/api/push/public-key");
  const data = await response.json();
  return data.publicKey;
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const registerPush = async () => {
  if (!("serviceWorker" in navigator)) return;

  if (!("PushManager" in window)) return;

  const permission = await Notification.requestPermission();

  if (permission !== "granted") return;

  const PUBLIC_KEY = await getPublicKey();

  // Register SW
  await navigator.serviceWorker.register("/sw.js");

  // Wait until the service worker is ACTIVE
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
    });
  }

  const browser = navigator.userAgent;

  const device = /Android|iPhone|iPad/i.test(browser) ? "Mobile" : "Desktop";

  await fetch("/api/push/subscribe", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      Authorization: `Bearer ${token}`,
    },

    body: JSON.stringify({
      endpoint: subscription.endpoint,

      keys: {
        p256dh: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh"))),
        ),

        auth: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey("auth"))),
        ),
      },

      browser,

      device,
    }),
  });

  // console.log("Push Registered");
};

registerPush();
