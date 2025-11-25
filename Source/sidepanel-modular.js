// Main Application Entry Point
import { SplitViewManager } from './modules/splitView.js';
import { SettingsManager } from './modules/settings.js';
import { NavBarManager } from './modules/navBar.js';
import { SaveManager } from './modules/saveManager.js';
import { CustomLinkManager } from './modules/customLink.js';
import { ContentExtractorManager } from './modules/contentExtractor.js';
import SupportMessage from './modules/supportMessage.js';
import PremiumManager from './modules/premium.js';

class SidePanelApp {
  constructor() {
    // Initialize all managers
    this.saveManager = new SaveManager();
    this.customLinkManager = new CustomLinkManager();
    this.settingsManager = new SettingsManager();
    this.navBarManager = new NavBarManager();
    this.splitViewManager = new SplitViewManager();
    this.contentExtractorManager = new ContentExtractorManager();
    this.supportMessage = new SupportMessage();
  this.premiumManager = new PremiumManager();

    // Make managers globally available for cross-module communication
    window.saveManager = this.saveManager;
    window.customLinkManager = this.customLinkManager;
    window.settingsManager = this.settingsManager;
    window.navBarManager = this.navBarManager;
    window.splitViewManager = this.splitViewManager;
    window.contentExtractorManager = this.contentExtractorManager;
    window.supportMessage = this.supportMessage;
  window.premiumManager = this.premiumManager;

    // Define global variables for compatibility
    window.buttons = document.querySelectorAll('.btn[data-url]');
    window.iframe = document.querySelector('iframe');
    window.supportBtn = document.getElementById('support-btn');
    window.supportPage = document.getElementById('support-page');
  }

  async initialize() {
    
    try {
      // Initialize loading state first
      this.navBarManager.initializeLoadingState();

      // Initialize language and then render components
      await this.settingsManager.setLanguage();
      
      // Render custom links first
      this.customLinkManager.renderCustomLinks();
      
      // Then initialize toggles (now custom links exist in DOM)
      await this.settingsManager.initializeToggles();
      
      // Load initial URL
      this.navBarManager.loadInitialUrl();
      
      // Initialize split view
      this.splitViewManager.initialize();
      
      // Initialize support message after everything else is ready
      this.supportMessage.init();
  // Initialize premium
  this.premiumManager.init();
      
      
    } catch (error) {
      console.error('Error in initialization:', error);
      
      // Fallback initialization
      this.customLinkManager.renderCustomLinks();
      await this.settingsManager.initializeToggles();
      this.navBarManager.loadInitialUrl();
      this.splitViewManager.initialize();
      this.supportMessage.init();
  this.premiumManager.init();
      
    }
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const app = new SidePanelApp();
  await app.initialize();

  // Route background command messages at app level as a backup
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'AI_MODEL_SWITCH') {
        window.navBarManager?.switchModel(msg.direction === 'prev' ? -1 : 1);
      }
    });
  } catch (_) {}
});

// Legacy compatibility - expose functions that might be called externally
window.toggleLoadingState = (show) => {
  if (window.navBarManager) {
    window.navBarManager.toggleLoadingState(show);
  }
};

window.addCustomLink = (url) => {
  if (window.customLinkManager) {
    return window.customLinkManager.addCustomLink(url);
  }
  return null;
};

window.deleteCustomLink = (id) => {
  if (window.customLinkManager) {
    return window.customLinkManager.deleteCustomLink(id);
  }
  return null;
};

window.getCustomLinks = () => {
  if (window.customLinkManager) {
    return window.customLinkManager.getCustomLinks();
  }
  return [];
};

window.saveCustomLinks = (links) => {
  if (window.customLinkManager) {
    window.customLinkManager.saveCustomLinks(links);
  }
};

window.restoreButtonOrder = () => {
  if (window.saveManager) {
    window.saveManager.restoreButtonOrder();
  }
};
