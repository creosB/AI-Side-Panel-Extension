// Navigation Bar Module
import { SERVICE_PRESETS } from './customServiceConfig.js';

export class NavBarManager {
  constructor() {
    this.init();
    // Make this instance globally available
    window.navBarManager = this;
  // Debounced commit delay for shortcut-based model switching (ms)
  this._shortcutNavDelay = 450;
  this._switchCommitTimer = null;
  this._pendingTarget = null;
  }

  init() {
    this.initializeButtonClickHandlers();
    this.initializeDragAndDrop();
    this.initializePremiumScrolling();
    this.initializeLoadingState();
  }

  initializeButtonClickHandlers() {
    const toolbar = document.getElementById('toolbar');
    const iframe = document.getElementById('main-iframe');
    const supportPage = document.getElementById('support-page');
    const supportBtn = document.getElementById('support-btn');
    const splitViewBtn = document.getElementById('split-view-btn');

    if (!toolbar || !iframe || !supportPage || !supportBtn || !splitViewBtn) {
      console.error('Required elements not found for navigation initialization');
      return;
    }

    // Use event delegation to handle clicks on all buttons (static and dynamic)
    toolbar.addEventListener('click', (e) => {
      const button = e.target.closest('.btn[data-url]');
      const supportButton = e.target.closest('#support-btn');

      if (button && button.hasAttribute('data-url')) {
        this.handleServiceButtonClick(button, iframe, supportPage, splitViewBtn, supportBtn, toolbar);
      } else if (supportButton) {
        this.handleSupportButtonClick(iframe, supportPage, toolbar, supportButton);
      }
      // Note: Split view button handler is in the split view module
    });

  // Runtime message handling is centralized in sidepanel-modular.js

    // In-panel fallback shortcuts (only when global commands are unassigned)
    let fallbackEnabled = false;
    try {
      chrome.commands.getAll((cmds) => {
        const find = (n) => cmds.find((c) => c.name === n);
        const next = find('next_ai_model');
        const prev = find('previous_ai_model');
        fallbackEnabled = !(next?.shortcut) || !(prev?.shortcut);
      });
    } catch { }

    document.addEventListener('keydown', (e) => {
      if (!fallbackEnabled) return;
      // Avoid when typing in inputs/selects/textareas or with modifiers like Ctrl in text fields
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;
      if (isTyping) return;

      // Use Alt+[ or Alt+] as low-conflict fallback keys
      const altOnly = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (!altOnly) return;
      if (e.key === ']') { e.preventDefault(); this.switchModel(1); }
      if (e.key === '[') { e.preventDefault(); this.switchModel(-1); }
    });
  }

  handleServiceButtonClick(button, iframe, supportPage, splitViewBtn, supportBtn, toolbar) {
    // If there is a pending delayed switch (from shortcuts), cancel it and commit now via this click
    if (this._switchCommitTimer) {
      clearTimeout(this._switchCommitTimer);
      this._switchCommitTimer = null;
      this._pendingTarget = null;
    }
  const url = button.getAttribute('data-url');

    // Update split view button state
    splitViewBtn.disabled = false;
    splitViewBtn.title = '';
    supportBtn.classList.remove('active');

    // Hide support page smoothly
    supportPage.classList.remove('active');
    setTimeout(() => {
      supportPage.style.display = 'none';
    }, 200);

    // Show loading spinner and hide iframe
    this.toggleLoadingState(true);

    // Set up one-time load handler for this navigation
    const handleLoad = () => {
      this.toggleLoadingState(false);
      iframe.removeEventListener('load', handleLoad);
    };

    iframe.addEventListener('load', handleLoad);

    // Set new URL
    iframe.src = url;
    iframe.style.display = 'block';

    // Update active button state
    toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Persist last selected model (URL) for optional restore
    try {
      window.saveManager?.saveLastSelectedModel(url);
    } catch { }

    // After switching, try to focus the search box inside the destination site
    this.focusSearchInIframe(iframe, url);
  }

