const TECHNICAL_PREFIXES = ['API /api/', 'LAN /', 'Coordinator ', 'Menu sync failed', 'fetch failed'];

function unescapeJsonString(value) {
  return String(value).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractNestedMessages(text) {
  return [...String(text).matchAll(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map((m) =>
    unescapeJsonString(m[1]),
  );
}

export function isTechnicalErrorMessage(message) {
  if (message == null) return true;
  const text = String(message).trim();
  if (!text) return true;
  if (text.startsWith('{') && text.includes('"statusCode"')) return true;
  if (text.startsWith('[') && text.includes('"code"')) return true;
  if (TECHNICAL_PREFIXES.some((prefix) => text.startsWith(prefix))) return true;
  if (/^failed \(\d+\)/i.test(text)) return true;
  if (/prisma/i.test(text)) return true;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) return true;
  if (/internal server error/i.test(text) && text.length < 40) return false;
  if (/^(GET|POST|PATCH|DELETE|PUT)\s+\//i.test(text)) return true;
  return false;
}

function pickFriendlyMessage(candidates, fallback) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const text = String(candidate).trim();
    if (!text || isTechnicalErrorMessage(text)) continue;
    return text;
  }
  return fallback;
}

/**
 * Turn agent/API/JSON error blobs into a short user-facing string.
 */
export function parseApiError(raw, fallback = 'Something went wrong. Please try again.') {
  if (raw == null || raw === '') return fallback;

  if (typeof raw === 'object') {
    return pickFriendlyMessage(
      [raw.error?.message, raw.message, raw.error?.code, raw.code],
      fallback,
    );
  }

  const text = String(raw);

  const pinMsg = text.match(/Invalid (?:venue |floor )?manager PIN[^"\\]*/i)?.[0];
  if (pinMsg) return pinMsg;

  const nested = extractNestedMessages(text);
  const nestedFriendly = nested.find((m) => m && !isTechnicalErrorMessage(m));
  if (nestedFriendly) return nestedFriendly;

  try {
    const json = JSON.parse(text);
    const fromJson = pickFriendlyMessage([json.error?.message, json.message], fallback);
    if (fromJson !== fallback) return fromJson;
  } catch {
    // not JSON
  }

  const wrapped = text.match(/failed \(\d+\):\s*(\{[\s\S]+\})\s*$/)?.[1];
  if (wrapped) {
    try {
      const inner = JSON.parse(wrapped);
      const fromInner = pickFriendlyMessage([inner.error?.message, inner.message], fallback);
      if (fromInner !== fallback) return fromInner;
    } catch {
      // ignore
    }
  }

  if (!isTechnicalErrorMessage(text)) {
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }

  return fallback;
}
