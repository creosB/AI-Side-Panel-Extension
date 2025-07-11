// Navigation Bar Module
export class NavBarManager {
  constructor() {
    this.init();
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
  }

  handleServiceButtonClick(button, iframe, supportPage, splitViewBtn, supportBtn, toolbar) {
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
  }

  handleSupportButtonClick(iframe, supportPage, toolbar, supportButton) {
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

    // Set the URL (either from visible button or default)
    const url = firstVisibleButton ? firstVisibleButton.getAttribute('data-url') : defaultUrl;
    iframe.src = url;

    // Add active class to the first visible button if it exists
    if (firstVisibleButton) {
      document.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
      firstVisibleButton.classList.add('active');
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
      const newOrder = [...toolbar.querySelectorAll('.btn')].map(btn => {
        if (btn.id === 'support-btn') return 'support';
        if (btn.id === 'split-view-btn') return 'split-view';
        return btn.getAttribute('data-url');
      });
      
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

    // Create scroll indicator element
    const scrollIndicator = document.createElement('div');
    scrollIndicator.className = 'toolbar-scroll-indicator';
    toolbar.appendChild(scrollIndicator);

    // Create enhanced border element
    const borderElement = document.createElement('div');
    borderElement.className = 'toolbar-border';
    toolbar.appendChild(borderElement);

    let scrollTimeout;
    let isScrolling = false;
    let rafId;

    // Enhanced scroll event handler with premium feedback
    const handleScroll = () => {
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

    // Wheel event for enhanced scroll feedback and horizontal scrolling
    toolbar.addEventListener('wheel', (e) => {
      // Prevent vertical scrolling and enable horizontal scrolling
      e.preventDefault();
      
      // Convert vertical wheel to horizontal scroll
      const scrollAmount = e.deltaY * 2; // Increase sensitivity
      toolbar.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
      
      // Add subtle visual feedback during wheel scroll
      toolbar.style.transform = `translateY(${Math.sin(Date.now() * 0.01) * 0.5}px)`;
      
      requestAnimationFrame(() => {
        toolbar.style.transform = '';
      });
    });

    // Touch events for mobile premium scrolling
    let touchStartX = 0;
    let touchVelocity = 0;
    let lastTouchTime = 0;

    toolbar.addEventListener('touchstart', (e) => {
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
          left: momentum,
          behavior: 'smooth'
        });
      }
    }, { passive: true });

    // Initial indicator state
    this.updateScrollIndicators(toolbar);
    
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
}
