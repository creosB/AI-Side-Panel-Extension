// Split View Module
export class SplitViewManager {
  constructor() {
    this.splitView = false;
    this.cleanupResizer = null;
  }

  initialize() {
    const splitViewBtn = document.getElementById('split-view-btn');
    const supportBtn = document.getElementById('support-btn');

    if (!splitViewBtn || !supportBtn) {
      console.error('Required elements not found for split view initialization');
      return;
    }

    // Disable split view button when support page is visible
    supportBtn.addEventListener('click', () => {
      splitViewBtn.disabled = true;
      splitViewBtn.title = 'Exit settings first';
    });

    splitViewBtn.addEventListener('click', () => {
      this.toggleSplitView();
    });
  }

  toggleSplitView() {
    const splitViewBtn = document.getElementById('split-view-btn');
    const iframeContainer = document.querySelector('.content');
    const iframe = document.getElementById('main-iframe');
    const supportBtn = document.getElementById('support-btn');

    this.splitView = !this.splitView;

    // Disable/enable support button based on split view state
    supportBtn.disabled = this.splitView;
    if (this.splitView) {
      supportBtn.title = 'Exit split view first';
    } else {
      supportBtn.title = '';
    }

    if (this.splitView) {
      this.enableSplitView(iframeContainer, iframe);
    } else {
      this.disableSplitView(iframeContainer, iframe);
    }
  }

  enableSplitView(iframeContainer, iframe) {
    // Add split view class for styling
    iframeContainer.classList.add('split-view');

    // Create second iframe with proper attributes and more secure sandbox
    const secondIframe = document.createElement('iframe');
    secondIframe.id = 'second-iframe';
    secondIframe.frameBorder = '0';
    secondIframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    secondIframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-downloads allow-popups');


    // Create drop target first
    const dropTarget = document.createElement('div');
    dropTarget.id = 'drop-target';
    iframeContainer.appendChild(dropTarget);

    // Initialize drop target before adding iframe
    this.initializeDropTarget(dropTarget, secondIframe);

    // Add second iframe but keep it hidden initially
    secondIframe.style.display = 'none';
    iframeContainer.appendChild(secondIframe);

    // Create resizer only once and keep it hidden initially
    if (!document.querySelector('.resizer')) {
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      resizer.style.display = 'none';
      iframeContainer.insertBefore(resizer, secondIframe);
    }

    // Add close button for second iframe
    this.addCloseButton(iframeContainer, iframe);

    secondIframe.addEventListener('load', () => {
      const closeButton = document.getElementById('close-second-iframe');
      if (closeButton) {
        closeButton.style.display = 'block';
      }
    });
  }

  disableSplitView(iframeContainer, iframe) {
    // Remove split view class
    iframeContainer.classList.remove('split-view');

    // Reset main iframe width
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    // Remove all split view related elements
    const elements = ['second-iframe', 'drop-target', 'resizer', 'close-second-iframe'];
    elements.forEach(id => {
      const element = id === 'resizer' ?
        document.querySelector('.resizer') :
        document.getElementById(id);
      if (element) element.remove();
    });

    // Clean up resizer if it exists
    if (this.cleanupResizer) {
      this.cleanupResizer();
      this.cleanupResizer = null;
    }
  }

  addCloseButton(iframeContainer, iframe) {
    const closeButton = document.createElement('button');
    closeButton.id = 'close-second-iframe';
    closeButton.className = 'close-button';
    closeButton.innerHTML = '✕';
    closeButton.style.display = 'none';
    iframeContainer.appendChild(closeButton);

    // Position the close button
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.zIndex = '100';

    // Handle close button click
    closeButton.addEventListener('click', () => {
      // Remove the second iframe
      if (document.getElementById('second-iframe')) {
        document.getElementById('second-iframe').remove();
      }
      // Remove the drop target
      if (document.getElementById('drop-target')) {
        document.getElementById('drop-target').remove();
      }
      // Hide the resizer
      const resizer = document.querySelector('.resizer');
      if (resizer) {
        resizer.style.display = 'none';
      }
      // Hide the close button
      closeButton.style.display = 'none';

      // Reset the width of the main iframe
      iframe.style.width = '100%';

      // exit split view mode
      this.splitView = false;
      iframeContainer.classList.remove('split-view');

      // Re-enable support/settings button and any navbar controls that were disabled
      try {
        const supportBtn = document.getElementById('support-btn');
        const splitViewBtn = document.getElementById('split-view-btn');
        if (supportBtn) {
          supportBtn.disabled = false;
          supportBtn.title = '';
        }
        if (splitViewBtn) {
          // Ensure split view button is in a consistent state (not toggled)
          splitViewBtn.disabled = false;
          splitViewBtn.title = 'Split View';
        }

        // If settings manager exposed controls, notify it to update UI (non-fatal)
        if (window.settingsManager && typeof window.settingsManager.updateControlStates === 'function') {
          window.settingsManager.updateControlStates();
        }
      } catch (e) {
      }
    });
  }

