export const CUSTOM_SERVICE_STORAGE_KEY = 'customServiceSettings';
export const MAX_CUSTOM_SERVICE_TEXT_LENGTH = 1800;

export const SERVICE_PRESETS = [
  { id: 'grok', label: 'Grok', baseUrl: 'https://grok.com/chat?reasoningMode=none&q=', buttonSelector: '[data-url*="grok.com"]' },
  { id: 'chatgpt', label: 'ChatGPT', baseUrl: 'https://chatgpt.com/?q=', buttonSelector: '[data-url*="chatgpt.com"]' },
  { id: 'gemini', label: 'Gemini', baseUrl: 'https://gemini.google.com/app?q=', buttonSelector: '[data-url*="gemini.google.com"]' },
  { id: 'claude', label: 'Claude', baseUrl: 'https://claude.ai/new?q=', buttonSelector: '[data-url*="claude.ai"]' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://www.perplexity.ai/search?q=', buttonSelector: '[data-url*="perplexity.ai"]' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://chat.mistral.ai/chat?q=', buttonSelector: '[data-url*="chat.mistral.ai/chat"]' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://chat.deepseek.com/?q=', buttonSelector: '[data-url*="chat.deepseek.com"]' },
  { id: 'copilot', label: 'Copilot', baseUrl: 'https://copilot.microsoft.com/?q=', buttonSelector: '[data-url*="copilot.microsoft.com"]' },
  { id: 'grok-deepsearch', label: 'Grok Deep Search', baseUrl: 'https://grok.com/chat?reasoningMode=deepsearch&q=', buttonSelector: '[data-url*="grok.com"]' },
  { id: 'grok-think', label: 'Grok Think', baseUrl: 'https://grok.com/chat?reasoningMode=think&q=', buttonSelector: '[data-url*="grok.com"]' },
  { id: 'custom', label: 'Custom URL', baseUrl: null, buttonSelector: null }
];

export const ACTION_PRESETS = [
  { id: 'explain', label: 'Explain', template: 'Explain clearly and concisely: {text}' },
  { id: 'summarize', label: 'Summarize', template: 'Summarize: {text}' },
  { id: 'rewrite', label: 'Rewrite', template: 'Rewrite for clarity and brevity: {text}' },
  { id: 'analyze', label: 'Analyze', template: 'Analyze and list key takeaways: {text}' }
];

export const DEFAULT_CUSTOM_SERVICE_SETTINGS = {
  enabled: false,
  defaultService: 'chatgpt',
  customBaseUrl: '',
  openInSidePanel: true,
  enabledServices: ['grok', 'chatgpt', 'gemini', 'claude', 'perplexity', 'mistral', 'deepseek', 'copilot'],
  enabledActions: ACTION_PRESETS.map((a) => a.id),
  customActions: [],
  actionTemplates: ACTION_PRESETS.reduce((acc, action) => {
    acc[action.id] = action.template;
    return acc;
  }, {})
};

export function normalizeSettings(raw = {}) {
  const normalized = {
    ...DEFAULT_CUSTOM_SERVICE_SETTINGS,
    ...(raw || {})
  };

  const serviceIds = new Set(SERVICE_PRESETS.map((s) => s.id));
  normalized.enabledServices = Array.from(
    new Set((normalized.enabledServices || []).filter((id) => serviceIds.has(id)))
  );
  if (!normalized.enabledServices.length) {
    normalized.enabledServices = [DEFAULT_CUSTOM_SERVICE_SETTINGS.defaultService];
  }

  const builtInActionIds = new Set(ACTION_PRESETS.map((a) => a.id));

  const customActions = Array.isArray(normalized.customActions) ? normalized.customActions : [];
  const sanitizedCustomActions = [];
  const seenCustomIds = new Set();
  for (const action of customActions) {
    const id = typeof action?.id === 'string' ? action.id.trim() : '';
    const label = typeof action?.label === 'string' ? action.label.trim() : '';
    if (!id || !label) continue;
    if (builtInActionIds.has(id)) continue;
    if (seenCustomIds.has(id)) continue;
    seenCustomIds.add(id);
    sanitizedCustomActions.push({ id, label });
  }
  normalized.customActions = sanitizedCustomActions.slice(0, 30);

  const actionIds = new Set([
    ...builtInActionIds,
    ...normalized.customActions.map((a) => a.id)
  ]);
  normalized.enabledActions = Array.from(
    new Set((normalized.enabledActions || []).filter((id) => actionIds.has(id)))
  );
  if (!normalized.enabledActions.length) {
    normalized.enabledActions = [ACTION_PRESETS[0].id];
  }

  normalized.defaultService = serviceIds.has(normalized.defaultService)
    ? normalized.defaultService
    : DEFAULT_CUSTOM_SERVICE_SETTINGS.defaultService;

  normalized.actionTemplates = {
    ...DEFAULT_CUSTOM_SERVICE_SETTINGS.actionTemplates,
    ...(normalized.actionTemplates || {})
  };

  normalized.openInSidePanel = normalized.openInSidePanel !== false;

  // Harden templates: keep non-empty and always include {text}
  const templateFallbackFor = (actionId) => {
    const preset = ACTION_PRESETS.find((a) => a.id === actionId);
    if (preset?.template) return preset.template;
    const custom = normalized.customActions.find((a) => a.id === actionId);
    if (custom?.label) return `${custom.label}: {text}`;
    return '{text}';
  };

  for (const actionId of actionIds) {
    const fallback = templateFallbackFor(actionId);
    let template = normalized.actionTemplates[actionId];
    if (typeof template !== 'string' || !template.trim()) {
      template = fallback;
    }
    template = template.trim();
    if (!template.includes('{text}')) {
      template = `${template} {text}`.trim();
    }
    normalized.actionTemplates[actionId] = template;
  }

  // If Custom URL base is empty/invalid, drop it from enabled services and default
  const customBaseUrl = typeof normalized.customBaseUrl === 'string' ? normalized.customBaseUrl.trim() : '';
  normalized.customBaseUrl = customBaseUrl;
  const isCustomBaseValid = customBaseUrl && /^https?:\/\//i.test(customBaseUrl);
  if (!isCustomBaseValid) {
    normalized.enabledServices = normalized.enabledServices.filter((id) => id !== 'custom');
    if (normalized.defaultService === 'custom') {
      normalized.defaultService = DEFAULT_CUSTOM_SERVICE_SETTINGS.defaultService;
    }
  }

  return normalized;
}

export function getServiceById(id, customBaseUrl) {
  const service = SERVICE_PRESETS.find((s) => s.id === id) || SERVICE_PRESETS[0];
  const baseUrl = service.baseUrl || customBaseUrl || '';
  return { ...service, baseUrl };
}

export function getAllActions(settings) {
  const safe = normalizeSettings(settings);
  return [
    ...ACTION_PRESETS.map((a) => ({ ...a, isCustom: false })),
    ...(safe.customActions || []).map((a) => ({ id: a.id, label: a.label, template: safe.actionTemplates?.[a.id], isCustom: true }))
  ];
}

export function getActionById(id, settings) {
  const safe = normalizeSettings(settings);
  const preset = ACTION_PRESETS.find((a) => a.id === id);
  if (preset) return { ...preset, isCustom: false };
  const custom = (safe.customActions || []).find((a) => a.id === id);
  if (custom) return { id: custom.id, label: custom.label, template: safe.actionTemplates?.[custom.id], isCustom: true };
  return { ...ACTION_PRESETS[0], isCustom: false };
}

export function truncateSelection(text = '', limit = MAX_CUSTOM_SERVICE_TEXT_LENGTH) {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3)}...`;
}

export function buildPrompt(actionId, text, settings) {
  const safeSettings = normalizeSettings(settings);
  const action = getActionById(actionId, safeSettings);
  const templates = safeSettings?.actionTemplates || DEFAULT_CUSTOM_SERVICE_SETTINGS.actionTemplates;
  const template = templates[actionId] || action.template || '{text}';

  if (template.includes('{text}')) {
    return template.replace('{text}', text);
  }
  return `${template} ${text}`;
}

export function buildServiceUrl({ serviceId, actionId, rawText, settings }) {
  const safeSettings = normalizeSettings(settings);
  const service = getServiceById(serviceId, safeSettings.customBaseUrl);
  const action = getActionById(actionId, safeSettings);
  const isServiceValid = typeof service.baseUrl === 'string' && service.baseUrl.trim() && /^https?:\/\//i.test(service.baseUrl);
  if (!isServiceValid) {
    return { url: null, prompt: null, service, action, truncatedInput: truncateSelection(rawText) };
  }
  const truncatedText = truncateSelection(rawText);
  const prompt = buildPrompt(actionId, truncatedText, safeSettings);
  const encoded = encodeURIComponent(prompt);

  return {
    url: `${service.baseUrl}${encoded}`,
    prompt,
    service,
    action,
    truncatedInput: truncatedText
  };
}
