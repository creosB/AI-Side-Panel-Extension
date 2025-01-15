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
      'copilot': '[data-url*="copilot.microsoft.com"]'
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
      const selector = {
        'chatgpt': '[data-url*="chat.openai.com"]',
        'gemini': '[data-url*="gemini.google.com"]',
        'claude': '[data-url*="claude.ai"]',
        'copilot': '[data-url*="copilot.microsoft.com"]'
      }[service];

      // Count how many toggles are currently enabled
      const enabledCount = Array.from(document.querySelectorAll('.toggle-item input[type="checkbox"]'))
        .filter(t => t.checked).length;

      // If trying to disable the last enabled toggle, prevent it
      if (!this.checked && enabledCount === 0) {
        this.checked = true;
        return;
      }

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
        const ghostImage = draggedElement.cloneNode(true);
        ghostImage.style.position = 'absolute';
        ghostImage.style.top = '-1000px';
        document.body.appendChild(ghostImage);
        e.dataTransfer.setDragImage(ghostImage, 0, 0);
        
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
  
        // Get positions
        const allButtons = [...toolbar.querySelectorAll('.btn')];
        const draggedPos = allButtons.indexOf(draggedElement);
        const dropPos = allButtons.indexOf(dropTarget);
  
        // Reorder elements
        if (draggedPos < dropPos) {
          dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling);
        } else {
          dropTarget.parentNode.insertBefore(draggedElement, dropTarget);
        }
  
        // Save new order
        const newOrder = [...toolbar.querySelectorAll('.btn')].map(btn => 
          btn.id === 'support-btn' ? 'support' : btn.getAttribute('data-url')
        );
        localStorage.setItem('buttonOrder', JSON.stringify(newOrder));
  
        // Clean up
        dropTarget.classList.remove('drag-over');
      });
    });
  
    // Restore order on load
    const savedOrder = localStorage.getItem('buttonOrder');
    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        order.forEach(url => {
          const btn = url === 'support' 
            ? document.getElementById('support-btn')
            : document.querySelector(`[data-url="${url}"]`);
          if (btn) toolbar.appendChild(btn);
        });
      } catch (error) {
        console.error('Error restoring button order:', error);
        localStorage.removeItem('buttonOrder');
      }
    }
  }

  initializeDragAndDrop();
  initializeToggles();

  

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

