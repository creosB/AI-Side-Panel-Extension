/**
 * NeuralNav - Bundled Version
 * All-in-one content script for AI conversation navigation
 * Supports: ChatGPT, Gemini, Claude, Qwen, Copilot, Kimi, Zai, DeepSeek
 */

(function () {
    'use strict';

    // Prevent double loading
    if (window.__NeuralNavLoaded) {
        try {
            console.log(chrome.i18n.getMessage('neuralNavAlreadyLoaded'));
        } catch (_) {
            console.log('Prompt History: Already loaded, skipping');
        }
        return;
    }
    window.__NeuralNavLoaded = true;

    // ============================================
    // CONFIG
    // ============================================
    const CONFIG = {
        DEBOUNCE_SCAN: 800,
        DEBOUNCE_SCROLL: 100,
        DEBOUNCE_SEARCH: 300,
        INITIAL_SCAN_DELAY: 1500,
        PREVIEW_LENGTH: 100,
        INTERSECTION_THRESHOLD: 0.3,
        MAX_RETRIES: 3
    };

    const ICONS = {
        chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
        hash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`,
        menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
        search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
        logo: null // Will be set dynamically with chrome.runtime.getURL
    };

    // ============================================
    // UTILITIES
    // ============================================
    function isExtensionContextInvalidated(error) {
        try {
            const parts = [];
            try { if (error?.message) parts.push(String(error.message)); } catch (_) { }
            try { if (error?.stack) parts.push(String(error.stack)); } catch (_) { }
            try { parts.push(String(error)); } catch (_) { }
            const haystack = parts.filter(Boolean).join('\n');
            return /Extension context invalidated/i.test(haystack)
                || /The message port closed before a response was received/i.test(haystack)
                || /Receiving end does not exist/i.test(haystack);
        } catch (_) {
            return false;
        }
    }

    function safeI18n(key, fallback) {
        try {
            return chrome?.i18n?.getMessage(key) || fallback || key;
        } catch (_) {
            return fallback || key;
        }
    }

    function isRuntimeAlive() {
        try {
            return !!(chrome?.runtime?.id);
        } catch (_) {
            return false;
        }
    }

    function safeRuntimeGetURL(path) {
        try {
            return chrome?.runtime?.getURL(path) || '';
        } catch (_) {
            return '';
        }
    }

    function debounce(fn, delay) {
        let timer = null;
        const debounced = function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
        debounced.cancel = () => clearTimeout(timer);
        return debounced;
    }

    function throttle(fn, delay) {
        let lastCall = 0;
        return function (...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                fn.apply(this, args);
            }
        };
    }

    function sanitizeText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').replace(/[\r\n\t]/g, ' ').trim();
    }

    function getVisibleText(element) {
        if (!element) return '';
        if (element.innerText) return sanitizeText(element.innerText);
        if (element.textContent) return sanitizeText(element.textContent);
        return '';
    }

    function extractHeadings(element) {
        if (!element) return [];
        const results = [];
        const seen = new Set();

        try {
            const tags = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
            tags.forEach(tag => {
                const text = sanitizeText(tag.innerText || tag.textContent);
                if (text && !seen.has(text)) {
                    results.push({
                        text,
                        level: parseInt(tag.tagName.substring(1)),
                        element: tag
                    });
                    seen.add(text);
                }
            });
        } catch (e) {
            console.warn('Prompt History: Error extracting headings:', e);
        }

        return results;
    }

    function createPreview(text, maxLength = CONFIG.PREVIEW_LENGTH) {
        if (!text) return '';
        const clean = sanitizeText(text);
        if (clean.length <= maxLength) return clean;
        const truncated = clean.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) {
            return truncated.substring(0, lastSpace) + '...';
        }
        return truncated + '...';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // PROVIDERS
    // ============================================
    const PROVIDERS = {
        chatgpt: {
            name: 'chatgpt',
            detect: () => {
                const h = window.location.hostname;
                return h.includes('chatgpt.com') || h.includes('chat.openai.com');
            },
            container: 'main',
            // Selector for where to inject the toggle button
            toggleContainer: '.ms-auto.flex.items-center.gap-1\\.5, [class*="ms-auto"][class*="flex"][class*="items-center"]',
            togglePosition: 'prepend', // prepend or append
            getScrollContainer: () => document.querySelector('main') || document.body,
            getItems: (root) => {
                try {
                    const selectors = [
                        'article[data-testid^="conversation-turn"]',
                        '[data-testid^="conversation-turn"]',
                        'main article'
                    ];
                    let articles = [];
                    for (const sel of selectors) {
                        articles = Array.from(root.querySelectorAll(sel));
                        if (articles.length > 0) break;
                    }

                    return articles.map((article, index) => {
                        const roleAttr = article.getAttribute('data-message-author-role');
                        let isUser = roleAttr === 'user';
                        if (!roleAttr) {
                            isUser = !!article.querySelector('[data-message-author-role="user"]');
                        }

                        let target = article.querySelector('.markdown, [class*="markdown"]') || article;
                        const text = getVisibleText(target);
                        const headings = isUser ? [] : extractHeadings(target);

                        return { element: article, role: isUser ? 'user' : 'ai', text, headings, index };
                    }).filter(item => item.text.length > 0);
                } catch (e) {
                    console.warn('Prompt History: ChatGPT getItems error:', e);
                    return [];
                }
            }
        },

        gemini: {
            name: 'gemini',
            detect: () => window.location.hostname.includes('gemini.google.com'),
            container: 'body',
            toggleContainer: '.leading-actions-wrapper, [class*="leading-actions"]',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('main') || document.body,
            getItems: (root) => {
                try {
                    let nodes = Array.from(root.querySelectorAll('user-query, model-response'));
                    if (nodes.length === 0) {
                        nodes = Array.from(root.querySelectorAll('[class*="query-content"], [class*="response-content"]'));
                    }

                    return nodes.map((node, index) => {
                        const tagName = node.tagName.toLowerCase();
                        const isUser = tagName === 'user-query' || node.className.toLowerCase().includes('query');
                        const text = getVisibleText(node);
                        return { element: node, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(node), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) {
                    console.warn('Prompt History: Gemini getItems error:', e);
                    return [];
                }
            }
        },

        claude: {
            name: 'claude',
            detect: () => window.location.hostname.includes('claude.ai'),
            container: 'main',
            toggleContainer: '.relative.flex-1.flex.items-center, [class*="flex-1"][class*="flex"][class*="items-center"][class*="gap-2"]',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('main') || document.body,
            getItems: (root) => {
                try {
                    const selectors = [
                        '[class*="font-claude-message"], [class*="font-user-message"]',
                        'div[class*="message"]'
                    ];
                    let messages = [];
                    for (const sel of selectors) {
                        messages = Array.from(root.querySelectorAll(sel));
                        messages = messages.filter(el => !messages.some(other => other !== el && other.contains(el)));
                        if (messages.length > 0) break;
                    }

                    return messages.map((msg, index) => {
                        const classList = msg.className.toLowerCase();
                        const isUser = classList.includes('user') || classList.includes('human');
                        const text = getVisibleText(msg);
                        return { element: msg, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(msg), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) {
                    console.warn('Prompt History: Claude getItems error:', e);
                    return [];
                }
            }
        },
        
        qwen: {
            name: 'qwen',
            detect: () => window.location.hostname.includes('qwen'),
            container: 'main',
            // Updated selector based on actual DOM: scrollbar-none flex items-center left-content operationBtn
            toggleContainer: '.left-content.operationBtn, .scrollbar-none.flex.items-center.left-content, [class*="operationBtn"][class*="left-content"], [class*="left-content"][class*="svelte"]',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('.chat-container, main, [class*="chat-scroll"]') || document.body,
            getItems: (root) => {
                try {
                    // Qwen specific selectors - look for message containers
                    const selectors = [
                        '[class*="message-content"]',
                        '[class*="chat-message"]',
                        '[class*="msg-"]',
                        '[class*="bubble"]',
                        '[class*="message"][class*="item"]',
                        '[class*="chat-item"]'
                    ];
                    let messages = [];
                    for (const sel of selectors) {
                        messages = Array.from(root.querySelectorAll(sel));
                        // Filter out nested elements
                        messages = messages.filter(el => !messages.some(other => other !== el && other.contains(el)));
                        if (messages.length > 0) break;
                    }

                    return messages.map((msg, index) => {
                        const classList = msg.className.toLowerCase();
                        const parentClass = msg.parentElement?.className?.toLowerCase() || '';
                        const isUser = classList.includes('user') || classList.includes('human') ||
                            classList.includes('query') || classList.includes('self') ||
                            parentClass.includes('user') || parentClass.includes('self');
                        const text = getVisibleText(msg);
                        return { element: msg, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(msg), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) {
                    console.warn('Prompt History: Qwen getItems error:', e);
                    return [];
                }
            }
        },

        copilot: {
            name: 'copilot',
            detect: () => window.location.hostname.includes('copilot.microsoft') || window.location.hostname.includes('bing.com/chat'),
            container: 'main',
            toggleContainer: '.relative.bottom-0.flex.justify-between, [class*="justify-between"][class*="pb-"]',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('main') || document.body,
            getItems: (root) => {
                try {
                    const messages = Array.from(root.querySelectorAll('[class*="message"], [class*="response"], [class*="turn"]'));
                    return messages.map((msg, index) => {
                        const classList = msg.className.toLowerCase();
                        const isUser = classList.includes('user') || classList.includes('human') || classList.includes('request');
                        const text = getVisibleText(msg);
                        return { element: msg, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(msg), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) { return []; }
            }
        },

        kimi: {
            name: 'kimi',
            detect: () => window.location.hostname.includes('kimi'),
            container: 'main',
            // Updated selector: data-v-070e4526 class="left-area"
            toggleContainer: '.left-area, [class*="left-area"], [data-v-070e4526].left-area',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('.chat-container, main, [class*="chat-scroll"]') || document.body,
            getItems: (root) => {
                try {
                    // Kimi specific selectors
                    const selectors = [
                        '[class*="message-content"]',
                        '[class*="chat-message"]',
                        '[class*="segment"]',
                        '[class*="bubble"]',
                        '[class*="msg-item"]'
                    ];
                    let messages = [];
                    for (const sel of selectors) {
                        messages = Array.from(root.querySelectorAll(sel));
                        messages = messages.filter(el => !messages.some(other => other !== el && other.contains(el)));
                        if (messages.length > 0) break;
                    }

                    return messages.map((msg, index) => {
                        const classList = msg.className.toLowerCase();
                        const parentClass = msg.parentElement?.className?.toLowerCase() || '';
                        const isUser = classList.includes('user') || classList.includes('human') ||
                            classList.includes('self') || parentClass.includes('user');
                        const text = getVisibleText(msg);
                        return { element: msg, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(msg), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) {
                    console.warn('Prompt History: Kimi getItems error:', e);
                    return [];
                }
            }
        },

        zai: {
            name: 'zai',
            detect: () => window.location.hostname.includes('z.ai'),
            container: 'main',
            toggleContainer: '.flex.gap-\\[8px\\].items-center, [class*="gap-"][class*="items-center"][class*="overflow-x-auto"]',
            togglePosition: 'append',
            getScrollContainer: () => document.querySelector('main') || document.body,
            getItems: (root) => {
                try {
                    const messages = Array.from(root.querySelectorAll('[class*="message"], [class*="chat"]'));
                    return messages.map((msg, index) => {
                        const classList = msg.className.toLowerCase();
                        const isUser = classList.includes('user') || classList.includes('human');
                        const text = getVisibleText(msg);
                        return { element: msg, role: isUser ? 'user' : 'ai', text, headings: isUser ? [] : extractHeadings(msg), index };
                    }).filter(item => item.text.length > 0);
                } catch (e) { return []; }
            }
        },

        deepseek: {
            name: 'deepseek',
            detect: () => window.location.hostname.includes('deepseek.com') || window.location.hostname.includes('chat.deepseek'),
            container: '.dad65929',
            // Selector based on provided class: bf38813a - prepend to show before submit button
            toggleContainer: '.bf38813a, [class*="bf38813a"]',
            togglePosition: 'prepend',
            getScrollContainer: () => document.querySelector('.dad65929, main, [class*="chat-scroll"], [class*="conversation"]') || document.body,
            getItems: (root) => {
                try {
                    // DeepSeek DOM structure based on actual HTML:
                    // User messages: .d29f3d7d.ds-message (contains .fbb737a4 for text)
                    // AI messages: ._4f9bf79 (contains .ds-markdown for content)
                    // Both are inside .dad65929 container

                    const allMessages = [];

                    // Find user messages - they have class d29f3d7d and ds-message
                    const userMsgs = Array.from(root.querySelectorAll('.d29f3d7d.ds-message, [class*="d29f3d7d"].ds-message'));
                    userMsgs.forEach(msg => {
                        // Get the text content from .fbb737a4 or fallback to the message itself
                        const textEl = msg.querySelector('.fbb737a4, [class*="fbb737a4"]') || msg;
                        const text = getVisibleText(textEl);
                        if (text.length > 0) {
                            allMessages.push({ element: msg, role: 'user', text, headings: [] });
                        }
                    });

                    // Find AI messages - they have class _4f9bf79
                    const aiMsgs = Array.from(root.querySelectorAll('._4f9bf79, [class*="_4f9bf79"]'));
                    aiMsgs.forEach(msg => {
                        // Get content from .ds-markdown
                        const markdown = msg.querySelector('.ds-markdown, .ds-markdown--block');
                        const contentEl = markdown || msg;
                        const text = getVisibleText(contentEl);
                        if (text.length > 0) {
                            allMessages.push({ element: msg, role: 'ai', text, headings: extractHeadings(contentEl) });
                        }
                    });

                    // Sort by document position to maintain conversation order
                    allMessages.sort((a, b) => {
                        const pos = a.element.compareDocumentPosition(b.element);
                        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                        return 0;
                    });

                    return allMessages.map((item, index) => ({ ...item, index }));
                } catch (e) {
                    console.warn('Prompt History: DeepSeek getItems error:', e);
                    return [];
                }
            }
        }


    };

    function detectProvider() {
        for (const [name, provider] of Object.entries(PROVIDERS)) {
            try {
                if (provider.detect()) {
                    console.log(`Prompt History: Detected provider: ${name}`);
                    return provider;
                }
            } catch (e) {
                console.warn(`Prompt History: Error detecting ${name}:`, e);
            }
        }
        return null;
    }

    // ============================================
    // UI COMPONENT
    // ============================================
    class NeuralNavUI {
        constructor(controller, provider) {
            this.controller = controller;
            this.provider = provider;
            this.root = null;
            this.toggleBtn = null;
            this.panel = null;
            this.isOpen = false;
            this.searchInput = null;
            this.contentContainer = null;
            this.toggleMountRetries = 0;
            this.maxToggleMountRetries = 10;
        }

        mount() {
            if (this.root) return;

            // Create the panel (fixed position)
            this.panel = document.createElement('div');
            this.panel.id = 'neural-nav-panel';
            this.panel.className = 'nn-panel';
            this.panel.setAttribute('role', 'dialog');
            this.panel.setAttribute('aria-modal', 'false');
            this.panel.innerHTML = `
                <div class="nn-header">
                    <div class="nn-tabs" role="tablist">
                        <button class="nn-tab" data-view="prompts" role="tab" aria-selected="false">${safeI18n('neuralNavTabPrompts', 'Prompts')}</button>
                        <button class="nn-tab active" data-view="all" role="tab" aria-selected="true">${safeI18n('neuralNavTabAll', 'All')}</button>
                    </div>
                </div>
                <div class="nn-controls">
                    <div class="nn-search-wrap">
                        <div class="nn-search-icon" aria-hidden="true">${ICONS.search}</div>
                        <input type="text" class="nn-search-input" placeholder="${safeI18n('neuralNavSearchPlaceholder', 'Filter...')}" aria-label="${safeI18n('neuralNavSearchAriaLabel', 'Filter conversation')}" autocomplete="off" spellcheck="false" />
                    </div>
                </div>
                <div class="nn-content" role="list" aria-live="polite"></div>
            `;

            document.body.appendChild(this.panel);

            // Create the toggle button (will be injected into platform UI)
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.className = 'nn-toggle-inline'; // Start with inline style
            this.toggleBtn.title = safeI18n('neuralNavToggleTitle', 'Toggle Prompt History (Cmd/Ctrl + .)');
            this.toggleBtn.setAttribute('aria-label', safeI18n('neuralNavToggleAriaLabel', 'Toggle navigation panel'));

            // Use extension logo instead of menu icon
            const logoImg = document.createElement('img');
            logoImg.src = safeRuntimeGetURL('images/icon32.png');
            logoImg.alt = 'NeuralNav';
            logoImg.style.cssText = 'width: 20px; height: 20px; object-fit: contain;';
            this.toggleBtn.appendChild(logoImg);

            // Create a wrapper root for managing state
            this.root = document.createElement('div');
            this.root.id = 'neural-nav-root';
            this.root.style.display = 'none'; // Hidden, just for state management
            document.body.appendChild(this.root);

            this.searchInput = this.panel.querySelector('.nn-search-input');
            this.contentContainer = this.panel.querySelector('.nn-content');

            // Try to inject toggle into platform UI
            this.injectToggle();

            this.attachEvents();
        }

        injectToggle() {
            const provider = this.provider;
            if (!provider || !provider.toggleContainer) {
                // Fallback: add toggle to body with fixed position
                this.toggleBtn.className = 'nn-toggle-fixed';
                document.body.appendChild(this.toggleBtn);
                console.log('Prompt History: Using fixed toggle position (no container selector)');
                return;
            }

            // Try to find the container
            const containerSelectors = provider.toggleContainer.split(', ');
            let container = null;

            for (const selector of containerSelectors) {
                try {
                    container = document.querySelector(selector.trim());
                    if (container) break;
                } catch (e) {
                    // Invalid selector, skip
                }
            }

            if (container) {
                // Remove any existing toggle
                const existing = container.querySelector('.nn-toggle-inline, .nn-toggle-fixed');
                if (existing) existing.remove();

                // Ensure inline styling
                this.toggleBtn.className = 'nn-toggle-inline';

                // Inject toggle
                if (provider.togglePosition === 'prepend') {
                    container.prepend(this.toggleBtn);
                } else {
                    container.appendChild(this.toggleBtn);
                }
                console.log(`Prompt History: Toggle injected into platform UI (${provider.name})`);
            } else {
                // Retry a few times as the container might load later
                if (this.toggleMountRetries < this.maxToggleMountRetries) {
                    this.toggleMountRetries++;
                    setTimeout(() => this.injectToggle(), 500);
                    console.log(`Prompt History: Toggle container not found, retrying... (${this.toggleMountRetries}/${this.maxToggleMountRetries})`);
                } else {
                    // Fallback: fixed position
                    this.toggleBtn.className = 'nn-toggle-fixed';
                    document.body.appendChild(this.toggleBtn);
                    console.log('Prompt History: Using fixed toggle position (container not found after retries)');
                }
            }
        }

        attachEvents() {
            if (!this.toggleBtn || !this.panel) return;

            this.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.controller.toggle();
            });

            const debouncedSearch = debounce((value) => {
                this.controller.setState({ search: value });
            }, CONFIG.DEBOUNCE_SEARCH);

            this.searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });

            const tabs = this.panel.querySelectorAll('.nn-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    this.controller.setState({ view: tab.dataset.view });
                });
            });

            document.addEventListener('click', (e) => {
                if (this.isOpen && !this.panel.contains(e.target) && !this.toggleBtn.contains(e.target)) {
                    this.controller.toggle(false);
                }
            });

            this.panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.controller.toggle(false);
                }
            });
        }

        render(state) {
            if (!this.contentContainer) return;

            const { items, activeId, view, search } = state;
            const filtered = this.filterItems(items, view, search);

            if (filtered.length === 0) {
                this.contentContainer.innerHTML = `<div class="nn-empty">${search ? safeI18n('neuralNavEmptyNoResults', 'No results found') : safeI18n('neuralNavEmptyNoItems', 'No items to display')}</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            filtered.forEach((item, index) => {
                fragment.appendChild(this.createItemElement(item, activeId, index));
            });

            this.contentContainer.innerHTML = '';
            this.contentContainer.appendChild(fragment);
        }

        filterItems(items, view, search) {
            return items.filter(item => {
                if (view === 'prompts' && item.role !== 'user') return false;
                if (search) {
                    const term = search.toLowerCase();
                    const textMatch = item.text.toLowerCase().includes(term);
                    const headingMatch = item.headings && item.headings.some(h => h.text.toLowerCase().includes(term));
                    return textMatch || headingMatch;
                }
                return true;
            });
        }

        createItemElement(item, activeId, index) {
            const el = document.createElement('div');
            el.className = `nn-item ${item.role} ${item.id === activeId ? 'active' : ''}`;
            el.dataset.id = item.id;
            el.setAttribute('role', 'listitem');
            el.setAttribute('tabindex', '0');

            const preview = createPreview(item.text);
            const escapedPreview = escapeHtml(preview);

            let headingsHTML = '';
            if (item.role === 'ai' && item.headings && item.headings.length > 0) {
                const headingItems = item.headings.map(h => {
                    const escapedText = escapeHtml(h.text);
                    return `<li class="nn-heading nn-heading-level-${h.level}" data-heading="${escapeHtml(h.text)}" role="button" tabindex="0">${escapedText}</li>`;
                }).join('');
                headingsHTML = `<ul class="nn-headings" role="list">${headingItems}</ul>`;
            }

            const icon = item.role === 'user' ? ICONS.chat : ICONS.hash;

            el.innerHTML = `
                <div class="nn-item-header">
                    <span class="nn-icon ${item.role}" aria-hidden="true">${icon}</span>
                    <span class="nn-preview">${escapedPreview}</span>
                </div>
                ${headingsHTML}
            `;

            el.addEventListener('click', (e) => {
                const headingLi = e.target.closest('li[data-heading]');
                if (headingLi) {
                    this.controller.scrollToHeading(item.element, headingLi.dataset.heading);
                } else {
                    this.controller.scrollTo(item.element);
                }
            });

            return el;
        }

        setOpen(isOpen) {
            this.isOpen = isOpen;
            this.panel?.classList.toggle('open', isOpen);
            this.toggleBtn?.classList.toggle('active', isOpen);
            if (isOpen && this.searchInput) {
                requestAnimationFrame(() => this.searchInput.focus());
            }
        }

        destroy() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
            if (this.toggleBtn) {
                this.toggleBtn.remove();
                this.toggleBtn = null;
            }
            if (this.root) {
                this.root.remove();
                this.root = null;
            }
        }
    }

    // ============================================
    // MAIN CONTROLLER
    // ============================================
    class NeuralNav {
        constructor(provider) {
            if (!provider) {
                console.log('Prompt History: No provider specified');
                return;
            }

            this.provider = provider;
            this.state = { items: [], view: 'all', search: '', activeId: null };
            this.ui = new NeuralNavUI(this, provider);
            this.observer = null;
            this.intersectionObserver = null;
            this.scrollTarget = null;
            this.scanDebounced = null;
            this.boundHandlers = {};

            this.init();
        }

        init() {
            try {
                if (!isRuntimeAlive()) {
                    this._disabled = true;
                    return;
                }
                this.ui.mount();
                this.setupObservers();
                this.setupKeyboardShortcuts();
                this.setupMessageListener();
                setTimeout(() => this.scan(), CONFIG.INITIAL_SCAN_DELAY);
                console.log(`Prompt History: Initialized for ${this.provider.name}`);
            } catch (error) {
                if (!isExtensionContextInvalidated(error)) {
                    console.error('Prompt History: Initialization failed:', error);
                }
            }
        }

        setupObservers() {
            this.scanDebounced = debounce(() => this.scan(), CONFIG.DEBOUNCE_SCAN);
            this.observer = new MutationObserver(this.scanDebounced);

            const container = document.querySelector(this.provider.container) || document.body;
            this.observer.observe(container, { childList: true, subtree: true });

            this.scrollTarget = this.provider.getScrollContainer();

            this.intersectionObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && entry.intersectionRatio >= CONFIG.INTERSECTION_THRESHOLD) {
                            const itemId = entry.target.dataset.navId;
                            if (itemId && itemId !== this.state.activeId) {
                                this.setState({ activeId: itemId }, false);
                            }
                        }
                    });
                },
                { root: this.scrollTarget === document.body ? null : this.scrollTarget, threshold: CONFIG.INTERSECTION_THRESHOLD }
            );

            const target = this.scrollTarget === document.body ? window : this.scrollTarget;
            const onScroll = throttle(() => {
                // Progress indicator removed
            }, CONFIG.DEBOUNCE_SCROLL);

            this.boundHandlers.scroll = onScroll;
            target.addEventListener('scroll', onScroll, { passive: true });
        }

        setupKeyboardShortcuts() {
            this.boundHandlers.keydown = (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === '.') {
                    e.preventDefault();
                    this.toggle();
                }
            };
            document.addEventListener('keydown', this.boundHandlers.keydown);
        }

        setupMessageListener() {
            this.boundHandlers.message = (message) => {
                if (message.type === 'TOGGLE_NEURAL_NAV') {
                    this.toggle();
                }
            };
            try {
                chrome.runtime.onMessage.addListener(this.boundHandlers.message);
            } catch (_) {
                // Extension context may be invalidated (e.g., during extension reload). Safe no-op.
            }
        }

        teardown() {
            try { this.scanDebounced?.cancel?.(); } catch (_) { }
            try { this.observer?.disconnect(); } catch (_) { }
            try { this.intersectionObserver?.disconnect(); } catch (_) { }
            try {
                const target = this.scrollTarget === document.body ? window : this.scrollTarget;
                if (this.boundHandlers.scroll && target) {
                    target.removeEventListener('scroll', this.boundHandlers.scroll);
                }
            } catch (_) { }
            try {
                if (this.boundHandlers.keydown) {
                    document.removeEventListener('keydown', this.boundHandlers.keydown);
                }
            } catch (_) { }
            try {
                if (this.boundHandlers.message && chrome?.runtime?.onMessage?.removeListener) {
                    chrome.runtime.onMessage.removeListener(this.boundHandlers.message);
                }
            } catch (_) { }
        }

        scan() {
            try {
                if (this._disabled || !isRuntimeAlive()) {
                    this._disabled = true;
                    this.teardown();
                    return [];
                }
                const rawItems = this.provider.getItems(document);
                const items = rawItems.map((item, i) => {
                    const id = `nav-item-${i}`;
                    if (item.element) {
                        item.element.dataset.navId = id;
                        this.intersectionObserver?.unobserve(item.element);
                        this.intersectionObserver?.observe(item.element);
                    }
                    return { ...item, id };
                });

                console.log(`Prompt History: Scanned ${items.length} items`);
                this.setState({ items });
                return items;
            } catch (error) {
                if (isExtensionContextInvalidated(error)) {
                    this._disabled = true;
                    this.teardown();
                    return [];
                }
                console.error('Prompt History: Scan error:', error);
                return [];
            }
        }

        setState(newState, shouldRender = true) {
            this.state = { ...this.state, ...newState };
            if (shouldRender) {
                try {
                    this.ui.render(this.state);
                } catch (error) {
                    if (isExtensionContextInvalidated(error) || !isRuntimeAlive()) {
                        this._disabled = true;
                        this.teardown();
                        return;
                    }
                    console.error('Prompt History: Render error:', error);
                }
            }
        }

        toggle(force) {
            const newState = force !== undefined ? force : !this.ui.isOpen;
            this.ui.setOpen(newState);
            if (newState) this.scan();
        }

        scrollTo(element) {
            if (!element) return;
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            element.style.transition = 'background 0.3s';
            const originalBg = element.style.background;
            element.style.background = 'rgba(255, 255, 0, 0.2)';
            setTimeout(() => { element.style.background = originalBg; }, 1000);
        }

        scrollToHeading(messageElement, headingText) {
            if (!messageElement) return;
            const headings = messageElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (const heading of headings) {
                if (sanitizeText(heading.innerText) === headingText) {
                    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    heading.style.transition = 'background 0.3s';
                    const originalBg = heading.style.background;
                    heading.style.background = 'rgba(255, 255, 0, 0.3)';
                    setTimeout(() => { heading.style.background = originalBg; }, 1000);
                    return;
                }
            }
            this.scrollTo(messageElement);
        }
    }

    // ============================================
    // INITIALIZE
    // ============================================
    function initialize() {
        const start = () => {
            const provider = detectProvider();
            if (!provider) {
                console.log(safeI18n('neuralNavNoProvider', 'Prompt History: No supported provider detected'));
                return;
            }
            new NeuralNav(provider);
        };

        try {
            chrome.storage.local.get(['promptHistoryViewerEnabled'], (result) => {
                if (result.promptHistoryViewerEnabled === false) {
                    console.log(safeI18n('neuralNavDisabledByUser', 'Prompt History: Disabled by user setting'));
                    return;
                }
                start();
            });
        } catch (error) {
            if (isExtensionContextInvalidated(error)) return;
            start();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }

})();
