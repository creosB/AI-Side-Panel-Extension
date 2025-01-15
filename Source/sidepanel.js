document.addEventListener('DOMContentLoaded', function () {
  const buttons = document.querySelectorAll('.btn[data-url]');
  const iframe = document.querySelector('iframe');
  const supportBtn = document.getElementById('support-btn');
  const supportPage = document.getElementById('support-page');

  function loadInitialUrl() {
    // Get the first visible button based on both order and visibility
    const firstVisibleButton = document.querySelector('.btn[data-url]:not([style*="display: none"])');
    if (firstVisibleButton) {
      const url = firstVisibleButton.getAttribute('data-url');
      iframe.src = url;
      // Remove active class from all buttons
      buttons.forEach(btn => btn.classList.remove('active'));
      // Add active class to first visible button
      firstVisibleButton.classList.add('active');
    }
  }

  function initializeToggles() {
    const toggles = {
      'chatgpt': '[data-url*="chat.openai.com"]',
      'gemini': '[data-url*="gemini.google.com"]',
      'claude': '[data-url*="claude.ai"]',
      'copilot': '[data-url*="copilot.microsoft.com"]',
      'split-view': '#split-view-btn'
    };

    Object.entries(toggles).forEach(([key, selector]) => {
      const isVisible = localStorage.getItem(`show_${key}`) !== 'false';
      const toggle = document.getElementById(`toggle-${key}`);
      const button = document.querySelector(selector);

      if (toggle) {
        toggle.checked = isVisible;
      }

      if (button) {
        button.style.display = isVisible ? 'flex' : 'none';
      }
    });

    // Load initial URL after setting visibility
    loadInitialUrl();


    // Open the first visible button's URL
    const firstVisibleButton = document.querySelector('.btn[data-url]:not([style*="display: none"])');
    if (firstVisibleButton) {
      const url = firstVisibleButton.getAttribute('data-url');
      const iframe = document.querySelector('iframe');
      iframe.src = url;
      firstVisibleButton.classList.add('active');
    }
  }

  document.querySelectorAll('.toggle-item input[type="checkbox"]').forEach(toggle => {
    toggle.addEventListener('change', function () {
      const service = this.id.replace('toggle-', '');

      // Count only service toggles (excluding split-view and support)
      const enabledServicesCount = Array.from(
        document.querySelectorAll('.toggle-item input[type="checkbox"]')
      ).filter(t => {
        const toggleService = t.id.replace('toggle-', '');
        return t.checked && ['chatgpt', 'gemini', 'claude', 'copilot'].includes(toggleService);
      }).length;

      // Prevent disabling last service
      if (!this.checked && enabledServicesCount === 0 && ['chatgpt', 'gemini', 'claude', 'copilot'].includes(service)) {
        this.checked = true;
        return;
      }

      const selector = {
        'chatgpt': '[data-url*="chat.openai.com"]',
        'gemini': '[data-url*="gemini.google.com"]',
        'claude': '[data-url*="claude.ai"]',
        'copilot': '[data-url*="copilot.microsoft.com"]',
        'split-view': '#split-view-btn'
      }[service];

      const button = document.querySelector(selector);
      if (button) {
        button.style.display = this.checked ? 'flex' : 'none';
        localStorage.setItem(`show_${service}`, this.checked);
      }
    });
  });



  function initializeDragAndDrop() {
    const toolbar = document.getElementById('toolbar');
    const buttons = toolbar.querySelectorAll('.btn');
    let draggedElement = null;

    buttons.forEach(button => {
      button.setAttribute('draggable', 'true');

      button.addEventListener('dragstart', (e) => {
        draggedElement = e.target;

        // Add dragging class immediately
        draggedElement.classList.add('dragging');

        // Create ghost image
        const ghostImage = e.target.cloneNode(true);
        ghostImage.style.position = 'absolute';
        ghostImage.style.top = '-1000px';

        // Remove ghost image after drag starts
        requestAnimationFrame(() => {
          document.body.removeChild(ghostImage);
        });
      });

      button.addEventListener('dragend', (e) => {
        draggedElement.classList.remove('dragging');
        buttons.forEach(btn => btn.classList.remove('drag-over'));
        draggedElement = null;
      });

      button.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedElement || e.target === draggedElement) return;

        const dropTarget = e.target.closest('.btn');
        if (dropTarget && dropTarget !== draggedElement) {
          dropTarget.classList.add('drag-over');
        }
      });

      button.addEventListener('dragleave', (e) => {
        const dropTarget = e.target.closest('.btn');
        if (dropTarget) {
          dropTarget.classList.remove('drag-over');
        }
      });

      button.addEventListener('drop', (e) => {
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

        // Modified save order logic to include split-view-btn
        const newOrder = [...toolbar.querySelectorAll('.btn')].map(btn => {
          if (btn.id === 'support-btn') return 'support';
          if (btn.id === 'split-view-btn') return 'split-view';
          return btn.getAttribute('data-url');
        });
        localStorage.setItem('buttonOrder', JSON.stringify(newOrder));

        dropTarget.classList.remove('drag-over');
      });
    });

    // Modified restore order logic
    const savedOrder = localStorage.getItem('buttonOrder');
    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        order.forEach(url => {
          const btn = url === 'support' ? document.getElementById('support-btn') :
            url === 'split-view' ? document.getElementById('split-view-btn') :
              document.querySelector(`[data-url="${url}"]`);
          if (btn) toolbar.appendChild(btn);
        });
      } catch (error) {
        console.error('Error restoring button order:', error);
        localStorage.removeItem('buttonOrder');
      }
    }
  }

  function initializeSplitView() {
    const splitViewBtn = document.getElementById('split-view-btn');
    const iframeContainer = document.querySelector('.content');
    const iframe = document.getElementById('main-iframe');
    const supportBtn = document.getElementById('support-btn');

    let splitView = false;

    // Disable split view button when support page is visible
    supportBtn.addEventListener('click', function () {
      splitViewBtn.disabled = true;
      splitViewBtn.title = 'Exit settings first';
    });

    // Re-enable split view button when returning to main view
    buttons.forEach(button => {
      button.addEventListener('click', function () {
        splitViewBtn.disabled = false;
        splitViewBtn.title = '';
        supportBtn.classList.remove('active');
      });
    });

    splitViewBtn.addEventListener('click', function () {


      splitView = !splitView;

      // Disable/enable support button based on split view state
      supportBtn.disabled = splitView;
      if (splitView) {
        supportBtn.title = 'Exit split view first';
      } else {
        supportBtn.title = '';
      }

      if (splitView) {
        // Add split view class for styling
        iframeContainer.classList.add('split-view');

        // Create second iframe with proper attributes and more secure sandbox
        const secondIframe = document.createElement('iframe');
        secondIframe.id = 'second-iframe';
        secondIframe.src = '';
        secondIframe.frameBorder = '0';
        secondIframe.allow = 'clipboard-read; clipboard-write';
        secondIframe.sandbox = "allow-scripts allow-forms allow-same-origin";

        // Create drop target first
        const dropTarget = document.createElement('div');
        dropTarget.id = 'drop-target';
        iframeContainer.appendChild(dropTarget);

        // Initialize drop target before adding iframe
        initializeDropTarget(dropTarget, secondIframe);

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
        closeButton.addEventListener('click', function () {
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
          splitView = false;
          iframeContainer.classList.remove('split-view');
        });

        secondIframe.addEventListener('load', function () {
          closeButton.style.display = 'block';
        });

      } else {
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
      }
    });
  }

  function initializeDropTarget(dropTarget, secondIframe) {
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
        initializeResizer(document.getElementById('main-iframe'), secondIframe);

        // Animate and remove drop target
        dropTarget.style.transform = 'scale(0.9)';
        dropTarget.style.opacity = '0';
        setTimeout(() => {
          dropTarget.remove();
        }, 300);
      }
    });
  }

  function initializeResizer(iframe1, iframe2) {
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


  initializeDragAndDrop();
  initializeToggles();
  initializeSplitView();

  buttons.forEach(button => {
    button.addEventListener('click', function () {
      const url = this.getAttribute('data-url');
      iframe.src = url;
      iframe.style.display = 'block';
      supportPage.style.display = 'none';

      // Remove active class from all buttons
      buttons.forEach(btn => btn.classList.remove('active'));
      // Add active class to clicked button
      this.classList.add('active');
    });
  });

  supportBtn.addEventListener('click', function () {
    iframe.style.display = 'none';
    supportPage.style.display = 'flex';

    // Remove active class from all buttons
    buttons.forEach(btn => btn.classList.remove('active'));
    // Add active class to support button
    this.classList.add('active');
  });

  function initializeShortcutSettings() {
    const changeShortcutBtn = document.getElementById('change-shortcut');

    changeShortcutBtn.addEventListener('click', function () {
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

  initializeShortcutSettings();
});


