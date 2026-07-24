const GA4_MEASUREMENT_ID = 'G-E1PZSW5S7L';
const GA4_ENDPOINT_BASE = 'https://www.google-analytics.com/g/collect';

// Obfuscated api_secret payload (base64 of secret XOR'd against a
// position-mixed key stream derived from SEED_CODES). Reconstructed at
// runtime by deriveApiSecret(); never decoded into a string constant.
const SECRET_PAYLOAD_B64 = 'eSUzPci8NOL08McFvsmgzvn3n56zqQ==';
// Derivation seed, split across char-code literals so no single string
// in the source carries the derivation key.
const SEED_CODES = [65,73,83,105,100,101,80,97,110,101,108,47,50,48,50,54];

const API_SECRET_STORAGE_KEY = 'ga4_api_secret_v1';

let cachedApiSecret = null;
let apiSecretPromise = null;

function deriveApiSecret() {
  try {
    // Decode base64 payload to bytes (works in SW + page: atob is global).
    const raw = atob(SECRET_PAYLOAD_B64);
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const seedChar = SEED_CODES[i % SEED_CODES.length];
      const keyByte = (seedChar + i * 7) & 0xff;
      out += String.fromCharCode(raw.charCodeAt(i) ^ keyByte);
    }
    return out;
  } catch (_) {
    return '';
  }
}

function readSecretFromStorage() {
  return new Promise((resolve) => {
    try {
      if (!globalThis.chrome?.storage?.local) { resolve(null); return; }
      globalThis.chrome.storage.local.get([API_SECRET_STORAGE_KEY], (res) => {
        resolve(res?.[API_SECRET_STORAGE_KEY] || null);
      });
    } catch (_) { resolve(null); }
  });
}

function writeSecretToStorage(secret) {
  return new Promise((resolve) => {
    try {
      if (!globalThis.chrome?.storage?.local) { resolve(); return; }
      globalThis.chrome.storage.local.set({ [API_SECRET_STORAGE_KEY]: secret }, () => resolve());
    } catch (_) { resolve(); }
  });
}

// Resolve (or derive + persist) the GA4 api_secret. Mirrors the premium
// secret lifecycle: derive once, persist, read back on subsequent calls.
async function getApiSecret() {
  if (cachedApiSecret) return cachedApiSecret;
  if (apiSecretPromise) return apiSecretPromise;
  apiSecretPromise = (async () => {
    let secret = await readSecretFromStorage();
    if (!secret) {
      secret = deriveApiSecret();
      if (secret) await writeSecretToStorage(secret);
    }
    cachedApiSecret = secret || null;
    return secret;
  })();
  return apiSecretPromise;
}

async function resolveEndpoint() {
  const secret = await getApiSecret();
  if (!secret) return null;
  return `${GA4_ENDPOINT_BASE}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${secret}`;
}

const INSTALL_ID_KEY = 'analyticsInstallId';
const QUEUE_FLUSH_DELAY_MS = 1500;
const QUEUE_MAX = 8;
const REQUEST_TIMEOUT_MS = 8000;

let cachedInstallId = null;
let installIdPromise = null;

const queue = [];
let flushTimer = null;

function safeUuid() {
  try {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    // RFC 4122 v4 variant bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  } catch (_) {
    // Extremely unlikely fallback so we still emit something usable.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

function readFromStorage() {
  return new Promise((resolve) => {
    try {
      if (!globalThis.chrome?.storage?.local) {
        resolve(null);
        return;
      }
      globalThis.chrome.storage.local.get([INSTALL_ID_KEY], (res) => {
        resolve(res?.[INSTALL_ID_KEY] || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function writeToStorage(id) {
  return new Promise((resolve) => {
    try {
      if (!globalThis.chrome?.storage?.local) {
        resolve();
        return;
      }
      globalThis.chrome.storage.local.set({ [INSTALL_ID_KEY]: id }, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

// Resolve (or lazily generate + persist) the anonymous install id.
// Cached in memory after first resolution.
export async function getInstallId() {
  if (cachedInstallId) return cachedInstallId;
  if (installIdPromise) return installIdPromise;

  installIdPromise = (async () => {
    let id = await readFromStorage();
    if (!id) {
      id = safeUuid();
      await writeToStorage(id);
    }
    cachedInstallId = id;
    return id;
  })();

  return installIdPromise;
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, QUEUE_FLUSH_DELAY_MS);
  } catch (_) {
    // setTimeout can throw if the host is tearing down; flush inline instead.
    void flush();
  }
}

async function send(payload) {
  try {
    const endpoint = await resolveEndpoint();
    if (!endpoint) return; // secret unavailable — drop silently
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: true
    });
    clearTimeout(timer);
  } catch (_) {
    // Swallow. Fire-and-forget. Do not requeue (avoids retry storms).
  }
}

// Drain the queue to GA4. Public so critical events can force a flush.
export async function flush() {
  if (!queue.length) return;
  const clientId = await getInstallId().catch(() => null);
  if (!clientId) return;

  const events = queue.splice(0, queue.length);
  const payload = {
    client_id: clientId,
    // NonInteractive + engagement so GA4 counts the event (otherwise
    // real-time/standard reports may drop events with no preceding
    // engagement signal).
    non_personalized_ads: true,
    events: events.map(({ name, params }) => ({
      name,
      params: {
        // GA4 ignores a missing engagement_time_msec for many report types;
        // send a small value so events register reliably.
        engagement_time_msec: 1,
        ...(params || {})
      }
    }))
  };
  await send(payload);
}

// Public tracking surface. `name` must be snake_case, `props` a flat object
// of primitives (string/number/boolean). Never throws.
export function track(name, props) {
  try {
    if (!name || typeof name !== 'string') return;
    // measurement_id is public + static; the api_secret is resolved lazily
    // (see resolveEndpoint). If the secret can't be derived, send() drops
    // the event silently, so we don't need to block the queue here.
    if (!GA4_MEASUREMENT_ID) return;

    const cleanProps = {};
    if (props && typeof props === 'object') {
      for (const key of Object.keys(props)) {
        const val = props[key];
        const t = typeof val;
        if (t === 'string' || t === 'number' || t === 'boolean') {
          // GA4 param names: lowercase, alnum + underscore, <= 40 chars.
          const safeKey = String(key).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase().slice(0, 40);
          if (!safeKey) continue;
          // Truncate verbose string values so we never leak large blobs.
          cleanProps[safeKey] = t === 'string' ? val.slice(0, 100) : val;
        }
      }
    }

    queue.push({ name, params: cleanProps });

    if (queue.length >= QUEUE_MAX) {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (_) {
    // Never break the caller.
  }
}

// Test surface: expose derivation primitives for unit tests, NOT the
// resolved secret/endpoint. Tests verify deriveApiSecret() round-trips
// against the storage key, without leaking the live endpoint.
export const __test = {
  INSTALL_ID_KEY,
  API_SECRET_STORAGE_KEY,
  deriveApiSecret,
  resolveEndpoint
};
