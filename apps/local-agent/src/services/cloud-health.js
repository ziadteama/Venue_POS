import {
  CLOUD_HEALTH_FAILURES_TO_OFFLINE,
  CLOUD_HEALTH_PROBE_MS,
} from '@venue-pos/shared';

let lastOnline = true;
let lastCheckedAt = 0;
let consecutiveFailures = 0;

/** Prefer IPv4 loopback on Windows — localhost often resolves to ::1 while API listens on 127.0.0.1. */
export function normalizeLoopbackUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost') parsed.hostname = '127.0.0.1';
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function probeCloudHealth(
  cloudHealthUrl,
  { timeoutMs = 4000, force = false } = {},
) {
  const url = normalizeLoopbackUrl(cloudHealthUrl);
  const now = Date.now();
  if (!force && now - lastCheckedAt < CLOUD_HEALTH_PROBE_MS) {
    return { online: lastOnline, cached: true };
  }

  let probeOk = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    probeOk = res.ok;
  } catch {
    probeOk = false;
  }

  lastCheckedAt = now;
  if (probeOk) {
    consecutiveFailures = 0;
    lastOnline = true;
  } else {
    consecutiveFailures += 1;
    if (consecutiveFailures >= CLOUD_HEALTH_FAILURES_TO_OFFLINE) {
      lastOnline = false;
    }
  }

  return { online: lastOnline, cached: false };
}

export function setCloudOnline(online) {
  lastOnline = Boolean(online);
  lastCheckedAt = Date.now();
  consecutiveFailures = online ? 0 : CLOUD_HEALTH_FAILURES_TO_OFFLINE;
}

export function isCloudOnline() {
  return lastOnline;
}

export function resetCloudHealthForTests() {
  lastOnline = true;
  lastCheckedAt = 0;
  consecutiveFailures = 0;
}
