document.addEventListener('DOMContentLoaded', function () {
    const buttons = document.querySelectorAll('.btn[data-url]');
    const iframe = document.querySelector('iframe');
    const supportBtn = document.getElementById('support-btn');
    const supportPage = document.getElementById('support-page');
  
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
    }
  
    document.querySelectorAll('.toggle-item input[type="checkbox"]').forEach(toggle => {
      toggle.addEventListener('change', function() {
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
      
      changeShortcutBtn.addEventListener('click', function() {
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
  
  