  initializeDropTarget(dropTarget, secondIframe) {
    dropTarget.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="2" width="20" height="20" rx="2" stroke="#00ff9d" stroke-width="2"/>
        <line x1="12" y1="6" x2="12" y2="18" stroke="#00ff9d" stroke-width="2"/>
        <line x1="6" y1="12" x2="18" y2="12" stroke="#00ff9d" stroke-width="2"/>
      </svg>
      <div class="drop-target-text">Add Another AI</div>
      <div class="drop-target-subtext">Drag an AI icon here</div>
    `;

    let dragEnterCount = 0;

    dropTarget.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragEnterCount++;
      if (dragEnterCount === 1) {
        dropTarget.classList.add('drag-over');
      }
    });

    dropTarget.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragEnterCount--;
      if (dragEnterCount === 0) {
        dropTarget.classList.remove('drag-over');
      }
    });

    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      dragEnterCount = 0;
      dropTarget.classList.remove('drag-over');
      const draggedElement = document.querySelector('.dragging');
      if (draggedElement && draggedElement.getAttribute('data-url')) {
        const url = draggedElement.getAttribute('data-url');

        // Show the iframe and resizer
        secondIframe.style.display = 'block';
        const resizer = document.querySelector('.resizer');
        if (resizer) resizer.style.display = 'block';

        // Set the URL and initialize resizer
        secondIframe.src = url;
        this.cleanupResizer = this.initializeResizer(document.getElementById('main-iframe'), secondIframe);

        // Animate and remove drop target
        dropTarget.style.transform = 'scale(0.9)';
        dropTarget.style.opacity = '0';
        setTimeout(() => {
          dropTarget.remove();
        }, 300);
      }
    });
  }

  initializeResizer(iframe1, iframe2) {
    const container = iframe1.parentNode;
    let resizer = container.querySelector('.resizer');

    if (!resizer) {
      resizer = document.createElement('div');
      resizer.className = 'resizer';
      container.insertBefore(resizer, iframe2);
    }

    let isResizing = false;
    let startX, startWidth;

    // Pre-calculate static values
    const minPercentage = 20;
    const maxPercentage = 80;

    const startResize = (e) => {
      isResizing = true;
      startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
      startWidth = iframe1.getBoundingClientRect().width;

      // Add resizing class to container only
      container.classList.add('resizing');

      // Disable pointer events on iframes
      iframe1.style.pointerEvents = 'none';
      iframe2.style.pointerEvents = 'none';
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      container.classList.remove('resizing');

      // Re-enable pointer events
      iframe1.style.pointerEvents = '';
      iframe2.style.pointerEvents = '';
    };

    const resize = (e) => {
      if (!isResizing) return;

      // Use requestAnimationFrame
      requestAnimationFrame(() => {
        const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
        const delta = clientX - startX;
        const containerWidth = container.clientWidth;

        // Calculate new width percentage directly
        let percentage = ((startWidth + delta) / containerWidth) * 100;

        // Clamp percentage between min and max
        percentage = Math.max(minPercentage, Math.min(maxPercentage, percentage));

        // Apply width changes directly
        iframe1.style.width = `${percentage}%`;
        iframe2.style.width = `${100 - percentage}%`;
      });
    };

    // Clean up old event listeners
    const cleanupEvents = () => {
      resizer.removeEventListener('mousedown', startResize);
      resizer.removeEventListener('touchstart', startResize);
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', resize);
      document.removeEventListener('touchend', stopResize);
    };

    // Remove old event listeners
    cleanupEvents();

    // Add optimized event listeners
    resizer.addEventListener('mousedown', startResize, { passive: true });
    resizer.addEventListener('touchstart', startResize, { passive: true });

    // Use capture phase for better performance
    document.addEventListener('mousemove', resize, { passive: true });
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', resize, { passive: true });
    document.addEventListener('touchend', stopResize);

    // Clean up function for when component unmounts
    return cleanupEvents;
  }
}
