import { ACTION_PRESETS, SERVICE_PRESETS, getAllActions, normalizeSettings } from './customServiceConfig.js';
import { readCustomServiceSettings, updateCustomServiceSettings } from './customServiceStore.js';

// Settings Module
export class SettingsManager {
  constructor() {
    this.init();
  }

  init() {
    this.initializeShortcutSettings();
    this.initializeLanguageSettings();
    this.initializeToggleHandlers();
    this.initializeThemeSettings();
    this.initializeRememberLastModelSetting();
    this.initializeCustomServiceSettings();
  }

  initializeShortcutSettings() {
    const manageAllBtn = document.getElementById('manage-shortcuts-all');
    const nextInput = document.getElementById('shortcut-next-input');
    const prevInput = document.getElementById('shortcut-prev-input');

    if (!manageAllBtn) {
      console.error('Manage shortcuts button not found');
      return;
    }

    const openShortcutsPage = () => {
      // Create a notification to guide users
      const notification = document.createElement('div');
      notification.className = 'notification';
      notification.textContent = 'Find "AI Side Panel" to change shortcuts.';
      document.body.appendChild(notification);

      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.remove();
      }, 3000);

      // Open Chrome's keyboard shortcuts page
      // Detect Chromium-based browser for proper URL; fallback to Chrome
      let url = 'chrome://extensions/shortcuts';
      try {
        // Edge uses edge://extensions/shortcuts
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('edg/')) url = 'edge://extensions/shortcuts';
      } catch { }
      chrome.tabs.create({ url });
    };

    manageAllBtn?.addEventListener('click', openShortcutsPage);    // Get current shortcut from commands API
    chrome.commands.getAll((commands) => {
      const get = (name) => commands.find((c) => c.name === name);
      const openCmd = get('_execute_action');
      const nextCmd = get('next_ai_model');
      const prevCmd = get('previous_ai_model');
      const neuralNavCmd = get('toggle_neural_nav');
      const openInput = document.getElementById('shortcut-input');
      if (openCmd?.shortcut && openInput) openInput.value = openCmd.shortcut;
      if (nextInput) nextInput.value = nextCmd?.shortcut || this._t?.('notSet') || 'Not set';
      if (prevInput) prevInput.value = prevCmd?.shortcut || this._t?.('notSet') || 'Not set';
      const neuralNavInput = document.getElementById('shortcut-neural-nav-input');
      if (neuralNavInput) neuralNavInput.value = neuralNavCmd?.shortcut || 'Ctrl+.';
    });
  }

  initializeLanguageSettings() {
    // Update language when user changes the selection
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', () => {
        const selectedLanguage = languageSelect.value;
        localStorage.setItem('selectedLanguage', selectedLanguage);
        this.setLanguage();
      });
    }
  }

  initializeThemeSettings() {
    const themeSelect = document.getElementById('theme-select');
    // Support both new and legacy ids for the theme section container
    const themeSection = document.getElementById('theme-settings-section') || document.getElementById('theme-section');
    const root = document.documentElement; // :root

    // Apply stored theme on load
    const storedTheme = localStorage.getItem('selectedTheme') || 'default';
    this.applyTheme(root, storedTheme);
    if (themeSelect) themeSelect.value = storedTheme;

    // Initialize Synthwave dim toggle visibility and state
    this.updateSynthwaveOptionsVisibility(storedTheme);
    this.initializeSynthwaveDim(root);

    if (themeSelect) {
      // Gate by premium: disable until premium is active
      const applyPremiumGate = (isPremium) => {
        themeSelect.disabled = !isPremium;
        themeSection?.classList.toggle('gated', !isPremium);

        // When gated, clicking anywhere in the theme section (except enabled elements) opens the premium modal
        const openPremium = (ev) => {
          // Avoid double-firing from select change handler; only trigger for clicks/key on the container
          if (ev) ev.preventDefault();
          if (window.premiumManager?.open) window.premiumManager.open();
        };

        // Clean previous listeners to avoid duplicates
        if (this._themeGateCleanup) {
          this._themeGateCleanup();
          this._themeGateCleanup = null;
        }

        if (!isPremium && themeSection) {
          // Pointer interactions
          const clickHandler = (e) => {
            // If the select is disabled, any click within the section should open the modal
            // But ignore clicks on interactive elements that aren't the select wrapper
            openPremium(e);
          };
          themeSection.addEventListener('click', clickHandler);

          // Keyboard accessibility: Enter/Space when focusing the section
          themeSection.setAttribute('tabindex', '0');
          const keyHandler = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              openPremium(e);
            }
          };
          themeSection.addEventListener('keydown', keyHandler);

          // Store cleanup
          this._themeGateCleanup = () => {
            themeSection.removeEventListener('click', clickHandler);
            themeSection.removeEventListener('keydown', keyHandler);
            themeSection.removeAttribute('tabindex');
          };
        }
      };

      // Initial state from background (if available)
      try {
        chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' }, (bg) => {
          applyPremiumGate(bg?.isPremium === true);
        });
      } catch (_) { }

      // React to runtime port updates (if PremiumManager connected)
      try {
        if (!this._premiumPort) {
          this._premiumPort = chrome.runtime.connect({ name: 'premium-status' });
          this._premiumPort.onMessage.addListener((msg) => {
            if (msg?.type === 'PREMIUM_STATUS_UPDATED') {
              applyPremiumGate(msg?.isPremium === true);
            }
          });
        }
      } catch (_) { }

      themeSelect.addEventListener('change', () => {
        if (themeSelect.disabled) {
          // Optional: nudge user to premium modal
          if (window.premiumManager?.open) window.premiumManager.open();
          return;
        }
        const value = themeSelect.value;
        localStorage.setItem('selectedTheme', value);
        this.applyTheme(root, value);
        this.updateSynthwaveOptionsVisibility(value);
      });
    }
  }

  applyTheme(root, theme) {
    if (!root) return;
    if (theme === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  initializeSynthwaveDim(root) {
    const dimToggle = document.getElementById('toggle-synthwave-dim');
    if (!dimToggle) return;
    const stored = localStorage.getItem('synthwaveDim') === 'true';
    dimToggle.checked = stored;
    this.applySynthwaveDim(root, stored);

    dimToggle.addEventListener('change', () => {
      const enabled = dimToggle.checked;
      localStorage.setItem('synthwaveDim', String(enabled));
      this.applySynthwaveDim(root, enabled);
    });
  }

  applySynthwaveDim(root, enabled) {
    if (!root) return;
    if (enabled) {
      root.setAttribute('data-synthwave-dim', 'true');
    } else {
      root.removeAttribute('data-synthwave-dim');
    }
  }

  updateSynthwaveOptionsVisibility(theme) {
    const container = document.getElementById('synthwave-dim-container');
    if (!container) return;
    container.style.display = theme === 'synthwave' ? '' : 'none';
  }

  setLanguage() {
    return new Promise((resolve) => {
      const languageSelect = document.getElementById('language-select');
      const storedLanguage = localStorage.getItem('selectedLanguage');
      const userLanguage = storedLanguage || languageSelect?.value || navigator.language || navigator.userLanguage;

      // Set the dropdown to the stored language
      if (storedLanguage && languageSelect) {
        languageSelect.value = storedLanguage;
      }

      // Load the appropriate language file
      fetch(`_locales/${userLanguage}/messages.json`)
        .then(response => response.json())
        .then(messages => {
          // Store globally for extractor
          window._i18nMessages = messages;
          // Simple translator helper for this instance (used by dynamic UI)
          this._t = (key) => messages?.[key]?.message;
          document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (messages[key]) {
              element.innerHTML = messages[key].message;
            }
          });
          // Placeholders (for future localization)
          document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (messages[key]) {
              element.setAttribute('placeholder', messages[key].message);
            }
          });
          // Update content extractor language if it exists
          if (window.contentExtractorManager) {
            window.contentExtractorManager.updateLanguage(messages);
          }
          resolve(); // Resolve the promise after translations are done
        })
        .catch(error => {
          console.error('Error loading language file:', error);
          resolve(); // Resolve even on error to continue initialization
        });
    });
  }

  initializeToggleHandlers() {
    // Use more specific event delegation for toggle changes
    const supportPage = document.getElementById('support-page');
    if (!supportPage) {
      console.error('Support page not found');
      return;
    }

    supportPage.addEventListener('change', (e) => {
      if (e.target.matches('.toggle-item input[type="checkbox"]')) {
        const target = e.target;
        // Custom Service toggles are handled separately
        if (target.dataset?.serviceId || target.dataset?.actionId) return;
        if (typeof target.id === 'string' && target.id.startsWith('toggle-custom-service')) return;
        this.handleToggleChange(target);
      }
    });

    // Initialize remember-last-model toggle state immediately after handlers are set
    this.initializeRememberLastModelSetting();
  }

  initializeRememberLastModelSetting() {
    const toggle = document.getElementById('toggle-remember-last-model');
    if (!toggle) return;
    // Default ON if not set
    const stored = localStorage.getItem('rememberLastModel');
    toggle.checked = stored === 'true';
    toggle.addEventListener('change', () => {
      localStorage.setItem('rememberLastModel', String(toggle.checked));
    });
  }

  async initializeCustomServiceSettings() {
    const section = document.getElementById('custom-service-section');
    if (!section) return;

    this.customServiceSettings = normalizeSettings(await readCustomServiceSettings());

    const toggle = document.getElementById('toggle-custom-service');
    const defaultSelect = document.getElementById('custom-service-default');
    const baseInput = document.getElementById('custom-service-base-url');
    const servicesContainer = section.querySelector('[data-role="custom-service-services"]');
    const actionsContainer = section.querySelector('[data-role="custom-service-actions"]');
    const sidePanelToggle = document.getElementById('toggle-custom-service-sidepanel');
    const addActionName = document.getElementById('custom-action-name-input');
    const addActionInstruction = document.getElementById('custom-action-instruction-input');
    const addActionBtn = document.getElementById('add-custom-action-btn');
    this._customServiceRefs = { servicesContainer, actionsContainer, defaultSelect };

    this.renderCustomServiceDefault(defaultSelect, this.customServiceSettings);
    this.renderCustomServiceServiceList(servicesContainer, defaultSelect);
    this.renderCustomServiceActionList(actionsContainer);

    if (toggle) {
      toggle.checked = !!this.customServiceSettings.enabled;
      toggle.addEventListener('change', async () => {
        await this.saveCustomServiceSettings({ enabled: toggle.checked });
      });
    }

    if (defaultSelect) {
      defaultSelect.value = this.customServiceSettings.defaultService;
      defaultSelect.addEventListener('change', async () => {
        await this.saveCustomServiceSettings({ defaultService: defaultSelect.value });
      });
    }

    if (baseInput) {
      let draftTimer = null;
      const updateDraft = () => {
        if (!this.customServiceSettings) this.customServiceSettings = normalizeSettings();
        this.customServiceSettings.customBaseUrl = baseInput.value.trim();
        if (servicesContainer) this.renderCustomServiceServiceList(servicesContainer, defaultSelect);
      };
      baseInput.addEventListener('input', () => {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(updateDraft, 150);
      });

      const commitBase = async () => {
        const sanitized = baseInput.value.trim();
        let next = await this.saveCustomServiceSettings({ customBaseUrl: sanitized });
        const base = typeof next.customBaseUrl === 'string' ? next.customBaseUrl.trim() : '';
        const hasValidCustom = !!(base && /^https?:\/\//i.test(base));
        if (hasValidCustom && !next.enabledServices.includes('custom')) {
          next = await this.saveCustomServiceSettings({
            enabledServices: Array.from(new Set([...(next.enabledServices || []), 'custom']))
          });
        }
        baseInput.value = next.customBaseUrl || '';
      };
      baseInput.value = this.customServiceSettings.customBaseUrl || '';
      baseInput.addEventListener('change', commitBase);
      baseInput.addEventListener('blur', commitBase);
    }

    if (sidePanelToggle) {
      sidePanelToggle.checked = !!this.customServiceSettings.openInSidePanel;
      sidePanelToggle.addEventListener('change', async () => {
        await this.saveCustomServiceSettings({ openInSidePanel: sidePanelToggle.checked });
      });
    }

    if (addActionBtn && addActionName && addActionInstruction) {
      const add = async () => {
        const name = addActionName.value.trim();
        const instruction = addActionInstruction.value.trim();
        if (!name) return;

        const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const customActions = [...(this.customServiceSettings.customActions || []), { id, label: name }];
        const enabledActions = Array.from(new Set([...(this.customServiceSettings.enabledActions || []), id]));
        const templates = {
          ...(this.customServiceSettings.actionTemplates || {}),
          [id]: `${(instruction || name).trim()} {text}`.replace(/\s+/g, ' ').trim()
        };

        await this.saveCustomServiceSettings({ customActions, enabledActions, actionTemplates: templates });
        addActionName.value = '';
        addActionInstruction.value = '';
      };

      addActionBtn.addEventListener('click', add);
      addActionName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') add();
      });
      addActionInstruction.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') add();
      });
    }

    this.syncCustomServiceUI(this.customServiceSettings);
  }

  renderCustomServiceDefault(select, settings) {
    if (!select) return;
    select.innerHTML = '';
    const safeSettings = settings ? normalizeSettings(settings) : (this.customServiceSettings || normalizeSettings());
    const services = [...SERVICE_PRESETS].sort((a, b) => {
      if (a.id === safeSettings.defaultService) return -1;
      if (b.id === safeSettings.defaultService) return 1;
      return a.label.localeCompare(b.label);
    });

    services.forEach((svc) => {
      const option = document.createElement('option');
      option.value = svc.id;
      option.textContent = svc.label;
      select.appendChild(option);
    });
    select.value = safeSettings.defaultService || 'chatgpt';
  }

  renderCustomServiceServiceList(container, defaultSelect) {
    if (!container) return;
    container.innerHTML = '';
    const settings = this.customServiceSettings || normalizeSettings();
    const services = [...SERVICE_PRESETS].sort((a, b) => {
      if (a.id === settings.defaultService) return -1;
      if (b.id === settings.defaultService) return 1;
      return a.label.localeCompare(b.label);
    });

    services.forEach((svc) => {
      const row = document.createElement('div');
      row.className = 'toggle-item';

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'custom-service-label';
      const label = document.createElement('span');
      label.textContent = svc.label;
      labelWrapper.appendChild(label);

      const switchEl = document.createElement('label');
      switchEl.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.serviceId = svc.id;
      input.checked = settings.enabledServices.includes(svc.id);
      if (svc.id === 'custom') {
        const baseUrl = typeof settings.customBaseUrl === 'string' ? settings.customBaseUrl.trim() : '';
        const valid = baseUrl && /^https?:\/\//i.test(baseUrl);
        input.disabled = !valid;
        if (!valid) input.checked = false;
        const meta = document.createElement('span');
        meta.className = 'custom-service-meta';
        if (valid) {
          meta.textContent = baseUrl;
        } else if (baseUrl) {
          meta.textContent = this._t?.('customServiceBaseUrlInvalid') || 'Invalid URL (must start with http:// or https://)';
        } else {
          meta.textContent = this._t?.('customServiceBaseUrlPlaceholder') || 'https://example.com/?q=';
        }
        labelWrapper.appendChild(meta);
      }
      const slider = document.createElement('span');
      slider.className = 'slider';
      switchEl.appendChild(input);
      switchEl.appendChild(slider);

      row.appendChild(labelWrapper);
      row.appendChild(switchEl);
      container.appendChild(row);

      input.addEventListener('change', async () => {
        if (input.disabled) return;
        const enabled = new Set(this.customServiceSettings.enabledServices);
        if (input.checked) {
          enabled.add(svc.id);
        } else {
          enabled.delete(svc.id);
        }
        const nextSettings = await this.saveCustomServiceSettings({
          enabledServices: Array.from(enabled)
        });

        // Keep default service aligned with enabled list
        if (!nextSettings.enabledServices.includes(nextSettings.defaultService) && defaultSelect) {
          const fallback = nextSettings.enabledServices[0] || 'chatgpt';
          defaultSelect.value = fallback;
          await this.saveCustomServiceSettings({ defaultService: fallback });
        }
      });
    });
  }

  renderCustomServiceActionList(container) {
    if (!container) return;
    container.innerHTML = '';
    const settings = this.customServiceSettings || normalizeSettings();

    const allActions = getAllActions(settings);

    allActions.forEach((action) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-action-row';

      const topRow = document.createElement('div');
      topRow.className = 'toggle-item';

      const left = document.createElement('div');
      left.className = 'custom-action-left';

      if (action.isCustom) {
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'custom-action-name';
        nameInput.maxLength = 32;
        nameInput.value = action.label || '';
        nameInput.addEventListener('blur', async () => {
          const nextLabel = nameInput.value.trim();
          if (!nextLabel) {
            nameInput.value = action.label || '';
            return;
          }
          const customActions = (this.customServiceSettings.customActions || []).map((a) =>
            a.id === action.id ? { ...a, label: nextLabel } : a
          );
          await this.saveCustomServiceSettings({ customActions });
        });
        left.appendChild(nameInput);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'custom-action-delete';
        deleteBtn.textContent = this._t?.('delete') || 'Delete';
        deleteBtn.addEventListener('click', async () => {
          const customActions = (this.customServiceSettings.customActions || []).filter((a) => a.id !== action.id);
          const enabledActions = (this.customServiceSettings.enabledActions || []).filter((id) => id !== action.id);
          const actionTemplates = { ...(this.customServiceSettings.actionTemplates || {}) };
          delete actionTemplates[action.id];

          const nextEnabled = enabledActions.length ? enabledActions : [ACTION_PRESETS[0].id];
          await this.saveCustomServiceSettings({
            customActions,
            enabledActions: nextEnabled,
            actionTemplates
          });
        });
        left.appendChild(deleteBtn);
      } else {
        const label = document.createElement('span');
        label.textContent = action.label;
        left.appendChild(label);
      }

      const switchEl = document.createElement('label');
      switchEl.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.actionId = action.id;
      input.checked = settings.enabledActions.includes(action.id);
      const slider = document.createElement('span');
      slider.className = 'slider';
      switchEl.appendChild(input);
      switchEl.appendChild(slider);

      topRow.appendChild(left);
      topRow.appendChild(switchEl);

      const templateRow = document.createElement('div');
      templateRow.className = 'custom-action-template-row';

      const templateInput = document.createElement('input');
      templateInput.type = 'text';
      templateInput.className = 'custom-action-template';
      templateInput.maxLength = 240;

      const defaultTemplate = action.template || (action.label ? `${action.label}: {text}` : '{text}');
      const currentTemplate = settings.actionTemplates?.[action.id] || defaultTemplate;
      const defaultInstruction = defaultTemplate.replace('{text}', '').trim();
      const currentInstruction = currentTemplate.replace('{text}', '').trim();

      templateInput.value = currentInstruction || defaultInstruction;
      templateInput.placeholder = defaultInstruction;

      const token = document.createElement('span');
      token.className = 'custom-action-token';
      token.textContent = '{text}';

      templateRow.appendChild(templateInput);
      templateRow.appendChild(token);

      wrapper.appendChild(topRow);
      wrapper.appendChild(templateRow);
      container.appendChild(wrapper);

      input.addEventListener('change', async () => {
        const enabled = new Set(this.customServiceSettings.enabledActions);
        if (input.checked) {
          enabled.add(action.id);
        } else if (enabled.size > 1) {
          enabled.delete(action.id);
        } else {
          input.checked = true; // keep at least one action
          return;
        }
        await this.saveCustomServiceSettings({
          enabledActions: Array.from(enabled)
        });
      });

      const commitTemplate = async () => {
        const instruction = templateInput.value.trim() || defaultInstruction;
        const val = `${instruction} {text}`.replace(/\s+/g, ' ').trim();
        const templates = {
          ...this.customServiceSettings.actionTemplates,
          [action.id]: val
        };
        const nextSettings = await this.saveCustomServiceSettings({ actionTemplates: templates });
        const nextTemplate = nextSettings.actionTemplates?.[action.id] || defaultTemplate;
        templateInput.value = nextTemplate.replace('{text}', '').trim() || defaultInstruction;
      };

      templateInput.addEventListener('change', commitTemplate);
      templateInput.addEventListener('blur', commitTemplate);
    });
  }

  async saveCustomServiceSettings(partial) {
    const next = await updateCustomServiceSettings({
      ...(this.customServiceSettings || normalizeSettings()),
      ...(partial || {})
    });
    this.customServiceSettings = next;
    this.syncCustomServiceUI(next);
    this.refreshCustomServiceLists();
    this.notifyCustomServiceContextMenuRefresh();
    return next;
  }

  refreshCustomServiceLists() {
    if (!this._customServiceRefs) return;
    const { servicesContainer, defaultSelect, actionsContainer } = this._customServiceRefs;
    if (servicesContainer) this.renderCustomServiceServiceList(servicesContainer, defaultSelect);
    if (actionsContainer) this.renderCustomServiceActionList(actionsContainer);
  }

  syncCustomServiceUI(settings) {
    const toggle = document.getElementById('toggle-custom-service');
    const defaultSelect = document.getElementById('custom-service-default');
    const baseInput = document.getElementById('custom-service-base-url');
    const sidePanelToggle = document.getElementById('toggle-custom-service-sidepanel');

    if (toggle) toggle.checked = !!settings.enabled;
    if (baseInput) baseInput.value = settings.customBaseUrl || '';
    if (sidePanelToggle) sidePanelToggle.checked = !!settings.openInSidePanel;

    if (defaultSelect) {
      Array.from(defaultSelect.options).forEach((opt) => {
        opt.disabled = !settings.enabledServices.includes(opt.value);
      });

      if (!settings.enabledServices.includes(defaultSelect.value)) {
        defaultSelect.value = settings.enabledServices[0] || 'chatgpt';
      }
    }
  }

  notifyCustomServiceContextMenuRefresh() {
    try {
      chrome.runtime.sendMessage({ type: 'REFRESH_CUSTOM_SERVICE_MENUS' });
    } catch (_) { }
  }

  handleToggleChange(toggle) {
    const service = toggle.id.replace('toggle-', '');

    // Special case: Remember last selected model (no button to show/hide)
    if (service === 'remember-last-model') {
      localStorage.setItem('rememberLastModel', String(toggle.checked));
      return;
    }

    // Prompt history viewer (loads/unloads neural-nav-bundle.js)
    if (service === 'prompt-history-viewer') {
      if (toggle.checked) {
        this.loadNeuralNavBundle();
      } else {
        this.unloadNeuralNavBundle();
      }
      chrome.storage.local.set({ 'promptHistoryViewerEnabled': toggle.checked });
      return;
    }

    // Handle custom links
    if (service.startsWith('custom-')) {
      this.handleCustomLinkToggle(toggle, service);
      return;
    }

    // Count only service toggles (excluding split-view and support)
    const enabledServicesCount = Array.from(
      document.querySelectorAll('.toggle-item input[type="checkbox"]')
    ).filter(t => {
      const toggleService = t.id.replace('toggle-', '');
      return t.checked && ['chatgpt', 'gemini', 'claude', 'copilot', 'deepseek', 'grok', 'mistral', 'perplexity', 'qwen', 'kimi', 'githubcopilot', 'zai'].includes(toggleService);
    }).length;

    // Prevent disabling last service
    if (!toggle.checked && enabledServicesCount === 0 && ['chatgpt', 'gemini', 'claude', 'copilot', 'deepseek', 'grok', 'mistral', 'perplexity', 'qwen', 'kimi', 'githubcopilot', 'zai'].includes(service)) {
      toggle.checked = true;
      return;
    }

    // Handle built-in services
    this.handleBuiltInServiceToggle(toggle, service);
  }

  handleCustomLinkToggle(toggle, service) {
    const customId = service.replace('custom-', '');

    // Import custom link functions - these will be provided by the custom link module
    if (window.customLinkManager) {
      window.customLinkManager.toggleCustomLink(customId, toggle.checked);
    } else {
      console.error('Custom link manager not found');
    }
  }

  handleBuiltInServiceToggle(toggle, service) {
    const selectors = {
      'remember-last-model': null,
      'chatgpt': '[data-url*="chatgpt.com"]',
      'gemini': '[data-url*="gemini.google.com"]',
      'claude': '[data-url*="claude.ai"]',
      'copilot': '[data-url*="copilot.microsoft.com"]',
      'deepseek': '[data-url*="chat.deepseek.com"]',
      'grok': '[data-url*="grok.com"]',
      'mistral': '[data-url*="chat.mistral.ai/chat"]',
      'perplexity': '[data-url*="perplexity.ai"]',
      'qwen': '[data-url*="chat.qwen.ai"]',
      'kimi': '[data-url*="kimi.com"]',
      'githubcopilot': '[data-url*="github.com/copilot"]',
      'zai': '[data-url*="chat.z.ai"]',
      'split-view': '#split-view-btn',
      'content-extractor': '#content-extractor-btn',
      'scrollbar-always-visible': null // Special case - doesn't toggle a button
    };

    // Handle scrollbar visibility setting
    if (service === 'scrollbar-always-visible') {
      this.handleScrollbarVisibilitySetting(toggle.checked);
      localStorage.setItem(`show_${service}`, toggle.checked.toString());
      return;
    }

    const selector = selectors[service];
    const button = selector ? document.querySelector(selector) : null;

    if (button) {
      button.style.display = toggle.checked ? 'flex' : 'none';
      localStorage.setItem(`show_${service}`, toggle.checked.toString());
    } else if (service === 'remember-last-model') {
      // Already handled above, but keep storage consistent if called directly
      localStorage.setItem('rememberLastModel', toggle.checked.toString());
    }
  }

  handleScrollbarVisibilitySetting(alwaysVisible) {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) {
      console.error('Toolbar not found for scrollbar visibility setting');
      return;
    }

    if (alwaysVisible) {
      toolbar.classList.remove('scrollbar-hover-only');
    } else {
      toolbar.classList.add('scrollbar-hover-only');
    }

    // Notify navBar manager if it exists
    if (window.navBarManager && window.navBarManager.updateScrollbarVisibility) {
      window.navBarManager.updateScrollbarVisibility(alwaysVisible);
    }
  }

  async initializeToggles() {
    // Handle prompt history viewer setting separately since it uses chrome.storage
    const phvResult = await new Promise(resolve => chrome.storage.local.get(['promptHistoryViewerEnabled'], resolve));
    const phvEnabled = phvResult.promptHistoryViewerEnabled !== false;
    const phvToggle = document.getElementById('toggle-prompt-history-viewer');
    if (phvToggle) phvToggle.checked = phvEnabled;
    if (phvEnabled) {
      this.loadNeuralNavBundle();
    } else {
      this.unloadNeuralNavBundle();
    }
    const toggles = {
      'remember-last-model': null,
      'chatgpt': '[data-url*="chatgpt.com"]',
      'gemini': '[data-url*="gemini.google.com"]',
      'claude': '[data-url*="claude.ai"]',
      'copilot': '[data-url*="copilot.microsoft.com"]',
      'deepseek': '[data-url*="chat.deepseek.com"]',
      'grok': '[data-url*="grok.com"]',
      'mistral': '[data-url*="chat.mistral.ai/chat"]',
      'perplexity': '[data-url*="perplexity.ai"]',
      'qwen': '[data-url*="chat.qwen.ai"]',
      'kimi': '[data-url*="kimi.com"]',
      'githubcopilot': '[data-url*="github.com/copilot"]',
      'zai': '[data-url*="chat.z.ai"]',
      'split-view': '#split-view-btn',
      'content-extractor': '#content-extractor-btn',
      'scrollbar-always-visible': null // Special case - doesn't toggle a button
    };

    // Add custom links to the toggles object - now they should exist in DOM
    const customLinks = window.customLinkManager ? window.customLinkManager.getCustomLinks() : [];
    let customLinksUpdated = false;

    customLinks.forEach(link => {
      if (link.id && link.url) {
        toggles[`custom-${link.id}`] = `[data-url="${link.url}"]`;
      }
    });


    Object.entries(toggles).forEach(([key, selector]) => {
      const toggle = document.getElementById(`toggle-${key}`);
      const button = selector ? document.querySelector(selector) : null;

      // Get the stored value if it exists
      const storedValue = localStorage.getItem(`show_${key}`);

      // For custom links, check the link's enabled property if no localStorage value exists
      let isVisible;
      if (key.startsWith('custom-')) {
        const customId = key.replace('custom-', '');
        const customLink = customLinks.find(link => link.id.toString() === customId);

        if (customLink) {
          // Priority: localStorage > link.enabled > default true
          isVisible = storedValue !== null ? storedValue === 'true' : (customLink.enabled !== false);

          // Sync the link object with the final state
          if (customLink.enabled !== isVisible) {
            customLink.enabled = isVisible;
            customLinksUpdated = true;
          }

        } else {
          isVisible = false; // Link not found
          console.warn(`Custom link not found for key: ${key}`);
        }
      } else if (key === 'scrollbar-always-visible') {
        // Handle scrollbar visibility setting
        isVisible = storedValue !== null ? storedValue === 'true' : true; // Default to always visible
      } else if (key === 'remember-last-model') {
        // Remember last model setting (stored under different key, default true)
        const rlm = localStorage.getItem('rememberLastModel');
        isVisible = rlm !== 'false';
      } else {
        // Use stored value if it exists, otherwise use the checkbox's default checked state
        // For built-in services, default to true if no toggle exists
        isVisible = storedValue !== null ? storedValue === 'true' :
          (toggle?.checked ?? true);
      }

      if (toggle) {
        toggle.checked = isVisible;
      }

      if (button) {
        button.style.display = isVisible ? 'flex' : 'none';
      } else if (key === 'scrollbar-always-visible') {
        // Apply scrollbar visibility setting
        this.handleScrollbarVisibilitySetting(isVisible);
      } else if (key === 'remember-last-model') {
        // Sync UI state with storage
        const rlmToggle = document.getElementById('toggle-remember-last-model');
        if (rlmToggle) rlmToggle.checked = isVisible;
      } else if (key.startsWith('custom-')) {
        console.warn(`Custom button not found for ${key}, selector: ${selector}`);
      }
    });

    // Save updated custom links if any were modified
    if (customLinksUpdated && window.customLinkManager) {
      window.customLinkManager.saveCustomLinks(customLinks);
    }

    // Restore button order after toggles are set
    if (window.saveManager) {
      window.saveManager.restoreButtonOrder();
    }
  }

  loadNeuralNavBundle() {
    // For content scripts, we can't dynamically load/unload, so store the setting
    chrome.storage.local.set({ 'promptHistoryViewerEnabled': true });
  }

  unloadNeuralNavBundle() {
    chrome.storage.local.set({ 'promptHistoryViewerEnabled': false });
  }
}