  openCustomServiceUrl(payload = {}) {
    const { url, serviceId, actionId } = payload;
    const iframe = document.getElementById('main-iframe');
    const supportPage = document.getElementById('support-page');
    const splitViewBtn = document.getElementById('split-view-btn');
    const supportBtn = document.getElementById('support-btn');
    const toolbar = document.getElementById('toolbar');

    if (!url || !iframe || !supportPage || !splitViewBtn || !supportBtn || !toolbar) {
      return;
    }

    // Reset support view state
    splitViewBtn.disabled = false;
    splitViewBtn.title = '';
    supportBtn.classList.remove('active');
    supportPage.classList.remove('active');
    setTimeout(() => {
      supportPage.style.display = 'none';
    }, 200);

    // Show loading spinner and set iframe src
    this.toggleLoadingState(true);
    const fallbackTimer = setTimeout(() => {
      // If a provider blocks iframe embedding, offer a graceful escape hatch
      this.toggleLoadingState(false);
      try {
        chrome.runtime.sendMessage({ type: 'CUSTOM_SERVICE_FALLBACK_TAB', payload: { url } });
      } catch { }
    }, 4500);
    const handleLoad = () => {
      this.toggleLoadingState(false);
      clearTimeout(fallbackTimer);
      iframe.removeEventListener('load', handleLoad);
    };
    iframe.addEventListener('load', handleLoad);

    iframe.src = url;
    iframe.dataset.customServiceId = serviceId || '';
    iframe.dataset.customActionId = actionId || '';

    // Try to keep toolbar state in sync by marking the matching service button active
    toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    const selector = this.getButtonSelectorForService(serviceId);
    if (selector) {
      const btn = toolbar.querySelector(selector);
      if (btn) {
        btn.classList.add('active');
        this.smoothScrollToButton(toolbar, btn);
      }
    }

    this.focusSearchInIframe(iframe, url);
  }

  getButtonSelectorForService(serviceId) {
    if (!serviceId) return null;
    const match = SERVICE_PRESETS.find((svc) => svc.id === serviceId && svc.buttonSelector);
    return match?.buttonSelector || null;
  }

  handleSupportButtonClick(iframe, supportPage, toolbar, supportButton) {
    // Cancel any pending delayed navigation when opening support
    if (this._switchCommitTimer) {
      clearTimeout(this._switchCommitTimer);
      this._switchCommitTimer = null;
      this._pendingTarget = null;
    }
    // Handle support button click
    this.toggleLoadingState(false); // Hide spinner for support page
    iframe.style.display = 'none';

    // Show support page with smooth animation
    supportPage.style.display = 'flex';
    requestAnimationFrame(() => {
      supportPage.classList.add('active');
    });

    toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    supportButton.classList.add('active');
  }

  initializeLoadingState() {
    const loadingSpinner = document.querySelector('.loading-spinner');
    const iframe = document.getElementById('main-iframe');

    if (!loadingSpinner || !iframe) {
      console.error('Loading spinner or iframe not found for initialization');
      return;
    }

    // Initially show spinner and hide iframe
    this.toggleLoadingState(true);
  }

  toggleLoadingState(show) {
    const loadingSpinner = document.querySelector('.loading-spinner');
    const iframe = document.getElementById('main-iframe');

    if (loadingSpinner && iframe) {
      loadingSpinner.style.display = show ? 'block' : 'none';
      iframe.style.display = show ? 'none' : 'block';
    }
  }

