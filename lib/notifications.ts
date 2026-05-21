// Web Push subscription management.
// The pusher service is proxied by nginx at /push/ — same origin, no CORS.

const PUSH_BASE = "/push";

export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function isPushSupported(): Promise<boolean> {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushStatus(): Promise<"unsupported" | "denied" | "subscribed" | "unsubscribed"> {
  if (!(await isPushSupported())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function subscribeToPush(lang: "de" | "en" = "en"): Promise<boolean> {
  if (!(await isPushSupported())) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  // Fetch VAPID public key from pusher
  let publicKey: string;
  try {
    const res = await fetch(`${PUSH_BASE}/vapid-public-key`);
    if (!res.ok) return false;
    ({ publicKey } = await res.json() as { publicKey: string });
  } catch {
    return false;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
  });

  try {
    const res = await fetch(`${PUSH_BASE}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    return res.ok;
  } catch {
    await sub.unsubscribe();
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await fetch(`${PUSH_BASE}/subscribe`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});

  await sub.unsubscribe();
}
