// Save Manager Module
export class SaveManager {
  constructor() {
    // This module handles all saving and loading of user preferences
  }

  saveButtonOrder(order) {
    try {
      localStorage.setItem('buttonOrder', JSON.stringify(order));
      console.log('Button order saved:', order);
    } catch (error) {
      console.error('Error saving button order:', error);
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
        const foundButtons = [];
        
        console.log('Restoring button order:', order);
        
        order.forEach((url, index) => {
          let btn;
          if (url === 'support') {
            btn = document.getElementById('support-btn');
          } else if (url === 'split-view') {
            btn = document.getElementById('split-view-btn');
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
            console.log(`Moved button ${index + 1}/${order.length}: ${url}`);
          } else if (btn && foundButtons.includes(btn)) {
            console.log(`Button already positioned: ${url}`);
          } else {
            console.log(`Button not found or not in toolbar: ${url}`);
          }
        });
        
        console.log(`Restored order for ${foundButtons.length} buttons out of ${order.length} in saved order`);
      } catch (error) {
        console.error('Error restoring button order:', error);
        localStorage.removeItem('buttonOrder');
      }
    } else {
      console.log('No saved button order found');
    }
  }

  saveToggleState(service, enabled) {
    try {
      localStorage.setItem(`show_${service}`, enabled.toString());
      console.log(`Toggle state saved: ${service} = ${enabled}`);
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
      console.log('Language preference saved:', language);
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
      console.log('All application data cleared');
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
      
      console.log('Settings exported successfully');
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
      
      console.log('Settings imported successfully');
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
