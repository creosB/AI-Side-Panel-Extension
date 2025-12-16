import { STORAGE_KEY_PREFIX, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS, isValidEmail, isValidCode, toSortedObject } from './modules/premiumShared.js';
import { CUSTOM_SERVICE_STORAGE_KEY, SERVICE_PRESETS, buildServiceUrl, getAllActions, normalizeSettings } from './modules/customServiceConfig.js';
import { readCustomServiceSettings } from './modules/customServiceStore.js';

const CONTEXT_MENU_ROOT_ID = 'ai-side-panel-custom-service';
let contextMenuRebuildInFlight = null;
let pendingContextMenuRebuild = false;
let cachedCustomServiceSettings = normalizeSettings();

function contextMenusRemoveAll() {
  return new Promise((resolve) => {
    try {
      chrome.contextMenus.removeAll(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

function contextMenusCreate(createProperties) {
  return new Promise((resolve) => {
    try {
      chrome.contextMenus.create(createProperties, () => {
        resolve(!chrome.runtime.lastError);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

function initiate () {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
    chrome.runtime.onInstalled.addListener(function () {
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
            addRules: [{
                    id: 1,
                    priority: 1,
                    action: {
                        type: "modifyHeaders",
                        responseHeaders: [
                            {
                                header: "content-security-policy",
                                operation: "remove"
                            },
                            {
                                header: "x-frame-options",
                                operation: "remove"
                            },
                            {
                                header: "frame-options",
                                operation: "remove"
                            },
                            {
                                header: "frame-ancestors",
                                operation: "remove"
                            },
                            {
                                header:"X-Content-Type-Options",
                                operation: "remove"
                            },
                            {
                                header: "access-control-allow-origin",
                                operation: "set",
                                value: "*"
                            }
                        ]
                    },
                    condition: {
                        resourceTypes: [
                            "main_frame",
                            "sub_frame"
                        ]
                    }
                }]
        });
    });
    primeCustomServiceSettings().then(() => rebuildCustomContextMenus());
};

initiate();

chrome.runtime.onStartup?.addListener(() => {
  primeCustomServiceSettings().then(() => rebuildCustomContextMenus());
});

async function primeCustomServiceSettings() {
  try {
    cachedCustomServiceSettings = normalizeSettings(await readCustomServiceSettings());
  } catch (_) {
    cachedCustomServiceSettings = normalizeSettings();
  }
  return cachedCustomServiceSettings;
}

async function rebuildCustomContextMenus() {
  if (contextMenuRebuildInFlight) {
    pendingContextMenuRebuild = true;
    return contextMenuRebuildInFlight;
  }

  contextMenuRebuildInFlight = (async () => {
    try {
      await contextMenusRemoveAll();
    } catch (_) {
      // ignore
    }

    if (!cachedCustomServiceSettings) {
      await primeCustomServiceSettings();
    }
    const normalized = normalizeSettings(cachedCustomServiceSettings);
    if (!normalized.enabled) return;

    const services = SERVICE_PRESETS
      .filter((s) => normalized.enabledServices.includes(s.id))
      .filter((s) => (s.id !== 'custom' ? true : !!normalized.customBaseUrl))
      .sort((a, b) => {
        if (a.id === normalized.defaultService) return -1;
        if (b.id === normalized.defaultService) return 1;
        return a.label.localeCompare(b.label);
      });
    const actions = getAllActions(normalized).filter((a) => normalized.enabledActions.includes(a.id));

    if (!services.length || !actions.length) return;

    try {
      const rootOk = await contextMenusCreate({
        id: CONTEXT_MENU_ROOT_ID,
        title: 'AI Side Panel',
        contexts: ['selection']
      });
      if (!rootOk) return;

      for (const service of services) {
        const serviceId = `${CONTEXT_MENU_ROOT_ID}/${service.id}`;
        const serviceOk = await contextMenusCreate({
          id: serviceId,
          parentId: CONTEXT_MENU_ROOT_ID,
          title: service.label,
          contexts: ['selection']
        });
        if (!serviceOk) continue;

        for (const action of actions) {
          await contextMenusCreate({
            id: `${serviceId}/${action.id}`,
            parentId: serviceId,
            title: action.label,
            contexts: ['selection']
          });
        }
      }
    } catch (err) {
      console.warn('Failed to build context menus', err);
    }
  })();

  await contextMenuRebuildInFlight;
  contextMenuRebuildInFlight = null;

  if (pendingContextMenuRebuild) {
    pendingContextMenuRebuild = false;
    return rebuildCustomContextMenus();
  }
}

function openSidePanelForTab(tab) {
  const tabId = tab?.id;
  if (!tabId) return Promise.resolve(false);
  try {
    if (chrome.sidePanel?.open) {
      return chrome.sidePanel.open({ tabId }).then(() => true).catch((error) => {
        console.error('Failed to open side panel', error);
        return false;
      });
    }
    if (chrome.sidePanel?.setOptions) {
      return chrome.sidePanel
        .setOptions({ tabId, path: 'sidepanel.html', enabled: true })
        .then(() => (chrome.sidePanel?.open ? chrome.sidePanel.open({ tabId }) : Promise.reject(new Error('sidePanel.open unavailable'))))
        .then(() => true)
        .catch((error) => {
          console.error('Failed to open side panel', error);
          return false;
        });
    }
  } catch (error) {
    console.error('Failed to open side panel', error);
  }
  return Promise.resolve(false);
}

function sendCustomServiceToPanel(payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_CUSTOM_SERVICE', payload }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(!!resp);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === 'sync' || areaName === 'local') {
    if (changes[CUSTOM_SERVICE_STORAGE_KEY]) {
      const newVal = changes[CUSTOM_SERVICE_STORAGE_KEY].newValue;
      cachedCustomServiceSettings = normalizeSettings(newVal || cachedCustomServiceSettings);
      rebuildCustomContextMenus();
    }
  }
});

chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (typeof info.menuItemId !== 'string') return;
  if (!info.menuItemId.startsWith(CONTEXT_MENU_ROOT_ID)) return;

  const parts = info.menuItemId.split('/');
  if (parts.length < 3) return; // require Service + Action selection
  const serviceId = parts[1];
  const actionId = parts[2];

  const normalized = normalizeSettings(cachedCustomServiceSettings);

  const resolvedService = serviceId || normalized.defaultService;
  const resolvedAction = actionId || normalized.enabledActions[0];
  const selectedText = (info.selectionText || '').trim();

  if (!selectedText) {
    return;
  }

  const { url, prompt } = buildServiceUrl({
    serviceId: resolvedService,
    actionId: resolvedAction,
    rawText: selectedText,
    settings: normalized
  });
  if (!url) return;

  // Respect user preference: side panel vs new tab
  const payload = {
    url,
    serviceId: resolvedService,
    actionId: resolvedAction,
    prompt
  };

  if (normalized.openInSidePanel !== false) {
    const openPromise = openSidePanelForTab(tab);
    sendCustomServiceToPanel(payload).then((delivered) => {
      if (!delivered) {
        try {
          chrome.storage.local.set({ pendingCustomService: payload });
        } catch (_) {}
      }
    });
    openPromise.then((opened) => {
      if (!opened && url) {
        try {
          chrome.tabs.create({ url });
        } catch (_) {}
      }
    });
  } else if (url) {
    try {
      chrome.tabs.create({ url });
    } catch (_) {}
  }
});

// --- Premium: Connected ports and broadcast support ---
// Note: Keep HMAC secret in background only. Generate once and persist.
const PREMIUM_SECRET_STORAGE_KEY = 'premium_hmac_secret_v1';

async function getPremiumSecret() {
  const data = await chrome.storage.local.get(PREMIUM_SECRET_STORAGE_KEY);
  let secret = data[PREMIUM_SECRET_STORAGE_KEY];
  if (!secret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await chrome.storage.local.set({ [PREMIUM_SECRET_STORAGE_KEY]: secret });
  }
  return secret;
}

// HMAC helper (SHA-256)
const textEncoder = new TextEncoder();
async function premiumHmacSign(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const premiumPorts = [];

try {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'premium-status') {
      premiumPorts.push(port);
      port.onDisconnect.addListener(() => {
        const idx = premiumPorts.indexOf(port);
        if (idx > -1) premiumPorts.splice(idx, 1);
      });
    }
  });
} catch (_) {}

function broadcastPremiumUpdate() {
  premiumPorts.forEach((p) => {
    try { p.postMessage({ type: 'PREMIUM_STATUS_UPDATED' }); } catch {}
  });
}

async function handlePremiumCheck({ email, code }) {
  if (!email || !code) return { success: false, isPremium: false, error: 'Missing email or code' };
  if (!isValidEmail(email)) return { success: false, isPremium: false, error: 'Invalid email' };
  if (!isValidCode(code)) return { success: false, isPremium: false, error: 'Invalid license key format' };

  // Storage-based rate limit attempts
  const key = `${STORAGE_KEY_PREFIX}${email}`;
  const storedData = await chrome.storage.local.get(key);
  const existing = storedData[key] || {};
  const attempts = Array.isArray(existing.attempts) ? existing.attempts : [];

  const now = Date.now();
  const recent = attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    return { success: false, isPremium: false, error: 'Too many attempts' };
  }

  try {
    const resp = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ license_key: code })
    });

    if (!resp.ok) {
      return { success: false, isPremium: false, error: 'Network error' };
    }
    const data = await resp.json();
    if (!data || typeof data.valid !== 'boolean') {
      return { success: false, isPremium: false, error: 'Unexpected API response' };
    }

    if (!data.valid) {
      // Save attempt (sign stored data)
      const baseData = { ...existing, isPremium: false, email, lastChecked: now, checkPeriodDays: existing.checkPeriodDays || 7, attempts: [...recent, now] };
      const sortedData = toSortedObject(baseData);
      const secret = await getPremiumSecret();
      const signature = await premiumHmacSign(secret, JSON.stringify(sortedData));
      await chrome.storage.local.set({ [key]: { ...sortedData, signature } });
      broadcastPremiumUpdate();
      return { success: true, isPremium: false };
    }

    if (data.meta && data.meta.customer_email && data.meta.customer_email.toLowerCase() !== email.toLowerCase()) {
      // Do not persist if mismatch
      return { success: false, isPremium: false, error: 'Email and license key mismatch' };
    }

    let checkPeriodDays = 7;
    if (data.license_key && data.license_key.expires_at) {
      const exp = Date.parse(data.license_key.expires_at);
      if (!isNaN(exp) && exp > now) {
        checkPeriodDays = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
      }
    }

  const baseData = { isPremium: true, email, lastChecked: now, checkPeriodDays, attempts: [...recent, now] };
  const sortedData = toSortedObject(baseData);
  const secret = await getPremiumSecret();
  const signature = await premiumHmacSign(secret, JSON.stringify(sortedData));
    await chrome.storage.local.set({ [key]: { ...sortedData, signature } });
    broadcastPremiumUpdate();
    return { success: true, isPremium: true, checkPeriodDays };
  } catch (e) {
    return { success: false, isPremium: false, error: 'Failed to check premium status' };
  }
}

