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
      } catch {}
      chrome.tabs.create({ url });
    };

      manageAllBtn?.addEventListener('click', openShortcutsPage);    // Get current shortcut from commands API
    chrome.commands.getAll((commands) => {
      const get = (name) => commands.find((c) => c.name === name);
      const openCmd = get('_execute_action');
      const nextCmd = get('next_ai_model');
      const prevCmd = get('previous_ai_model');
      const openInput = document.getElementById('shortcut-input');
      if (openCmd?.shortcut && openInput) openInput.value = openCmd.shortcut;
        if (nextInput) nextInput.value = nextCmd?.shortcut || this._t?.('notSet') || 'Not set';
        if (prevInput) prevInput.value = prevCmd?.shortcut || this._t?.('notSet') || 'Not set';
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
      } catch (_) {}

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
      } catch (_) {}

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
          document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (messages[key]) {
              element.innerHTML = messages[key].message;
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
        this.handleToggleChange(e.target);
      }
    });
  }

  handleToggleChange(toggle) {
    const service = toggle.id.replace('toggle-', '');


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
      return t.checked && ['chatgpt', 'gemini', 'claude', 'copilot', 'deepseek', 'grok', 'mistral', 'perplexity', 'qwen', 'githubcopilot'].includes(toggleService);
    }).length;

    // Prevent disabling last service
    if (!toggle.checked && enabledServicesCount === 0 && ['chatgpt', 'gemini', 'claude', 'copilot', 'deepseek', 'grok', 'mistral', 'perplexity', 'qwen', 'githubcopilot'].includes(service)) {
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
      'chatgpt': '[data-url*="chatgpt.com"]',
      'gemini': '[data-url*="gemini.google.com"]',
      'claude': '[data-url*="claude.ai"]',
      'copilot': '[data-url*="copilot.microsoft.com"]',
      'deepseek': '[data-url*="chat.deepseek.com"]',
      'grok': '[data-url*="grok.com"]',
      'mistral': '[data-url*="chat.mistral.ai/chat"]',
      'perplexity': '[data-url*="perplexity.ai"]',
      'qwen': '[data-url*="chat.qwen.ai"]',
      'githubcopilot': '[data-url*="github.com/copilot"]',
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
    const button = document.querySelector(selector);
    
    if (button) {
      button.style.display = toggle.checked ? 'flex' : 'none';
      localStorage.setItem(`show_${service}`, toggle.checked.toString());
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

  initializeToggles() {
    const toggles = {
      'chatgpt': '[data-url*="chatgpt.com"]',
      'gemini': '[data-url*="gemini.google.com"]',
      'claude': '[data-url*="claude.ai"]',
      'copilot': '[data-url*="copilot.microsoft.com"]',
      'deepseek': '[data-url*="chat.deepseek.com"]',
      'grok': '[data-url*="grok.com"]',
      'mistral': '[data-url*="chat.mistral.ai/chat"]',
      'perplexity': '[data-url*="perplexity.ai"]',
      'qwen': '[data-url*="chat.qwen.ai"]',
      'githubcopilot': '[data-url*="github.com/copilot"]',
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
}
