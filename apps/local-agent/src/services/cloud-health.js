const DEFAULT_PROBE_MS = 10_000;
let lastOnline = true;
let lastCheckedAt = 0;

export async function probeCloudHealth(cloudHealthUrl, { timeoutMs = 3000 } = {}) {
  const now = Date.now();
  if (now - lastCheckedAt < DEFAULT_PROBE_MS) {
    return { online: lastOnline, cached: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(cloudHealthUrl, { signal: controller.signal });
    clearTimeout(timer);
    lastOnline = res.ok;
  } catch {
    lastOnline = false;
  }
  lastCheckedAt = now;
  return { online: lastOnline, cached: false };
}

export function setCloudOnline(online) {
  lastOnline = Boolean(online);
  lastCheckedAt = Date.now();
}

export function isCloudOnline() {
  return lastOnline;
}
