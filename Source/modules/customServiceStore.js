import { CUSTOM_SERVICE_STORAGE_KEY, DEFAULT_CUSTOM_SERVICE_SETTINGS, normalizeSettings } from './customServiceConfig.js';

async function read(area = 'sync') {
  try {
    const data = await chrome.storage[area].get(CUSTOM_SERVICE_STORAGE_KEY);
    return data[CUSTOM_SERVICE_STORAGE_KEY] || null;
  } catch (_) {
    return null;
  }
}

export async function readCustomServiceSettings() {
  const fromSync = await read('sync');
  if (fromSync) return normalizeSettings(fromSync);

  const fromLocal = await read('local');
  if (fromLocal) return normalizeSettings(fromLocal);

  return { ...DEFAULT_CUSTOM_SERVICE_SETTINGS };
}

export async function writeCustomServiceSettings(settings) {
  const normalized = normalizeSettings(settings);
  try {
    await chrome.storage.sync.set({ [CUSTOM_SERVICE_STORAGE_KEY]: normalized });
  } catch (_) {
    await chrome.storage.local.set({ [CUSTOM_SERVICE_STORAGE_KEY]: normalized });
  }
  return normalized;
}

export async function updateCustomServiceSettings(partial) {
  const current = await readCustomServiceSettings();
  return writeCustomServiceSettings({ ...current, ...(partial || {}) });
}