  loadInitialUrl() {
    const iframe = document.getElementById('main-iframe');
  const firstVisibleButton = document.querySelector('.btn[data-url]:not([style*="display: none"])');
    const defaultUrl = "https://chatgpt.com/";

    if (!iframe) {
      console.error('Main iframe not found');
      return;
    }

    // Show loading state immediately
    this.toggleLoadingState(true);

    // Set up load handler before setting src
    const handleLoad = () => {
      this.toggleLoadingState(false);
      iframe.removeEventListener('load', handleLoad);
    };

    iframe.addEventListener('load', handleLoad);

    // Determine initial URL based on settings: remember last model if enabled
    let url = defaultUrl;
    try {
      const remember = localStorage.getItem('rememberLastModel') === 'true'; // default false
      const last = remember ? window.saveManager?.getLastSelectedModel?.() : null;
      if (remember && last) {
        // Ensure the button for the last URL is currently visible/enabled
        const matchBtn = document.querySelector(`.btn[data-url="${last}"]`);
        const isVisible = matchBtn && getComputedStyle(matchBtn).display !== 'none';
        if (isVisible) {
          url = last;
        } else if (firstVisibleButton) {
          url = firstVisibleButton.getAttribute('data-url');
        }
      } else if (firstVisibleButton) {
        url = firstVisibleButton.getAttribute('data-url');
      }
    } catch {
      url = firstVisibleButton ? firstVisibleButton.getAttribute('data-url') : defaultUrl;
    }
    iframe.src = url;

    // Add active class to the first visible button if it exists
    // Set active class to the button matching the chosen URL
  const activeBtn = document.querySelector(`.btn[data-url="${url}"]`) || firstVisibleButton;
    if (activeBtn) {
      document.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
      activeBtn.classList.add('active');
    }
  }

