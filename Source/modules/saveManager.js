// Save Manager Module
export class SaveManager {
  constructor() {
    // This module handles all saving and loading of user preferences
  }

  saveButtonOrder(order) {
    try {
      // Filter out null/undefined/empty values before saving
      const cleanOrder = Array.isArray(order) 
        ? order.filter(url => url !== null && url !== undefined && url !== '')
        : [];
      localStorage.setItem('buttonOrder', JSON.stringify(cleanOrder));
    } catch (error) {
      console.error('Error saving button order:', error);
    }
  }

  // Persist last selected model URL for optional restore on next open
  saveLastSelectedModel(url) {
    try {
      if (typeof url === 'string' && url.trim()) {
        localStorage.setItem('lastSelectedModelUrl', url);
      }
    } catch (error) {
      console.error('Error saving last selected model:', error);
    }
  }

  getLastSelectedModel() {
    try {
      return localStorage.getItem('lastSelectedModelUrl');
    } catch (error) {
      console.error('Error getting last selected model:', error);
      return null;
    }
  }

  restoreButtonOrder() {
    const toolbar = document.getElementById('toolbar');
    const savedOrder = localStorage.getItem('buttonOrder');
    
    if (!toolbar) {
      console.error('Toolbar not found for restoring button order');
      return;
    }

    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        
        // Ensure order is an array
        if (!Array.isArray(order)) {
          console.warn('Button order data is not an array, clearing saved data');
          localStorage.removeItem('buttonOrder');
          return;
        }
        
        const foundButtons = [];
        
        // Clean the order array by removing null/undefined/empty values
        const cleanedOrder = order.filter(url => url !== null && url !== undefined && url !== '' && typeof url === 'string');
        
        // If we cleaned some items, save the cleaned version
        if (cleanedOrder.length !== order.length) {
          console.log('Cleaning null values from saved button order');
          localStorage.setItem('buttonOrder', JSON.stringify(cleanedOrder));
        }
        
        cleanedOrder.forEach((url, index) => {
          
          let btn;
          if (url === 'support') {
            btn = document.getElementById('support-btn');
          } else if (url === 'split-view') {
            btn = document.getElementById('split-view-btn');
          } else if (url === 'content-extractor') {
            btn = document.getElementById('content-extractor-btn');
          } else if (url === 'conversation-hub') {
            btn = document.getElementById('conversation-hub-btn');
          } else {
            // Try to find button by exact URL match first (for custom links and built-in services)
            btn = document.querySelector(`[data-url="${url}"]`);
            // If not found, try partial match (for built-in services with changed URLs)
            if (!btn) {
              const cleanUrl = url.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
              btn = document.querySelector(`[data-url*="${cleanUrl}"]`);
            }
          }
          
          if (btn && toolbar.contains(btn) && !foundButtons.includes(btn)) {
            foundButtons.push(btn);
            // Append to end, which maintains the order
            toolbar.appendChild(btn);
          } else if (btn && foundButtons.includes(btn)) {
          } else {
          }
        });
        
      } catch (error) {
        console.error('Error restoring button order:', error);
        localStorage.removeItem('buttonOrder');
      }
    } else {
    }
  }

  saveToggleState(service, enabled) {
    try {
      localStorage.setItem(`show_${service}`, enabled.toString());
    } catch (error) {
      console.error(`Error saving toggle state for ${service}:`, error);
    }
  }

  getToggleState(service, defaultValue = true) {
    try {
      const storedValue = localStorage.getItem(`show_${service}`);
      return storedValue !== null ? storedValue === 'true' : defaultValue;
    } catch (error) {
      console.error(`Error getting toggle state for ${service}:`, error);
      return defaultValue;
    }
  }

  saveLanguagePreference(language) {
    try {
      localStorage.setItem('selectedLanguage', language);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  }

  getLanguagePreference() {
    try {
      return localStorage.getItem('selectedLanguage');
    } catch (error) {
      console.error('Error getting language preference:', error);
      return null;
    }
  }

  clearAllData() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('show_') || 
            key === 'buttonOrder' || 
            key === 'selectedLanguage' || 
            key === 'customLinks') {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing application data:', error);
    }
  }

  exportSettings() {
    try {
      const settings = {
        buttonOrder: this.getButtonOrder(),
        language: this.getLanguagePreference(),
        customLinks: window.customLinkManager ? window.customLinkManager.getCustomLinks() : [],
        toggleStates: this.getAllToggleStates()
      };
      
      const dataStr = JSON.stringify(settings, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = 'ai-sidepanel-settings.json';
      link.click();
      
    } catch (error) {
      console.error('Error exporting settings:', error);
    }
  }

  importSettings(fileContent) {
    try {
      const settings = JSON.parse(fileContent);
      
      // Import button order
      if (settings.buttonOrder) {
        this.saveButtonOrder(settings.buttonOrder);
      }
      
      // Import language preference
      if (settings.language) {
        this.saveLanguagePreference(settings.language);
      }
      
      // Import custom links
      if (settings.customLinks && window.customLinkManager) {
        window.customLinkManager.saveCustomLinks(settings.customLinks);
      }
      
      // Import toggle states
      if (settings.toggleStates) {
        Object.entries(settings.toggleStates).forEach(([service, enabled]) => {
          this.saveToggleState(service, enabled);
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error importing settings:', error);
      return false;
    }
  }

  getButtonOrder() {
    try {
      const savedOrder = localStorage.getItem('buttonOrder');
      return savedOrder ? JSON.parse(savedOrder) : [];
    } catch (error) {
      console.error('Error getting button order:', error);
      return [];
    }
  }

  getAllToggleStates() {
    const toggleStates = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('show_')) {
          const service = key.replace('show_', '');
          toggleStates[service] = localStorage.getItem(key) === 'true';
        }
      }
    } catch (error) {
      console.error('Error getting all toggle states:', error);
    }
    return toggleStates;
  }
}
