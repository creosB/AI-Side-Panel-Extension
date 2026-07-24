// Main Application Entry Point
import { initWhatsNewReveal } from './modules/whatsNewReveal.js';
import { SplitViewManager } from './modules/splitView.js';
import { SettingsManager } from './modules/settings.js';
import { TypographyManager } from './modules/typography.js';
import { NavBarManager } from './modules/navBar.js';
import { SaveManager } from './modules/saveManager.js';
import { CustomLinkManager } from './modules/customLink.js';
import { ContentExtractorManager } from './modules/contentExtractor.js';
import SupportMessage from './modules/supportMessage.js';
import PremiumManager from './modules/premium.js';
import { ConversationHubManager } from './modules/conversationHub.js';

class SidePanelApp {
  constructor() {
    // Initialize all managers
    this.saveManager = new SaveManager();
    this.customLinkManager = new CustomLinkManager();
    this.settingsManager = new SettingsManager();
    this.typographyManager = new TypographyManager();
    this.navBarManager = new NavBarManager();
    this.splitViewManager = new SplitViewManager();
    this.contentExtractorManager = new ContentExtractorManager();
    this.conversationHubManager = new ConversationHubManager();
    this.supportMessage = new SupportMessage();
  this.premiumManager = new PremiumManager();

    // Make managers globally available for cross-module communication
    window.saveManager = this.saveManager;
    window.customLinkManager = this.customLinkManager;
    window.settingsManager = this.settingsManager;
    window.typographyManager = this.typographyManager;
    window.navBarManager = this.navBarManager;
    window.splitViewManager = this.splitViewManager;
    window.contentExtractorManager = this.contentExtractorManager;
    window.conversationHubManager = this.conversationHubManager;
    window.supportMessage = this.supportMessage;
  window.premiumManager = this.premiumManager;

    // Define global variables for compatibility
    window.buttons = document.querySelectorAll('.btn[data-url]');
    window.iframe = document.querySelector('iframe');
    window.supportBtn = document.getElementById('support-btn');
    window.supportPage = document.getElementById('support-page');
  }

  async initialize() {
    // Clear action badge on first open
    try {
      chrome.action.setBadgeText({ text: "" });
      chrome.storage.local.set({ badgeCleared: true });
    } catch (_) {}
    
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
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'AI_MODEL_SWITCH') {
        window.navBarManager?.switchModel(msg.direction === 'prev' ? -1 : 1);
      } else if (msg && msg.type === 'OPEN_CUSTOM_SERVICE') {
        window.navBarManager?.openCustomServiceUrl(msg.payload || {});
      }
      sendResponse?.({ ok: true });
    });
  } catch (_) {}

  // Consume any pending custom service request that was queued while the panel was closed
  try {
    chrome.storage.local.get(['pendingCustomService'], (res) => {
      const pending = res?.pendingCustomService;
      if (pending?.url) {
        window.navBarManager?.openCustomServiceUrl(pending);
      }
      chrome.storage.local.remove('pendingCustomService');
    });
  } catch (_) {}

  // ── Onboarding overlay ────────────────────────────────────────────
  initOnboarding();
  initKnownIssuesModal();

  // ── What's New re-exposure (v1.6) ─────────────────────────────────
  // On update, background arms `showWhatsNew`. Non-premium users get a
  // short value-first reveal (Hub → Privacy → Premium CTA); premium users
  // skip it entirely. See modules/whatsNewReveal.js.
  initWhatsNewReveal();
});

// ── Onboarding overlay management ────────────────────────────────────
function showOnboardingOverlay() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Trigger CSS transition on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });
}

function hideOnboardingOverlay() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 320);
  try {
    chrome.storage.local.set({ onboardingShown: true });
  } catch (_) {}
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  // Check first-launch flag
  try {
    chrome.storage.local.get(['onboardingShown'], (result) => {
      if (!result.onboardingShown) {
        showOnboardingOverlay();
      }
    });
  } catch (_) {
    // Fallback: show it if storage is unavailable
    showOnboardingOverlay();
  }

  // Listen for messages from the onboarding iframe
  window.addEventListener('message', (e) => {
    if (!e.data?.type) return;
    switch (e.data.type) {
      case 'ONBOARDING_COMPLETE':
      case 'ONBOARDING_SKIP':
        hideOnboardingOverlay();
        break;
      case 'OPEN_PREMIUM':
        hideOnboardingOverlay();
        // Small delay so the overlay fade finishes before modal opens
        setTimeout(() => window.premiumManager?.open?.(), 350);
        break;
    }
  });

  // "Show feature tour" button in settings page
  document.getElementById('show-onboarding-btn')?.addEventListener('click', () => {
    showOnboardingOverlay();
  });

  // Expose globally so other modules can trigger it if needed
  window.showOnboarding = showOnboardingOverlay;
}

function showKnownIssuesModal() {
  const modal = document.getElementById('known-issues-modal');
  if (!modal) return;
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

function hideKnownIssuesModal() {
  const modal = document.getElementById('known-issues-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
}

function initKnownIssuesModal() {
  const modal = document.getElementById('known-issues-modal');
  const openBtn = document.getElementById('known-issues-btn');
  const closeBtn = document.getElementById('known-issues-close-btn');
  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', showKnownIssuesModal);
  closeBtn?.addEventListener('click', hideKnownIssuesModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) hideKnownIssuesModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('visible')) {
      hideKnownIssuesModal();
    }
  });
}

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