async function handlePremiumGet() {
  const all = await chrome.storage.local.get(null);
  for (const k in all) {
  if (k.startsWith(STORAGE_KEY_PREFIX)) {
      const stored = all[k];
      if (stored && stored.signature) {
        const { signature, ...toVerify } = stored;
    const sorted = toSortedObject(toVerify);
  const secret = await getPremiumSecret();
  const expected = await premiumHmacSign(secret, JSON.stringify(sorted));
        if (expected === signature) {
          return { success: true, isPremium: !!stored.isPremium };
        } else {
          // Clear tampered data
          await chrome.storage.local.remove(k);
          return { success: false, error: 'Data integrity check failed' };
        }
      } else if (stored) {
        // No signature: treat as invalid and clear
        await chrome.storage.local.remove(k);
        return { success: false, error: 'Data integrity check failed' };
      }
    }
  }
  return { success: true, isPremium: undefined };
}

function handlePremiumClear(email) {
  const key = `${STORAGE_KEY_PREFIX}${email}`;
  chrome.storage.local.get(key, (data) => {
    if (data[key]) {
      const upd = { ...data[key], attempts: [] };
      chrome.storage.local.set({ [key]: upd });
    }
  });
}

// Premium message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return; 
  if (message.type === 'CHECK_PREMIUM_STATUS') {
    handlePremiumCheck(message.payload || {}).then(sendResponse);
    return true; // async
  }
  if (message.type === 'GET_PREMIUM_STATUS') {
    handlePremiumGet().then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_ATTEMPTS') {
    handlePremiumClear(message.payload?.email);
    sendResponse({ success: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'REFRESH_CUSTOM_SERVICE_MENUS') {
    rebuildCustomContextMenus();
    sendResponse?.({ ok: true });
  }
  if (message?.type === 'CUSTOM_SERVICE_FALLBACK_TAB' && message.payload?.url) {
    try {
      chrome.tabs.create({ url: message.payload.url });
    } catch (_) {}
    sendResponse?.({ ok: true });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateShortcut') {
    chrome.commands.update({
      name: '_execute_action',
      shortcut: request.shortcut
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getShortcut') {
    chrome.commands.getAll((commands) => {
      const command = commands.find(cmd => cmd.name === '_execute_action');
      sendResponse({ shortcut: command ? command.shortcut : 'Alt+Q' });
    });
    return true;
  }
});

// Global keyboard command handling: route to side panel
try {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'next_ai_model' || command === 'previous_ai_model') {
      // Broadcast to any side panel instance; sidepanel listens and acts
      chrome.runtime.sendMessage({ type: 'AI_MODEL_SWITCH', direction: command === 'next_ai_model' ? 'next' : 'prev' });
    } else if (command === 'toggle_neural_nav') {
      // Send to active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_NEURAL_NAV' });
        }
      });
    }
  });
} catch (_) {}