  initializeDragAndDrop() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) {
      console.error('Toolbar not found for drag and drop initialization');
      return;
    }

    let draggedElement = null;

    // Remove existing delegated listeners to prevent duplicates
    if (toolbar.dragAndDropInitialized) {
      return; // Already initialized
    }

    // Use event delegation for drag and drop to handle dynamic content
    toolbar.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('btn')) {
        draggedElement = e.target;
        draggedElement.classList.add('dragging');

        // Create ghost image
        const ghostImage = e.target.cloneNode(true);
        ghostImage.style.position = 'absolute';
        ghostImage.style.top = '-1000px';
        document.body.appendChild(ghostImage);

        // Remove ghost image after drag starts
        requestAnimationFrame(() => {
          if (document.body.contains(ghostImage)) {
            document.body.removeChild(ghostImage);
          }
        });
      }
    });

    toolbar.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('btn')) {
        draggedElement?.classList.remove('dragging');
        toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('drag-over'));
        draggedElement = null;
      }
    });

    toolbar.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedElement || e.target === draggedElement) return;

      const dropTarget = e.target.closest('.btn');
      if (dropTarget && dropTarget !== draggedElement) {
        dropTarget.classList.add('drag-over');
      }
    });

    toolbar.addEventListener('dragleave', (e) => {
      const dropTarget = e.target.closest('.btn');
      if (dropTarget) {
        dropTarget.classList.remove('drag-over');
      }
    });

    toolbar.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedElement) return;

      const dropTarget = e.target.closest('.btn');
      if (!dropTarget || dropTarget === draggedElement) return;

      // Get positions and reorder elements
      const allButtons = [...toolbar.querySelectorAll('.btn')];
      const draggedPos = allButtons.indexOf(draggedElement);
      const dropPos = allButtons.indexOf(dropTarget);

      if (draggedPos < dropPos) {
        dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling);
      } else {
        dropTarget.parentNode.insertBefore(draggedElement, dropTarget);
      }

      // Modified save order logic to include split-view-btn and custom links
      const newOrder = [...toolbar.querySelectorAll('.btn')]
        .map(btn => {
          if (btn.id === 'support-btn') return 'support';
          if (btn.id === 'split-view-btn') return 'split-view';
          if (btn.id === 'content-extractor-btn') return 'content-extractor';
          return btn.getAttribute('data-url');
        })
        .filter(url => url !== null && url !== undefined && url !== ''); // Filter out null/undefined/empty values

      if (window.saveManager) {
        window.saveManager.saveButtonOrder(newOrder);
      } else {
        localStorage.setItem('buttonOrder', JSON.stringify(newOrder));
      }

      dropTarget.classList.remove('drag-over');
    });

    // Ensure all buttons are draggable
    toolbar.querySelectorAll('.btn').forEach(button => {
      button.setAttribute('draggable', 'true');
    });

    // Mark as initialized
    toolbar.dragAndDropInitialized = true;
  }

  initializePremiumScrolling() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) {
      console.error('Toolbar not found for premium scrolling initialization');
      return;
    }

    // Create scroll indicator elements
    const scrollIndicator = document.createElement('div');
    scrollIndicator.className = 'toolbar-scroll-indicator';
    toolbar.appendChild(scrollIndicator);

    // Create fade overlay elements for better scroll indication
    const leftFade = document.createElement('div');
    leftFade.className = 'toolbar-scroll-fade-left';
    toolbar.appendChild(leftFade);

    const rightFade = document.createElement('div');
    rightFade.className = 'toolbar-scroll-fade-right';
    toolbar.appendChild(rightFade);

    // Create enhanced border element
    const borderElement = document.createElement('div');
    borderElement.className = 'toolbar-border';
    toolbar.appendChild(borderElement);

    // Create scroll hint element
    const scrollHint = document.createElement('div');
    scrollHint.className = 'toolbar-scroll-hint';
    toolbar.appendChild(scrollHint);

    let scrollTimeout;
    let isScrolling = false;
    let rafId;
    let userHasInteracted = false;

    // Function to hide hint after user interaction
    const hideScrollHint = () => {
      if (!userHasInteracted) {
        userHasInteracted = true;
        toolbar.classList.add('user-interacted');
      }
    };

    // Enhanced scroll event handler with premium feedback
    const handleScroll = () => {
      hideScrollHint(); // Hide hint on first scroll

      if (!isScrolling) {
        isScrolling = true;
        toolbar.classList.add('scrolling');

        // Cancel any existing RAF
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
      }

      // Update scroll indicators
      this.updateScrollIndicators(toolbar);

      // Clear existing timeout
      clearTimeout(scrollTimeout);

      // Set timeout to end scrolling state
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        toolbar.classList.remove('scrolling');
        rafId = requestAnimationFrame(() => {
          this.updateScrollIndicators(toolbar);
        });
      }, 150);
    };

    // Passive scroll listener for better performance
    toolbar.addEventListener('scroll', handleScroll, { passive: true });

    // Enhanced wheel event for smooth horizontal scrolling
    toolbar.addEventListener('wheel', (e) => {
      hideScrollHint(); // Hide hint on wheel interaction

      // Check if it's a horizontal scroll or if we should convert vertical to horizontal
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Already horizontal scroll, let it happen naturally
        return;
      }

      // Convert vertical wheel to horizontal scroll for better UX
      e.preventDefault();

      // More responsive scrolling with adaptive sensitivity
      const sensitivity = e.ctrlKey ? 0.5 : 1.2; // Slower when Ctrl is held for precision
      const scrollAmount = e.deltaY * sensitivity;

      // Check for bounds to provide gentle bounce feedback
      const currentScroll = toolbar.scrollLeft;
      const maxScroll = toolbar.scrollWidth - toolbar.clientWidth;

      if ((currentScroll <= 0 && scrollAmount < 0) ||
        (currentScroll >= maxScroll && scrollAmount > 0)) {
        // At bounds - provide subtle bounce feedback
        toolbar.style.transform = `translateX(${scrollAmount > 0 ? -2 : 2}px)`;
        requestAnimationFrame(() => {
          toolbar.style.transform = '';
        });
        return;
      }

      toolbar.scrollBy({
        left: scrollAmount,
        behavior: 'auto' // Immediate response for better feel
      });
    });

    // Touch events for mobile premium scrolling
    let touchStartX = 0;
    let touchVelocity = 0;
    let lastTouchTime = 0;

    toolbar.addEventListener('touchstart', (e) => {
      hideScrollHint(); // Hide hint on touch interaction
      touchStartX = e.touches[0].clientX;
      lastTouchTime = Date.now();
      touchVelocity = 0;
    }, { passive: true });

    toolbar.addEventListener('touchmove', (e) => {
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTouchTime;
      const deltaX = e.touches[0].clientX - touchStartX;

      if (deltaTime > 0) {
        touchVelocity = deltaX / deltaTime;
      }

      lastTouchTime = currentTime;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    toolbar.addEventListener('touchend', () => {
      // Apply momentum scrolling based on velocity
      if (Math.abs(touchVelocity) > 0.5) {
        const momentum = touchVelocity * 300;
        toolbar.scrollBy({
          left: -momentum, // Negative for natural touch direction
          behavior: 'smooth'
        });
      }
    }, { passive: true });

    // Initial indicator state and show hint if scrollable
    this.updateScrollIndicators(toolbar);

    // Show scroll hint if toolbar is scrollable (after a short delay for better UX)
    setTimeout(() => {
      const isScrollable = toolbar.scrollWidth > toolbar.clientWidth;
      if (isScrollable && !userHasInteracted) {
        scrollHint.style.opacity = '1';
      }
    }, 500);

    // Update indicators when toolbar content changes
    const observer = new MutationObserver(() => {
      // Small delay to allow layout to settle
      setTimeout(() => this.updateScrollIndicators(toolbar), 100);
    });

    observer.observe(toolbar, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });

    // Keyboard navigation support
    toolbar.addEventListener('keydown', (e) => {
      const activeButton = document.activeElement;
      if (!activeButton || !activeButton.classList.contains('btn')) return;

      hideScrollHint(); // Hide hint on keyboard interaction

      const buttons = [...toolbar.querySelectorAll('.btn:not([style*="display: none"])')];
      const currentIndex = buttons.indexOf(activeButton);
      let targetIndex;

      switch (e.key) {
        case 'ArrowLeft':
          targetIndex = Math.max(0, currentIndex - 1);
          break;
        case 'ArrowRight':
          targetIndex = Math.min(buttons.length - 1, currentIndex + 1);
          break;
        case 'Home':
          targetIndex = 0;
          break;
        case 'End':
          targetIndex = buttons.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      const targetButton = buttons[targetIndex];
      if (targetButton) {
        targetButton.focus();
        this.smoothScrollToButton(toolbar, targetButton);
      }
    });
  }

  updateScrollIndicators(toolbar) {
    const scrollLeft = toolbar.scrollLeft;
    const scrollWidth = toolbar.scrollWidth;
    const clientWidth = toolbar.clientWidth;
    const maxScroll = scrollWidth - clientWidth;

    // Update scroll classes for gradient indicators
    toolbar.classList.toggle('scroll-left', scrollLeft > 5);
    toolbar.classList.toggle('scroll-right', scrollLeft < maxScroll - 5);

    // Update scroll progress indicator
    const indicator = toolbar.querySelector('.toolbar-scroll-indicator');
    if (indicator && maxScroll > 0) {
      const progress = scrollLeft / maxScroll;
      const indicatorWidth = (clientWidth / scrollWidth) * 100;
      const indicatorLeft = progress * (100 - indicatorWidth);

      indicator.style.width = `${indicatorWidth}%`;
      indicator.style.left = `${indicatorLeft}%`;
    }
  }

  smoothScrollToButton(toolbar, button) {
    const buttonRect = button.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const buttonCenter = buttonRect.left + buttonRect.width / 2;
    const toolbarCenter = toolbarRect.left + toolbarRect.width / 2;
    const offset = buttonCenter - toolbarCenter;

    toolbar.scrollBy({
      left: offset,
      behavior: 'smooth'
    });
  }

  updateScrollbarVisibility(alwaysVisible) {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) {
      console.error('Toolbar not found for scrollbar visibility update');
      return;
    }

    if (alwaysVisible) {
      toolbar.classList.remove('scrollbar-hover-only');
    } else {
      toolbar.classList.add('scrollbar-hover-only');
    }

    // Update scroll indicators to account for potential scrollbar position changes
    requestAnimationFrame(() => {
      this.updateScrollIndicators(toolbar);
    });
  }

  // Switch to next/previous visible model button (excluding non-model controls)
  switchModel(direction = 1) {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;

    // Helper function to check if button is actually visible
    const isVisible = (btn) => {
      if (!btn) return false;
      const style = btn.style.display;
      const computed = getComputedStyle(btn).display;
      return style !== 'none' && computed !== 'none';
    };

    // Get candidates in current DOM order (which reflects drag-and-drop changes)
    let candidates = [...toolbar.querySelectorAll('.btn[data-url]')].filter(isVisible);

    if (candidates.length === 0) return;

    const active = toolbar.querySelector('.btn.active');
    let idx = candidates.indexOf(active); // -1 if none

    // If active class is out of sync, derive current index from iframe URL host
    const iframeForIndex = document.getElementById('main-iframe');
    if (idx === -1 && iframeForIndex && iframeForIndex.src) {
      try {
        const currentHost = new URL(iframeForIndex.src).hostname;
        idx = candidates.findIndex((btn) => {
          try {
            const candUrl = btn.getAttribute('data-url');
            if (!candUrl) return false;
            const candHost = new URL(candUrl).hostname;
            return currentHost === candHost || iframeForIndex.src.includes(candHost);
          } catch { return false; }
        });
      } catch { }
    }

    idx = (idx + direction + candidates.length) % candidates.length;
    const target = candidates[idx];

    if (target) {
      // Visually update navbar immediately (do NOT change iframe yet)
      toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');

      // Smooth scroll selected into view
      this.smoothScrollToButton(toolbar, target);

      // Set pending target and debounce the actual navigation
      this._pendingTarget = target;
      if (this._switchCommitTimer) {
        clearTimeout(this._switchCommitTimer);
        this._switchCommitTimer = null;
      }

      this._switchCommitTimer = setTimeout(() => {
        const btn = this._pendingTarget;
        this._switchCommitTimer = null;
        // Commit: now navigate iframe using existing click handler logic
        if (btn && document.body.contains(btn)) {
          const iframe = document.getElementById('main-iframe');
          const supportPage = document.getElementById('support-page');
          const splitViewBtn = document.getElementById('split-view-btn');
          const supportBtn = document.getElementById('support-btn');
          this.handleServiceButtonClick(btn, iframe, supportPage, splitViewBtn, supportBtn, toolbar);
          try { window.saveManager?.saveLastSelectedModel(btn.getAttribute('data-url')); } catch {}
        }
      }, this._shortcutNavDelay);
    }
  }

  // Best-effort focus of search input in known providers inside iframe
  focusSearchInIframe(iframe, url) {
    if (!iframe) return;
    // Delay a bit to allow navigation to occur; further attempts will run on iframe load
    const attempt = () => {
      try {
        // Best-effort: focus the frame so typing goes into the site
        iframe.focus();
        iframe.contentWindow?.focus();
        // Additionally, send a generic postMessage that some sites might handle (safe no-op otherwise)
        iframe.contentWindow?.postMessage({ type: 'AI_SIDE_PANEL_FOCUS_SEARCH' }, '*');
      } catch { }
    };
    setTimeout(attempt, 300);

    // Also set up a one-time listener to try again after load spinner hides
    const onLoad = () => {
      attempt();
      iframe.removeEventListener('load', onLoad);
    };
    iframe.addEventListener('load', onLoad, { once: true });
  }
}
