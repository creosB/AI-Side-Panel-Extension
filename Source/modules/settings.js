// Settings Module
export class SettingsManager {
  constructor() {
    this.init();
  }

  init() {
    this.initializeShortcutSettings();
    this.initializeLanguageSettings();
    this.initializeToggleHandlers();
  }

  initializeShortcutSettings() {
    const changeShortcutBtn = document.getElementById('change-shortcut');

    if (!changeShortcutBtn) {
      console.error('Change shortcut button not found');
      return;
    }

    changeShortcutBtn.addEventListener('click', () => {
      // Create a notification to guide users
      const notification = document.createElement('div');
      notification.className = 'notification';
      notification.textContent = 'Look for "AI Side Panel" to change the shortcut.';
      document.body.appendChild(notification);

      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.remove();
      }, 3000);

      // Open Chrome's keyboard shortcuts page
      chrome.tabs.create({
        url: 'chrome://extensions/shortcuts'
      });
    });

    // Get current shortcut from commands API
    chrome.commands.getAll((commands) => {
      const command = commands.find(cmd => cmd.name === '_execute_action');
      if (command && command.shortcut) {
        document.getElementById('shortcut-input').value = command.shortcut;
      }
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
      'content-extractor': '#content-extractor-btn'
    };
    
    const selector = selectors[service];
    const button = document.querySelector(selector);
    
    if (button) {
      button.style.display = toggle.checked ? 'flex' : 'none';
      localStorage.setItem(`show_${service}`, toggle.checked.toString());
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
      'content-extractor': '#content-extractor-btn'
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
      const button = document.querySelector(selector);

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
