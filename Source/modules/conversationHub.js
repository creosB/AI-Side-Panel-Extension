const DEFAULT_MAX_ITEMS = 500;

const ADAPTERS = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    list: listChatGpt
  },
  {
    id: 'gemini',
    label: 'Gemini',
    list: listGeminiFromTab
  },
  {
    id: 'claude',
    label: 'Claude',
    list: listClaude
  },
  {
    id: 'grok',
    label: 'Grok',
    list: listGrok
  },
  {
    id: 'copilot',
    label: 'Copilot',
    list: listCopilotFromTab
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    list: listDeepseekFromTab
  },
  {
    id: 'mistral',
    label: 'Mistral',
    list: listMistralFromTab
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    list: listPerplexityFromTab
  },
  {
    id: 'qwen',
    label: 'Qwen',
    list: listQwenFromTab
  },
  {
    id: 'kimi',
    label: 'Kimi',
    list: listKimiFromTab
  },
  {
    id: 'zai',
    label: 'Z AI',
    list: listZaiFromTab
  },
  {
    id: 'notebooklm',
    label: 'NotebookLM',
    list: listNotebookLMFromTab
  },
  {
    id: 'aistudio',
    label: 'AI Studio',
    list: listAIStudioFromTab
  }
];

const OPEN_TAB_HANDLERS = {
  copilot: {
    label: 'Copilot',
    urlPatterns: ['*://copilot.microsoft.com/*'],
    itemSelectors: ['[role="option"]'],
    titleSelectors: ['p.truncate', 'p[title]'],
    clickSelectors: ['[role="option"]']
  },
  qwen: {
    label: 'Qwen',
    urlPatterns: ['*://chat.qwen.ai/*', '*://qwen.ai/*'],
    itemSelectors: ['.chat-item-drag', '.chat-item-drag-link', 'a[aria-label="chat-item"]'],
    titleSelectors: ['.chat-item-drag-link-content-tip-text', '.chat-item-drag-link-content'],
    clickSelectors: ['a.chat-item-drag-link', 'a[aria-label="chat-item"]', '.chat-item-drag-link']
  },
  zai: {
    label: 'Z AI',
    urlPatterns: ['*://chat.z.ai/*', '*://z.ai/*'],
    itemSelectors: ['.w-full.mb-1.relative.group'],
    titleSelectors: ['div[dir="auto"]'],
    clickSelectors: ['button[type="button"]']
  },
  notebooklm: {
    label: 'NotebookLM',
    urlPatterns: ['*://notebooklm.google.com/*'],
    itemSelectors: ['.project-buttons-flow > div', '.project-card', '.notebook-card', '.project-button'],
    titleSelectors: ['.project-title', '.notebook-title', '.project-button-title', 'div[role="button"]', 'h3'],
    clickSelectors: ['.project-buttons-flow > div', '.project-button', 'div[role="button"]', 'a']
  },
  aistudio: {
    label: 'AI Studio',
    urlPatterns: ['*://aistudio.google.com/*'],
    itemSelectors: ['.lib-table-wrapper tr', '.library-item', 'tr.mdc-data-table__row', '.prompt-link-wrapper'],
    titleSelectors: ['.name-btn', '.cdk-column-name', '.name-cell', '.title', '.prompt-link'],
    clickSelectors: ['tr', '.library-item', '.name-btn', '.prompt-link']
  }
};

const CHATGPT_BASES = ['https://chatgpt.com', 'https://chat.openai.com'];
const CONVERSATION_HUB_CACHE_KEY = 'conversationHubCache_v1';
const CONVERSATION_HUB_CACHE_VERSION = 1;

function readConversationHubCache() {
  try {
    const raw = localStorage.getItem(CONVERSATION_HUB_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CONVERSATION_HUB_CACHE_VERSION) return null;
    if (!parsed.services || typeof parsed.services !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeConversationHubCache(cache) {
  try {
    localStorage.setItem(CONVERSATION_HUB_CACHE_KEY, JSON.stringify(cache));
  } catch (_) {}
}

function listUnsupported() {
  return Promise.resolve({ items: [], status: 'unsupported', error: 'Not supported yet.' });
}

async function extractGeminiConversationsFromDom(options = {}) {
  const origin = options.origin || window.location.origin || 'https://gemini.google.com';
  const basePath = typeof options.basePath === 'string' ? options.basePath : '/app/';
  const maxShadowRoots = Number.isFinite(options.maxShadowRoots) ? options.maxShadowRoots : 200;
  const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs) ? options.waitTimeoutMs : 8000;
  const waitIntervalMs = Number.isFinite(options.waitIntervalMs) ? options.waitIntervalMs : 250;
  const waitForMinItems = Number.isFinite(options.waitForMinItems) ? options.waitForMinItems : 2;
  const waitForStableItems = options.waitForStableItems === true;
  const stableIntervals = Number.isFinite(options.stableIntervals) ? options.stableIntervals : 2;
  const scrollToLoad = options.scrollToLoad !== false;
  const scrollMaxMs = Number.isFinite(options.scrollMaxMs) ? options.scrollMaxMs : 5000;
  const scrollStepDelayMs = Number.isFinite(options.scrollStepDelayMs) ? options.scrollStepDelayMs : 250;
  const maxScrollSteps = Number.isFinite(options.maxScrollSteps) ? options.maxScrollSteps : 24;
  const scrollNoNewLimit = Number.isFinite(options.scrollNoNewLimit) ? options.scrollNoNewLimit : 5;
  const desiredMinItems = Number.isFinite(options.desiredMinItems) ? options.desiredMinItems : Math.max(5, waitForMinItems);
  const maxReturnItems = Number.isFinite(options.maxReturnItems) ? options.maxReturnItems : 500;

  const idRegexes = Array.isArray(options.idRegexes) && options.idRegexes.length
    ? options.idRegexes.map((pattern) => new RegExp(pattern, 'i'))
    : [
      /c_[a-z0-9]+/i,
      /\b[a-f0-9]{16}\b/i
    ];
  const ignoredTitles = new Set([
    'new chat',
    'chats',
    'conversations'
  ]);

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const normalizeLower = (text) => normalize(text).toLowerCase();

  const resolveUrl = (raw) => {
    if (!raw) return null;
    if (raw.startsWith('javascript:')) return null;
    try {
      return new URL(raw, origin);
    } catch (_) {
      return null;
    }
  };

  const root = document.querySelector('bard-sidenav')
    || document.querySelector('side-navigation-content')
    || document.body
    || document.documentElement;

  const hasGeminiHistoryDom = Boolean(
    document.querySelector('bard-sidenav')
      || document.querySelector('side-navigation-content')
      || document.querySelector('conversations-list[data-test-id="all-conversations"]')
      || document.querySelector('[data-test-id="conversation"]')
      || document.querySelector('.chat-history')
  );
  const effectiveWaitForMinItems = hasGeminiHistoryDom ? waitForMinItems : 0;

  const searchRoots = [root, document];
  const visitedShadow = new Set();
  const shadowQueue = [];

  const enqueueShadowRoot = (host) => {
    const sr = host?.shadowRoot;
    if (!sr || visitedShadow.has(sr)) return;
    visitedShadow.add(sr);
    shadowQueue.push(sr);
  };

  const enqueueShadowRoots = (node) => {
    if (!node || !node.querySelectorAll) return;
    enqueueShadowRoot(node);
    try {
      node.querySelectorAll('*').forEach((el) => {
        enqueueShadowRoot(el);
      });
    } catch (_) {}
  };

  enqueueShadowRoots(root);
  while (shadowQueue.length && visitedShadow.size < maxShadowRoots) {
    const sr = shadowQueue.shift();
    if (!sr) continue;
    searchRoots.push(sr);
    enqueueShadowRoots(sr);
  }

  const collectConversationElements = () => {
    const elements = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      elements.push(el);
    };

    for (const r of searchRoots) {
      try {
        r.querySelectorAll('conversations-list[data-test-id="all-conversations"]').forEach((list) => {
          try {
            list.querySelectorAll('[data-test-id="conversation"]').forEach(add);
          } catch (_) {}
        });
      } catch (_) {}
    }

    if (elements.length < 2) {
      for (const r of searchRoots) {
        try {
          r.querySelectorAll('.chat-history [data-test-id="conversation"]').forEach(add);
        } catch (_) {}
      }
    }

    // Fallback: some builds render conversations outside the conversations-list wrapper
    if (!elements.length) {
      for (const r of searchRoots) {
        try {
          r.querySelectorAll('[data-test-id="conversation"]').forEach(add);
        } catch (_) {}
      }
    }

    if (elements.length < 2) {
      for (const r of searchRoots) {
        try {
          r.querySelectorAll('.conversation-title').forEach((node) => {
            const parent = node.closest('[data-test-id="conversation"]') || node.closest('.conversation') || node.parentElement;
            if (parent) add(parent);
          });
        } catch (_) {}
      }
    }

    return elements;
  };

  const extractItemsFromElements = (elements) => {
    const extracted = [];
    const dedupe = new Set();

    const pickBestConversationId = (candidates) => {
      let best = '';
      let bestScore = -1;

      const consider = (value, score) => {
        if (!value) return;
        if (score > bestScore || (score === bestScore && value.length > best.length)) {
          best = value;
          bestScore = score;
        }
      };

      candidates.forEach((value) => {
        if (typeof value !== 'string') return;
        const normalized = normalize(value);
        if (!normalized) return;

        const lower = normalized.toLowerCase();
        const hasBardKey = lower.includes('bardvemetadata');

        const cMatches = normalized.match(/c_[a-z0-9]{10,}/ig);
        if (cMatches && cMatches.length) {
          const score = hasBardKey ? 3 : 2;
          cMatches.forEach((match) => consider(match, score));
        }

        const hexMatches = normalized.match(/\b[a-f0-9]{16}\b/ig);
        if (hexMatches && hexMatches.length) {
          hexMatches.forEach((match) => consider(match, 1));
        }
      });

      if (best) return best;

      for (const value of candidates) {
        if (typeof value !== 'string') continue;
        const normalized = normalize(value);
        if (!normalized) continue;
        for (const regex of idRegexes) {
          const match = normalized.match(regex);
          if (match) return match[0];
        }
      }

      return '';
    };

    elements.forEach((element, elementIndex) => {
      const collectIdCandidates = (node) => {
        const candidates = [];
        const push = (val) => {
          if (!val || typeof val !== 'string') return;
          candidates.push(val);
        };

        push(node?.getAttribute?.('jslog'));
        push(node?.getAttribute?.('aria-describedby'));
        push(node?.getAttribute?.('aria-label'));
        push(node?.getAttribute?.('data-id'));
        push(node?.getAttribute?.('data-conversation-id'));
        push(node?.getAttribute?.('data-thread-id'));

        try {
          node?.querySelectorAll?.('[jslog]').forEach((el) => push(el.getAttribute('jslog')));
        } catch (_) {}

        try {
          node?.querySelectorAll?.('[aria-describedby]').forEach((el) => push(el.getAttribute('aria-describedby')));
        } catch (_) {}

        try {
          const attrs = node?.attributes ? Array.from(node.attributes) : [];
          attrs.forEach((attr) => push(attr?.value));
        } catch (_) {}

        return candidates;
      };

      const candidateStrings = collectIdCandidates(element);
      const id = pickBestConversationId(candidateStrings);
      if (!id) return;

      let title = '';
      const titleNode = element.querySelector?.('.conversation-title');
      if (titleNode) {
        title = normalize(titleNode.textContent);
      } else {
        title = normalize(element.getAttribute?.('aria-label') || element.textContent);
      }

      if (!title || title.length < 2) return;
      const titleLower = normalizeLower(title);
      if (ignoredTitles.has(titleLower)) return;

      const urlId = id.startsWith('c_') ? id.slice(2) : id;
      const url = resolveUrl(`${origin}${basePath}${urlId}`)?.href || '';
      const key = url || id;
      if (!key || dedupe.has(key)) return;
      dedupe.add(key);

      extracted.push({
        id,
        title,
        url,
        sourceIndex: elementIndex
      });
    });

    return extracted;
  };

  const findScrollContainer = () => {
    const selectors = [
      '[data-test-id="overflow-container"]',
      '.overflow-container',
      '.chat-history',
      '.chat-history-list',
      '.conversations-container',
      'infinite-scroller',
      '.sidenav-with-history-container',
      'side-navigation-content',
      'bard-sidenav'
    ];

    const candidates = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    };

    for (const r of searchRoots) {
      for (const selector of selectors) {
        try {
          r.querySelectorAll(selector).forEach(add);
        } catch (_) {}
      }
    }

    const score = (el) => {
      let value = 0;
      try {
        const delta = (el.scrollHeight || 0) - (el.clientHeight || 0);
        if (delta > 50) value += Math.min(delta, 2000);
        if (el.querySelector?.('conversations-list[data-test-id="all-conversations"]')) value += 8000;
        if (el.querySelector?.('[data-test-id="conversation"]')) value += 5000;
        if (el.querySelector?.('.chat-history')) value += 2500;
      } catch (_) {}
      try {
        const style = window.getComputedStyle?.(el);
        const overflowY = style?.overflowY || '';
        if (overflowY === 'auto' || overflowY === 'scroll') value += 500;
      } catch (_) {}
      return value;
    };

    const scrollable = candidates.filter((el) => {
      try {
        return (el.scrollHeight || 0) > (el.clientHeight || 0) + 50;
      } catch (_) {
        return false;
      }
    });

    const pickFrom = scrollable.length ? scrollable : candidates;
    pickFrom.sort((a, b) => score(b) - score(a));
    return pickFrom[0] || null;
  };

  if (effectiveWaitForMinItems > 0) {
    const start = Date.now();
    let lastCount = -1;
    let stableCount = 0;

    while (Date.now() - start < waitTimeoutMs) {
      const count = collectConversationElements().length;
      if (count >= effectiveWaitForMinItems) {
        if (waitForStableItems) {
          if (count === lastCount) {
            stableCount += 1;
          } else {
            stableCount = 0;
          }
          if (stableCount >= stableIntervals) break;
        } else {
          break;
        }
      }
      lastCount = count;
      await new Promise((resolve) => setTimeout(resolve, waitIntervalMs));
    }
  }

  const itemsByKey = new Map();
  const collectOnce = () => {
    const items = extractItemsFromElements(collectConversationElements());
    items.forEach((item) => {
      const key = item?.url || item?.id;
      if (!key || itemsByKey.has(key)) return;
      itemsByKey.set(key, item);
    });
  };

  collectOnce();

  if (scrollToLoad && itemsByKey.size < desiredMinItems) {
    const scrollContainer = findScrollContainer();
    if (scrollContainer) {
      const originalTop = Number.isFinite(scrollContainer.scrollTop) ? scrollContainer.scrollTop : 0;
      const start = Date.now();
      let noNew = 0;
      let lastSize = itemsByKey.size;
      let lastTop = -1;

      try {
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, scrollStepDelayMs));
      } catch (_) {}

      while (Date.now() - start < scrollMaxMs && itemsByKey.size < maxReturnItems) {
        collectOnce();

        if (itemsByKey.size === lastSize) {
          noNew += 1;
        } else {
          noNew = 0;
          lastSize = itemsByKey.size;
        }

        if (itemsByKey.size >= desiredMinItems && noNew >= 1) break;
        if (noNew >= scrollNoNewLimit) break;

        let nextTop = 0;
        try {
          const jump = Math.max(120, Math.floor((scrollContainer.clientHeight || 0) * 0.85));
          nextTop = Math.min((scrollContainer.scrollTop || 0) + jump, (scrollContainer.scrollHeight || 0));
          scrollContainer.scrollTop = nextTop;
          scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch (_) {}

        await new Promise((resolve) => setTimeout(resolve, scrollStepDelayMs));

        if (nextTop === lastTop) break;
        lastTop = nextTop;

        const steps = Math.floor((Date.now() - start) / scrollStepDelayMs);
        if (steps >= maxScrollSteps) break;
      }

      try {
        scrollContainer.scrollTop = originalTop;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      } catch (_) {}
    }
  }

  if (itemsByKey.size <= 1) {
    try {
      const directElements = Array.from(document.querySelectorAll('[data-test-id="conversation"]'));
      if (directElements.length > itemsByKey.size) {
        const directRegex = /c_[a-z0-9]+/i;
        directElements.forEach((element, elementIndex) => {
          const jslog = element.getAttribute?.('jslog') || '';
          const idMatch = jslog.match(directRegex);
          if (!idMatch) return;
          const id = idMatch[0];

          const titleNode = element.querySelector?.('.conversation-title');
          const title = normalize(titleNode?.textContent || element.getAttribute?.('aria-label') || element.textContent);
          if (!title || title.length < 2) return;
          const titleLower = normalizeLower(title);
          if (ignoredTitles.has(titleLower)) return;

          const urlId = id.startsWith('c_') ? id.slice(2) : id;
          const url = resolveUrl(`${origin}${basePath}${urlId}`)?.href || '';
          const key = url || id;
          if (!key || itemsByKey.has(key)) return;
          itemsByKey.set(key, {
            id,
            title,
            url,
            sourceIndex: elementIndex
          });
        });
      }
    } catch (_) {}
  }

  return Array.from(itemsByKey.values()).slice(0, maxReturnItems);
}

async function extractConversationsFromDom(options = {}) {
  const include = Array.isArray(options.include) ? options.include.map((token) => token.toLowerCase()) : [];
  const exclude = Array.isArray(options.exclude) ? options.exclude.map((token) => token.toLowerCase()) : [];
  const containerSelectors = Array.isArray(options.containerSelectors) ? options.containerSelectors : [];
  const itemSelectors = Array.isArray(options.itemSelectors) ? options.itemSelectors : [];
  const titleSelectors = Array.isArray(options.titleSelectors) ? options.titleSelectors : [];
  const titleCleanup = typeof options.titleCleanup === 'function' ? options.titleCleanup : (text) => text;
  const pathHints = Array.isArray(options.pathHints) ? options.pathHints.map((token) => token.toLowerCase()) : [];
  const origin = options.origin || window.location.origin;
  const basePath = typeof options.basePath === 'string' ? options.basePath : '';
  const allowMissingUrl = options.allowMissingUrl === true;
  const attributeSelectors = Array.isArray(options.attributeSelectors) ? options.attributeSelectors : [];
  const attributeScanLimit = Number.isFinite(options.attributeScanLimit) ? options.attributeScanLimit : 40;
  const ancestorLevels = Number.isFinite(options.ancestorLevels) ? options.ancestorLevels : 0;
  const minItems = Number.isFinite(options.minItems) ? options.minItems : 0;
  const includeDocumentRoot = options.includeDocumentRoot === true;
  const waitForSelectors = Array.isArray(options.waitForSelectors) ? options.waitForSelectors : [];
  const waitForGoneSelectors = Array.isArray(options.waitForGoneSelectors) ? options.waitForGoneSelectors : [];
  const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs) ? options.waitTimeoutMs : 1200;
  const waitIntervalMs = Number.isFinite(options.waitIntervalMs) ? options.waitIntervalMs : 200;
  const waitForMinItems = Number.isFinite(options.waitForMinItems) ? options.waitForMinItems : 0;
  const waitForStableItems = options.waitForStableItems === true;
  const stableIntervals = Number.isFinite(options.stableIntervals) ? options.stableIntervals : 2;
  const idRegexes = Array.isArray(options.idRegexes) && options.idRegexes.length
    ? options.idRegexes.map((pattern) => new RegExp(pattern, 'i'))
    : [
      /c_[a-z0-9]+/i,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    ];
  const ignoreTitles = [
    'new chat',
    'new conversation',
    'new thread',
    'new',
    'settings',
    'help',
    'upgrade',
    'discover',
    'explore',
    'feedback',
    'chats',
    'conversations'
  ];

  const roots = [];
  const addRoot = (node) => {
    if (!node || roots.includes(node)) return;
    roots.push(node);
  };

  if (waitForSelectors.length || waitForGoneSelectors.length) {
    const start = Date.now();
    while (Date.now() - start < waitTimeoutMs) {
      let hasAll = true;
      for (const selector of waitForSelectors) {
        try {
          if (!document.querySelector(selector)) {
            hasAll = false;
            break;
          }
        } catch (_) {
          hasAll = false;
          break;
        }
      }

      let goneAll = true;
      for (const selector of waitForGoneSelectors) {
        try {
          if (document.querySelector(selector)) {
            goneAll = false;
            break;
          }
        } catch (_) {}
      }

      if (hasAll && goneAll) break;
      await new Promise((resolve) => setTimeout(resolve, waitIntervalMs));
    }
  }

  if (waitForMinItems > 0 && itemSelectors.length) {
    const start = Date.now();
    let lastCount = -1;
    let stableCount = 0;
    while (Date.now() - start < waitTimeoutMs) {
      let total = 0;
      for (const selector of itemSelectors) {
        try {
          total += document.querySelectorAll(selector).length;
        } catch (_) {}
      }

      if (total >= waitForMinItems) {
        if (waitForStableItems) {
          if (total === lastCount) {
            stableCount += 1;
          } else {
            stableCount = 0;
          }
          if (stableCount >= stableIntervals) {
            break;
          }
        } else {
          break;
        }
      }

      lastCount = total;
      await new Promise((resolve) => setTimeout(resolve, waitIntervalMs));
    }
  }

  if (containerSelectors.length) {
    containerSelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach(addRoot);
      } catch (_) {}
    });
  }

  if (!roots.length) {
    const containers = Array.from(
      document.querySelectorAll('nav, aside, [role="navigation"], [data-testid*="sidebar"], [class*="sidebar"], [class*="SideBar"]')
    );
    containers.forEach(addRoot);
  }

  if (!roots.length) {
    addRoot(document.body);
  }

  const elements = [];
  const elementSet = new Set();
  const addElement = (element) => {
    if (!element || elementSet.has(element)) return;
    elementSet.add(element);
    elements.push(element);
  };

  const collectBySelectors = (root, selectors) => {
    selectors.forEach((selector) => {
      try {
        root.querySelectorAll(selector).forEach(addElement);
      } catch (_) {}
    });
  };

  roots.forEach((root) => {
    if (itemSelectors.length) {
      collectBySelectors(root, itemSelectors);
    } else {
      root.querySelectorAll('a[href], [role="link"], [data-href], [data-url]').forEach(addElement);
    }
  });

  if (!elements.length || includeDocumentRoot || (minItems && elements.length < minItems)) {
    if (itemSelectors.length) {
      collectBySelectors(document, itemSelectors);
    } else {
      document.querySelectorAll('a[href], [role="link"], [data-href], [data-url]').forEach(addElement);
    }
  }

  const results = [];
  const seen = new Set();

  const getText = (element) => {
    for (const selector of titleSelectors) {
      const node = element.querySelector(selector);
      if (node && node.textContent) {
        return node.textContent;
      }
    }
    return element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
  };

  const ignoredAttributeNames = new Set(['class', 'style']);
  const collectAttributeValues = (element, values) => {
    if (!element) return;
    if (element.attributes) {
      for (const attr of element.attributes) {
        if (!attr?.value || ignoredAttributeNames.has(attr.name)) continue;
        values.push(attr.value);
      }
    }
    if (element.dataset) {
      Object.values(element.dataset).forEach((val) => {
        if (val) values.push(String(val));
      });
    }
  };

  const gatherAttributeValues = (element) => {
    const values = [];
    collectAttributeValues(element, values);
    return values;
  };

  const findId = (text) => {
    if (!text) return '';
    for (const regex of idRegexes) {
      const match = text.match(regex);
      if (match) return match[0];
    }
    return '';
  };

  const slugify = (text) => {
    if (!text) return '';
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  };

  const resolveUrl = (raw) => {
    if (!raw) return null;
    if (raw.startsWith('javascript:')) return null;
    try {
      return new URL(raw, origin);
    } catch (_) {
      return null;
    }
  };

  elements.forEach((element, elementIndex) => {
    const nestedAnchor = element.matches?.('a[href]') ? element : element.querySelector?.('a[href]');
    const rawHref = nestedAnchor?.getAttribute('href')
      || element.getAttribute?.('data-href')
      || element.getAttribute?.('data-url')
      || element.getAttribute?.('href');

    const attributeValues = gatherAttributeValues(element).concat(
      nestedAnchor ? gatherAttributeValues(nestedAnchor) : []
    );
    const extraValues = [];
    if (attributeSelectors.length && element?.querySelectorAll) {
      try {
        let count = 0;
        element.querySelectorAll(attributeSelectors.join(',')).forEach((node) => {
          if (count >= attributeScanLimit) return;
          count += 1;
          collectAttributeValues(node, extraValues);
        });
      } catch (_) {}
    }
    if (ancestorLevels > 0) {
      let ancestor = element.parentElement;
      let depth = 0;
      while (ancestor && depth < ancestorLevels) {
        collectAttributeValues(ancestor, extraValues);
        ancestor = ancestor.parentElement;
        depth += 1;
      }
    }
    attributeValues.push(...extraValues);
    const attributeBlob = attributeValues.join(' ');

    let candidateUrl = resolveUrl(rawHref);

    if (!candidateUrl) {
      for (const value of attributeValues) {
        if (!value || value.startsWith('#')) continue;
        const lower = value.toLowerCase();
        if (pathHints.length && !pathHints.some((token) => lower.includes(token))) continue;
        const url = resolveUrl(value);
        if (url) {
          candidateUrl = url;
          break;
        }
      }
    }

    if (!candidateUrl && basePath) {
      const id = findId(attributeBlob);
      if (id) {
        candidateUrl = resolveUrl(`${origin}${basePath}${id}`);
      }
    }

    if (!candidateUrl && !allowMissingUrl) return;
    if (candidateUrl && candidateUrl.origin !== origin) return;

    if (candidateUrl) {
      const urlLower = candidateUrl.href.toLowerCase();
      if (include.length && !include.some((token) => urlLower.includes(token))) return;
      if (exclude.some((token) => urlLower.includes(token))) return;
    }

    let title = getText(element);
    title = titleCleanup(title);
    title = title.replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2) return;

    const titleLower = title.toLowerCase();
    if (ignoreTitles.some((val) => titleLower === val || titleLower.startsWith(`${val} `))) return;

    const idFromQuery = candidateUrl?.searchParams?.get('id')
      || candidateUrl?.searchParams?.get('conversationId')
      || candidateUrl?.searchParams?.get('conversation_id');
    const pathParts = candidateUrl ? candidateUrl.pathname.split('/').filter(Boolean) : [];
    const id = idFromQuery || pathParts[pathParts.length - 1] || findId(attributeBlob) || slugify(title);
    if (!id) return;

    const seenKey = candidateUrl?.href || `${origin}/__${id}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);

    results.push({
      id,
      title,
      url: candidateUrl ? candidateUrl.href : '',
      sourceIndex: elementIndex
    });
  });

  return results;
}

async function listFromOpenTab({
  label,
  urlPatterns,
  include = [],
  exclude = [],
  containerSelectors = [],
  itemSelectors = [],
  titleSelectors = [],
  pathHints = [],
  basePath = '',
  idRegexes = [],
  origin = '',
  allowMissingUrl = false,
  attributeSelectors = [],
  attributeScanLimit = 40,
  ancestorLevels = 0,
  minItems = 0,
  includeDocumentRoot = false,
  waitForSelectors = [],
  waitForGoneSelectors = [],
  waitTimeoutMs = 1200,
  waitIntervalMs = 200,
  waitForMinItems = 0,
  waitForStableItems = false,
  stableIntervals = 2,
  allFrames = false,
  world = undefined,
  pickBestTab = false,
  extractor = extractConversationsFromDom,
  titleCleanup = null,
  maxItems = DEFAULT_MAX_ITEMS
} = {}) {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.tabs || !chromeApi?.scripting) {
    return { items: [], status: 'error', error: 'Tab access not available.' };
  }

  const tabs = await chromeApi.tabs.query({ url: urlPatterns });
  if (!tabs.length) {
    return { items: [], status: 'needs-tab', error: `Open ${label} in a tab to sync.` };
  }

  const buildArgs = (tabUrl) => ({
    include,
    exclude,
    containerSelectors,
    itemSelectors,
    titleSelectors,
    pathHints,
    basePath,
    idRegexes,
    origin: origin || (tabUrl ? new URL(tabUrl).origin : ''),
    allowMissingUrl,
    attributeSelectors,
    attributeScanLimit,
    ancestorLevels,
    minItems,
    includeDocumentRoot,
    waitForSelectors,
    waitForGoneSelectors,
    waitTimeoutMs,
    waitIntervalMs,
    waitForMinItems,
    waitForStableItems,
    stableIntervals,
    titleCleanup
  });

  const mergeFrameResults = (results) => {
    const merged = [];
    const seen = new Set();

    (results || []).forEach((entry) => {
      const items = entry?.result;
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        if (!item) return;
        const key = item.url || item.id || `${item.title || ''}:${item.sourceIndex ?? ''}`;
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(item);
      });
    });

    return merged;
  };

  const runOnTab = async (tab) => {
    const tabId = tab?.id;
    if (!tabId) {
      return { tab, items: [], status: 'error', error: `Unable to read ${label} conversations.` };
    }

    try {
      const exec = async (target) => {
        const payload = {
          target,
          func: extractor,
          args: [buildArgs(tab?.url)]
        };

        if (world) {
          try {
            return await chromeApi.scripting.executeScript({ ...payload, world });
          } catch (_) {
            return await chromeApi.scripting.executeScript(payload);
          }
        }

        return await chromeApi.scripting.executeScript(payload);
      };

      let results;
      try {
        results = await exec(allFrames ? { tabId, allFrames: true } : { tabId });
      } catch (err) {
        if (!allFrames) throw err;
        results = await exec({ tabId });
      }

      const items = allFrames ? mergeFrameResults(results) : (results?.[0]?.result || []);
      return { tab, items, status: items.length ? 'ok' : 'empty' };
    } catch (err) {
      return { tab, items: [], status: 'error', error: `Unable to read ${label} conversations.` };
    }
  };

  if (!pickBestTab || tabs.length === 1) {
    const result = await runOnTab(tabs[0]);
    return { items: result.items.slice(0, maxItems), status: result.items.length ? 'ok' : result.status };
  }

  const results = await Promise.all(tabs.map((tab) => runOnTab(tab)));
  const best = results.reduce((currentBest, next) => {
    if (!currentBest) return next;
    if ((next.items?.length || 0) > (currentBest.items?.length || 0)) return next;
    if ((next.items?.length || 0) === (currentBest.items?.length || 0)) {
      if (next?.tab?.active && !currentBest?.tab?.active) return next;
    }
    return currentBest;
  }, null);

  const bestItems = best?.items || [];
  const bestStatus = bestItems.length ? 'ok' : (best?.status || 'empty');
  return { items: bestItems.slice(0, maxItems), status: bestStatus };
}

async function clickConversationInDom(options = {}) {
  const itemSelectors = Array.isArray(options.itemSelectors) ? options.itemSelectors : [];
  const titleSelectors = Array.isArray(options.titleSelectors) ? options.titleSelectors : [];
  const clickSelectors = Array.isArray(options.clickSelectors) ? options.clickSelectors : [];
  const title = typeof options.title === 'string' ? options.title : '';
  const sourceIndex = Number.isFinite(options.sourceIndex) ? options.sourceIndex : null;
  const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs) ? options.waitTimeoutMs : 4000;
  const waitIntervalMs = Number.isFinite(options.waitIntervalMs) ? options.waitIntervalMs : 200;

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const desired = normalize(title);

  const elements = [];
  const elementSet = new Set();
  const addElement = (element) => {
    if (!element || elementSet.has(element)) return;
    elementSet.add(element);
    elements.push(element);
  };

  if (itemSelectors.length) {
    itemSelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach(addElement);
      } catch (_) {}
    });
  }

  if (!elements.length) {
    return { ok: false, error: 'No conversation items found.' };
  }

  const getText = (element) => {
    for (const selector of titleSelectors) {
      const node = element.querySelector(selector);
      if (node && node.textContent) {
        return node.textContent;
      }
    }
    return element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
  };

  let target = null;
  if (desired) {
    target = elements.find((el) => normalize(getText(el)) === desired);
    if (!target) {
      target = elements.find((el) => normalize(getText(el)).includes(desired));
    }
  }

  if (!target && sourceIndex !== null && elements[sourceIndex]) {
    target = elements[sourceIndex];
  }

  if (!target) {
    target = elements[0];
  }

  let clickTarget = target;
  if (clickSelectors.length) {
    for (const selector of clickSelectors) {
      const node = target.querySelector(selector);
      if (node) {
        clickTarget = node;
        break;
      }
    }
  }

  if (!clickTarget) {
    return { ok: false, error: 'Conversation item not clickable.' };
  }

  const startUrl = window.location.href;
  const triggerClick = (node) => {
    try {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {
      node.click?.();
    }
  };

  triggerClick(clickTarget);
  if (clickTarget !== target) {
    triggerClick(target);
  }

  let currentUrl = startUrl;
  const startTime = Date.now();
  while (Date.now() - startTime < waitTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, waitIntervalMs));
    currentUrl = window.location.href;
    if (currentUrl !== startUrl) break;
  }

  return { ok: true, url: currentUrl };
}

async function openConversationByClick({
  label,
  urlPatterns,
  itemSelectors,
  titleSelectors,
  clickSelectors,
  title,
  sourceIndex,
  waitTimeoutMs,
  waitIntervalMs
} = {}) {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.tabs || !chromeApi?.scripting) {
    return { status: 'error', error: 'Tab access not available.' };
  }

  const tabs = await chromeApi.tabs.query({ url: urlPatterns });
  if (!tabs.length) {
    return { status: 'needs-tab', error: `Open ${label} in a tab to open this conversation.` };
  }

  const tabId = tabs[0].id;
  if (!tabId) {
    return { status: 'error', error: `Unable to access ${label}.` };
  }

  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId },
      func: clickConversationInDom,
      args: [{
        itemSelectors,
        titleSelectors,
        clickSelectors,
        title,
        sourceIndex,
        waitTimeoutMs,
        waitIntervalMs
      }]
    });

    const result = results?.[0]?.result;
    const url = result?.url || '';
    if (!result?.ok) {
      return { status: 'error', error: result?.error || `Unable to open ${label}.`, tabId };
    }

    if (url) {
      return { status: 'ok', url, tabId };
    }

    try {
      const updated = await chromeApi.tabs.get(tabId);
      if (updated?.url) {
        return { status: 'ok', url: updated.url, tabId };
      }
    } catch (_) {}

    return { status: 'ok', url: '', tabId };
  } catch (err) {
    return { status: 'error', error: `Unable to open ${label}.`, tabId };
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...options
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid JSON response');
  }
}

async function listChatGpt({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  let session = null;
  let base = null;

  for (const candidate of CHATGPT_BASES) {
    try {
      session = await fetchJson(`${candidate}/api/auth/session`);
      if (session && session.accessToken) {
        base = candidate;
        break;
      }
    } catch (err) {
      continue;
    }
  }

  if (!session || !session.accessToken || !base) {
    return { items: [], status: 'unauthorized', error: 'Sign in to ChatGPT to sync.' };
  }

  const items = [];
  let offset = 0;
  const headers = {
    Authorization: `Bearer ${session.accessToken}`
  };

  while (offset < maxItems) {
    const limit = Math.min(100, maxItems - offset);
    const data = await fetchJson(
      `${base}/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`,
      { headers }
    );

    const batch = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.conversations)
        ? data.conversations
        : Array.isArray(data)
          ? data
          : [];

    if (!batch.length) {
      break;
    }

    batch.forEach((entry) => {
      const id = entry?.id || entry?.conversation_id;
      if (!id) return;
      items.push({
        id,
        title: entry?.title || entry?.name || 'Untitled conversation',
        url: `${base}/c/${id}`,
        updatedAt: entry?.update_time || entry?.updated_at || entry?.updatedAt
      });
    });

    offset += batch.length;
    if (batch.length < limit) {
      break;
    }
  }

  return { items, status: 'ok' };
}

async function listClaude({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  let orgs = null;
  try {
    orgs = await fetchJson('https://claude.ai/api/organizations');
  } catch (err) {
    return { items: [], status: 'unauthorized', error: 'Sign in to Claude to sync.' };
  }

  const orgArray = Array.isArray(orgs) ? orgs : orgs?.organizations;
  const orgId = orgArray?.[0]?.uuid || orgArray?.[0]?.id;
  if (!orgId) {
    return { items: [], status: 'unauthorized', error: 'Sign in to Claude to sync.' };
  }

  let data = null;
  try {
    data = await fetchJson(`https://claude.ai/api/organizations/${orgId}/chat_conversations`);
  } catch (err) {
    return { items: [], status: 'error', error: 'Unable to load Claude conversations.' };
  }

  const conversations = Array.isArray(data?.chat_conversations)
    ? data.chat_conversations
    : Array.isArray(data?.conversations)
      ? data.conversations
      : Array.isArray(data)
        ? data
        : [];

  const items = conversations.slice(0, maxItems).map((entry) => {
    const id = entry?.uuid || entry?.id;
    return {
      id,
      title: entry?.title || entry?.name || 'Untitled conversation',
      url: id ? `https://claude.ai/chat/${id}` : 'https://claude.ai/new',
      updatedAt: entry?.updated_at || entry?.updatedAt
    };
  }).filter((entry) => entry.id);

  return { items, status: 'ok' };
}

async function listGrok({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  let data = null;
  try {
    data = await fetchJson('https://grok.com/rest/app-chat/conversations');
  } catch (err) {
    return { items: [], status: 'unauthorized', error: 'Sign in to Grok to sync.' };
  }

  const conversations = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.conversations)
      ? data.conversations
      : Array.isArray(data)
        ? data
        : [];

  const items = conversations.slice(0, maxItems).map((entry) => {
    const id = entry?.id || entry?.conversationId || entry?.conversation_id;
    return {
      id,
      title: entry?.title || entry?.name || 'Untitled conversation',
      url: entry?.url || (id ? `https://grok.com/chat/${id}` : 'https://grok.com/'),
      updatedAt: entry?.updatedAt || entry?.updated_at || entry?.last_message_at
    };
  }).filter((entry) => entry.id);

  return { items, status: 'ok' };
}

async function listGeminiFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const config = {
    label: 'Gemini',
    urlPatterns: ['*://gemini.google.com/*'],
    basePath: '/app/',
    idRegexes: ['c_[a-z0-9]+', '\\b[a-f0-9]{16}\\b'],
    origin: 'https://gemini.google.com',
    waitTimeoutMs: 12000,
    waitIntervalMs: 250,
    waitForMinItems: 2,
    waitForStableItems: true,
    stableIntervals: 2,
    allFrames: true,
    world: 'MAIN',
    pickBestTab: true,
    extractor: extractGeminiConversationsFromDom,
    maxItems
  };

  const first = await listFromOpenTab(config);
  const firstCount = Array.isArray(first?.items) ? first.items.length : 0;
  if (first?.status !== 'ok' || firstCount > 1) {
    return first;
  }

  const chromeApi = globalThis.chrome;
  if (!chromeApi?.tabs) {
    return first;
  }

  let activeTab = null;
  try {
    const active = await chromeApi.tabs.query({ active: true, currentWindow: true });
    activeTab = active?.[0] || null;
  } catch (_) {}

  let geminiTab = null;
  try {
    const tabs = await chromeApi.tabs.query({ url: ['*://gemini.google.com/*'] });
    geminiTab = tabs.find((tab) => tab?.active) || tabs[0] || null;
  } catch (_) {}

  if (!geminiTab?.id) {
    return first;
  }

  const canSwitch = !activeTab?.windowId || !geminiTab?.windowId || activeTab.windowId === geminiTab.windowId;

  if (!geminiTab.active && canSwitch) {
    try {
      await chromeApi.tabs.update(geminiTab.id, { active: true });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (_) {}
  }

  const second = await listFromOpenTab({
    ...config,
    waitTimeoutMs: 20000
  });

  const secondCount = Array.isArray(second?.items) ? second.items.length : 0;

  if (activeTab?.id && geminiTab?.id && activeTab.id !== geminiTab.id && canSwitch) {
    try {
      await chromeApi.tabs.update(activeTab.id, { active: true });
    } catch (_) {}
  }

  return secondCount > firstCount ? second : first;
}

async function listQwenFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Qwen',
    urlPatterns: ['*://chat.qwen.ai/*', '*://qwen.ai/*'],
    include: ['/c/', '/chat/', '/conversation/'],
    exclude: ['/chat/new', '/c/new', '/session/new'],
    containerSelectors: ['.session-list-wrapper'],
    itemSelectors: ['.chat-item-drag', '.chat-item-drag-link', 'a[aria-label="chat-item"]'],
    titleSelectors: ['.chat-item-drag-link-content-tip-text', '.chat-item-drag-link-content'],
    pathHints: ['/c/', '/chat/', '/conversation/'],
    basePath: '/c/',
    idRegexes: ['[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'],
    attributeSelectors: [
      'a[href]',
      '[data-href]',
      '[data-url]',
      '[data-id]',
      '[data-conversation-id]',
      '[data-chat-id]',
      '[data-thread-id]',
      '[aria-controls]'
    ],
    attributeScanLimit: 60,
    allowMissingUrl: true,
    maxItems
  });
}

async function listKimiFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Kimi',
    urlPatterns: ['*://kimi.com/*', '*://www.kimi.com/*'],
    include: ['/chat/', '/c/', '/conversation/'],
    exclude: ['/chat/new', '/c/new'],
    containerSelectors: ['[class*="session"]', '[class*="history"]', '[class*="sidebar"]'],
    maxItems
  });
}

async function listZaiFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Z AI',
    urlPatterns: ['*://chat.z.ai/*', '*://z.ai/*'],
    include: ['/chat/', '/c/', '/conversation/'],
    exclude: ['/chat/new', '/c/new'],
    containerSelectors: ['div.relative.flex.flex-col.flex-1.overflow-y-auto.overflow-x-hidden'],
    itemSelectors: ['.w-full.mb-1.relative.group'],
    titleSelectors: ['div[dir="auto"]'],
    pathHints: ['/chat/', '/c/', '/conversation/'],
    basePath: '/chat/',
    idRegexes: [
      'c_[a-z0-9]+',
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      '(?=.*[a-zA-Z])(?=.*\\d)[a-zA-Z0-9]{8,}'
    ],
    attributeSelectors: [
      'a[href]',
      '[data-href]',
      '[data-url]',
      '[data-id]',
      '[data-conversation-id]',
      '[data-chat-id]',
      '[data-thread-id]',
      '[aria-controls]',
      '[aria-describedby]'
    ],
    attributeScanLimit: 60,
    allowMissingUrl: true,
    maxItems
  });
}

async function listPerplexityFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Perplexity Library',
    urlPatterns: ['*://www.perplexity.ai/library*', '*://perplexity.ai/library*'],
    include: ['/search/', '/thread/'],
    exclude: ['/discover', '/labs', '/settings', '/spaces', '/library?tab='],
    containerSelectors: [
      '[data-testid="LibraryItemList"]',
      '[data-testid*="LibraryItemList"]',
      '[data-component="LibraryItemList"]',
      '[data-testid*="Library"]',
      'main'
    ],
    itemSelectors: [
      'a[href^="/search/"]',
      'a[href^="/thread/"]',
      'a[href*="/search/"]',
      'a[href*="/thread/"]',
      '[data-testid*="LibraryItem"] a[href]',
      '[data-testid*="library-item"] a[href]',
      'a.relative[href]'
    ],
    titleSelectors: ['[data-testid="library-item-title"]', '[data-testid*="library-item-title"]', 'h3', 'p'],
    pathHints: ['/search/', '/thread/'],
    maxItems
  });
}

async function listDeepseekFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'DeepSeek',
    urlPatterns: ['*://chat.deepseek.com/*'],
    include: ['/chat/', '/c/', '/a/'],
    exclude: ['/chat/new', '/c/new'],
    containerSelectors: ['[class*="session"]', '[class*="history"]', '[class*="sidebar"]'],
    maxItems
  });
}

async function listCopilotFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Copilot',
    urlPatterns: ['*://copilot.microsoft.com/*'],
    include: ['/chats/', '/chat/'],
    exclude: ['/chat/new'],
    containerSelectors: ['div.grow', 'main'],
    itemSelectors: ['[role="option"]'],
    titleSelectors: ['p.truncate', 'p[title]'],
    pathHints: ['/chats/', '/chat/'],
    basePath: '/chats/',
    idRegexes: ['[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'],
    attributeSelectors: [
      'a[href]',
      '[data-href]',
      '[data-url]',
      '[data-id]',
      '[data-conversation-id]',
      '[data-chat-id]',
      '[data-thread-id]',
      '[aria-controls]'
    ],
    attributeScanLimit: 60,
    allowMissingUrl: true,
    maxItems
  });
}

async function listNotebookLMFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'NotebookLM',
    urlPatterns: ['*://notebooklm.google.com/*'],
    include: ['/notebook/', '/app/'],
    containerSelectors: ['.project-buttons-flow', '.my-projects-container', '[data-testid*="project"]', '.projects-grid', 'main', '.notebook-list'],
    itemSelectors: [
      'a[href*="/notebook/"]',
      '[data-testid*="project-card"]',
      'div[role="button"]',
      '.project-card',
      '.notebook-card',
      '.project-button',
      '.project-button-card'
    ],
    titleSelectors: [
      '.project-title',
      '[data-testid*="project-title"]',
      '.notebook-title',
      '.project-button-title',
      'div[role="button"]',
      'h3',
      'h2'
    ],
    pathHints: ['/notebook/', '/app/'],
    allowMissingUrl: true,
    maxItems
  });
}

async function listAIStudioFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const titleCleanup = (text = '') => {
    const cleaned = (text || '').replace(/\b(chat_bubble|star|bolt|auto_awesome|add|library_add|library_books|book|folder)\b/gi, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
  };

  return listFromOpenTab({
    label: 'AI Studio',
    urlPatterns: ['*://aistudio.google.com/*'],
    include: ['/app/', '/app/library', '/prompts/'],
    containerSelectors: ['.lib-table-wrapper', 'table', '[role="main"]', 'main', '.mdc-data-table__content', 'ul'],
    itemSelectors: [
      'tr.mdc-data-table__row',
      'tr',
      '.library-item',
      '[data-testid*="library-item"]',
      'a[href*="/prompts/"]',
      '.prompt-link-wrapper',
      '.prompt-link'
    ],
    titleSelectors: [
      '.name-btn',
      '.cdk-column-name',
      '.name-cell span:not(.material-symbols-outlined)',
      '.name-cell',
      '.title span:not(.material-symbols-outlined)',
      '.title',
      '.prompt-link',
      'a[href*="/prompts/"]'
    ],
    pathHints: ['/prompts/', '/app/'],
    allowMissingUrl: true,
    titleCleanup,
    maxItems
  });
}

async function listMistralFromTab({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
  return listFromOpenTab({
    label: 'Mistral',
    urlPatterns: ['*://chat.mistral.ai/*'],
    include: ['/chat/'],
    exclude: ['/chat/new'],
    containerSelectors: ['ul[data-sidebar="menu"]', '[data-sidebar="menu"]'],
    itemSelectors: ['a[data-sidebar="menu-main-button"]', 'li[data-sidebar="menu-item"] a[data-sidebar="menu-main-button"]'],
    titleSelectors: ['div.block', 'div.truncate'],
    pathHints: ['/chat/'],
    allowMissingUrl: true,
    maxItems
  });
}

function toMs(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const num = Number(value);
    if (!Number.isNaN(num)) return toMs(num);
    return null;
  }
  if (typeof value !== 'number') return null;
  if (value < 1e12) return value * 1000;
  return value;
}

function formatRelativeTime(value) {
  const ms = toMs(value);
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'Updated just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export class ConversationHubManager {
  constructor() {
    this.conversations = [];
    this.filteredConversations = [];
    this.statusByService = [];
    this.lastSync = null;
    this.searchQuery = '';
    this.selectedService = 'all';
    this.isOpen = false;
    this.hasSyncedOnce = false;
    this.init();
  }

  init() {
    this.ensureToolbarButton();
    this.cacheElements();
    this.bindEvents();
    this.populateFilterOptions();
    this.applyOpenModeSetting();
    this.restoreCache();
    this.updateLanguage();
    this.ensurePort();
  }

  ensurePort() {
    try {
      this.port = chrome.runtime.connect({ name: 'premium-status' });
      this.port.onMessage.addListener((msg) => {
        if (msg?.type === 'PREMIUM_STATUS_UPDATED' && this.isOpen) {
          // Refresh view if open
          this.refreshView();
        }
      });
    } catch (_) { }
  }

  async refreshView() {
    // Re-run the open logic to toggle teaser/content
    let isPremium = false;
    try {
      const bg = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
      isPremium = !!(bg && bg.isPremium);
    } catch (_) { }

    if (this.premiumTeaser && this.hubContent) {
      if (isPremium) {
        this.premiumTeaser.style.display = 'none';
        this.hubContent.style.display = 'block';
        if (!this.hasSyncedOnce) {
          this.sync();
        }
      } else {
        this.premiumTeaser.style.display = 'block';
        this.hubContent.style.display = 'none';
      }
    }
    return isPremium;
  }

  restoreCache() {
    const cache = readConversationHubCache();
    if (!cache) return;

    const allItems = [];
    const status = [];
    for (const adapter of ADAPTERS) {
      const entry = cache.services?.[adapter.id];
      const items = Array.isArray(entry?.items) ? entry.items : [];
      items.forEach((item) => {
        allItems.push({
          ...item,
          serviceId: adapter.id,
          serviceLabel: adapter.label
        });
      });

      status.push({
        id: adapter.id,
        label: adapter.label,
        status: entry?.status || 'cached',
        error: ''
      });
    }

    if (!allItems.length) return;
    this.conversations = allItems;
    this.statusByService = status;
    const lastSyncMs = Number(cache.lastSyncMs);
    this.lastSync = Number.isFinite(lastSyncMs) && lastSyncMs > 0 ? new Date(lastSyncMs) : null;
    this.hasSyncedOnce = true;
    this.applyFilters();
    this.updateStatusLine();
  }

  ensureToolbarButton() {
    const toolbar = document.getElementById('toolbar');
    const splitViewBtn = document.getElementById('split-view-btn');
    if (!toolbar || !splitViewBtn) return;

    if (document.getElementById('conversation-hub-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'conversation-hub-btn';
    btn.className = 'btn';
    btn.setAttribute('draggable', 'true');
    btn.setAttribute('aria-label', 'Open conversations');
    btn.setAttribute('title', 'Conversations');

    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h2v2.2L8.5 15H20V6H4Zm3 3h10v2H7V9Zm0 4h7v2H7v-2Z" fill="currentColor"/>
      </svg>
      <span>Conversations</span>
    `;

    if (splitViewBtn) {
      toolbar.insertBefore(btn, splitViewBtn);
    } else {
      const supportBtn = document.getElementById('support-btn');
      if (supportBtn) {
        toolbar.insertBefore(btn, supportBtn);
      } else {
        toolbar.appendChild(btn);
      }
    }
  }

  cacheElements() {
    this.panel = document.getElementById('conversation-hub');
    this.premiumTeaser = document.getElementById('conversation-hub-premium-teaser');
    this.hubContent = document.getElementById('conversation-hub-content');
    this.hubPremiumCta = document.getElementById('hub-premium-cta-button');

    this.searchInput = document.getElementById('conversation-hub-search');
    this.filterSelect = document.getElementById('conversation-hub-filter');
    this.syncBtn = document.getElementById('conversation-hub-sync');
    this.list = document.getElementById('conversation-hub-list');
    this.emptyState = document.getElementById('conversation-hub-empty');
    this.statusEl = document.getElementById('conversation-hub-status');
    
    // Settings & Actions
    this.settingsBtn = document.getElementById('conversation-hub-settings-btn');
    this.settingsMenu = document.getElementById('hub-settings-menu');
    this.clearBtn = document.getElementById('conversation-hub-clear');
    this.exportTrigger = document.getElementById('hub-export-trigger');
    this.openModeToggle = document.getElementById('toggle-conversation-open-mode');
    
    // Export Modal
    this.exportModal = document.getElementById('hub-export-modal');
    this.exportFormatSelect = document.getElementById('export-format');
    this.exportServiceSelect = document.getElementById('export-service');
    this.exportCancelBtn = document.getElementById('export-cancel-btn');
    this.exportConfirmBtn = document.getElementById('export-confirm-btn');

    // Clear Modal
    this.clearModal = document.getElementById('hub-clear-modal');
    this.clearCancelBtn = document.getElementById('clear-cancel-btn');
    this.clearConfirmBtn = document.getElementById('clear-confirm-btn');
  }

  bindEvents() {
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', (event) => {
        const convoBtn = event.target.closest('#conversation-hub-btn');
        if (convoBtn) {
          event.preventDefault();
          this.toggle();
          return;
        }

        if (!this.isOpen) return;
        const otherButton = event.target.closest('.btn');
        if (otherButton && otherButton.id !== 'conversation-hub-btn') {
          this.close();
        }
      });
    }

    // Settings Menu Toggle
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.settingsMenu?.classList.toggle('active');
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.settingsMenu?.classList.contains('active') && !this.settingsMenu.contains(e.target) && e.target !== this.settingsBtn) {
        this.settingsMenu.classList.remove('active');
      }
    });

    if (this.hubPremiumCta) {
      this.hubPremiumCta.addEventListener('click', (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('openPremiumModal', { detail: { source: 'conversationHub' } }));
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.settingsMenu?.classList.remove('active');
        this.clearHistory();
      });
    }

    if (this.exportTrigger) {
      this.exportTrigger.addEventListener('click', () => {
        this.settingsMenu?.classList.remove('active');
        this.showExportModal();
      });
    }

    if (this.openModeToggle) {
      this.openModeToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('conversationOpenInNewTab', String(enabled));
        localStorage.setItem('conversationOpenInSidePanel', String(!enabled));
      });
    }

    // Export Modal Events
    if (this.exportCancelBtn) {
      this.exportCancelBtn.addEventListener('click', () => this.hideExportModal());
    }

    if (this.exportConfirmBtn) {
      this.exportConfirmBtn.addEventListener('click', () => this.handleExport());
    }

    // Clear Modal Events
    if (this.clearCancelBtn) {
      this.clearCancelBtn.addEventListener('click', () => this.hideClearModal());
    }

    if (this.clearConfirmBtn) {
      this.clearConfirmBtn.addEventListener('click', () => {
        this.performClearHistory();
        this.hideClearModal();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (event) => {
        this.searchQuery = event.target.value.trim().toLowerCase();
        this.applyFilters();
      });
    }

    if (this.filterSelect) {
      this.filterSelect.addEventListener('change', (event) => {
        this.selectedService = event.target.value;
        this.applyFilters();
      });
    }

    if (this.syncBtn) {
      this.syncBtn.addEventListener('click', () => this.sync());
    }

    document.addEventListener('keydown', (event) => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') {
        this.close();
      }
    });

    const list = this.list;
    if (list) {
      const getConversationFromRow = (row) => {
        if (!row) return null;
        const idx = Number(row.dataset.index);
        if (!Number.isFinite(idx)) return null;
        return this.filteredConversations[idx] || null;
      };

      list.addEventListener('click', (event) => {
        const row = event.target.closest('.conversation-item');
        if (!row) return;
        if (row.classList.contains('disabled')) return;
        const convo = getConversationFromRow(row);
        if (!convo) return;
        void this.openConversation(convo);
      });

      list.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('.conversation-item');
        if (!row) return;
        if (row.classList.contains('disabled')) return;
        event.preventDefault();
        const convo = getConversationFromRow(row);
        if (!convo) return;
        void this.openConversation(convo);
      });
    }
  }

  applyOpenModeSetting() {
    const toggle = document.getElementById('toggle-conversation-open-mode');
    if (!toggle) return;
    const storedNew = localStorage.getItem('conversationOpenInNewTab');
    const storedOld = localStorage.getItem('conversationOpenInSidePanel');
    let enabled = false;
    if (storedNew !== null) {
      enabled = storedNew === 'true';
    } else if (storedOld !== null) {
      enabled = storedOld === 'false';
    }
    toggle.checked = enabled;
    localStorage.setItem('conversationOpenInNewTab', String(enabled));
    localStorage.setItem('conversationOpenInSidePanel', String(!enabled));
  }

  updateLanguage(messages = window._i18nMessages) {
    const t = (key, fallback) => messages?.[key]?.message || fallback;

    const btn = document.getElementById('conversation-hub-btn');
    if (btn) {
      const span = btn.querySelector('span');
      if (span) span.textContent = t('conversationHubButton', 'Conversations');
      const label = t('conversationHubButtonTitle', 'Conversations');
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }

    if (this.searchInput) {
      this.searchInput.placeholder = t('conversationHubSearchPlaceholder', 'Search conversations');
    }

    if (this.syncBtn) {
      this.syncBtn.textContent = t('conversationHubSync', 'Sync');
    }

    if (this.settingsBtn) {
      this.settingsBtn.title = t('settings', 'Settings');
    }

    if (this.emptyState) {
      this.emptyState.textContent = t('conversationHubEmpty', 'No conversations yet.');
    }

    const teaserDesc = this.panel?.querySelector('.conversation-hub-premium-teaser .support-description');
    if (teaserDesc) {
      teaserDesc.textContent = t('conversationHubPremiumDescription', 'The Conversation Hub allows you to see and search all your AI conversations in one place. This is a premium feature to support the development.');
    }

    this.populateFilterOptions();

    if (this.statusEl && !this.statusEl.dataset.syncing && !this.hasSyncedOnce) {
      this.statusEl.textContent = t('conversationHubReady', 'Ready to sync.');
    }
  }

  populateFilterOptions() {
    if (!this.filterSelect) return;
    const current = this.filterSelect.value;

    this.filterSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = window._i18nMessages?.conversationHubAllServices?.message || 'All services';
    this.filterSelect.appendChild(allOption);

    ADAPTERS.forEach((adapter) => {
      const option = document.createElement('option');
      option.value = adapter.id;
      option.textContent = adapter.label;
    this.filterSelect.appendChild(option);
  });

  this.filterSelect.value = current || 'all';
  this.selectedService = this.filterSelect.value;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  showClearModal() {
    this.clearModal?.classList.add('active');
  }

  hideClearModal() {
    this.clearModal?.classList.remove('active');
  }

  clearHistory() {
    this.showClearModal();
  }

  performClearHistory() {
    localStorage.removeItem(CONVERSATION_HUB_CACHE_KEY);
    this.conversations = [];
    this.filteredConversations = [];
    this.statusByService = [];
    this.lastSync = null;
    this.hasSyncedOnce = false;
    this.applyFilters();
    this.updateStatusLine();
  }

  showExportModal() {
    if (!this.exportModal) return;
    
    // Populate service select
    if (this.exportServiceSelect) {
      this.exportServiceSelect.innerHTML = '<option value="all">All Services</option>';
      ADAPTERS.forEach(adapter => {
        const opt = document.createElement('option');
        opt.value = adapter.id;
        opt.textContent = adapter.label;
        this.exportServiceSelect.appendChild(opt);
      });
    }
    
    this.exportModal.classList.add('active');
  }

  hideExportModal() {
    this.exportModal?.classList.remove('active');
  }

  handleExport() {
    const format = this.exportFormatSelect?.value || 'md';
    const service = this.exportServiceSelect?.value || 'all';
    
    let itemsToExport = this.conversations;
    if (service !== 'all') {
      itemsToExport = this.conversations.filter(item => item.serviceId === service);
    }

    if (!itemsToExport.length) {
      alert('No conversations found for the selected service.');
      return;
    }

    if (format === 'md') {
      this.exportAsMarkdown(itemsToExport);
    } else {
      this.exportAsJSON(itemsToExport);
    }
    
    this.hideExportModal();
  }

  exportAsMarkdown(items = this.conversations) {
    let md = '# AI Side Panel - Conversation History\n\n';
    md += `Generated on: ${new Date().toLocaleString()}\n\n`;

    items.forEach(item => {
      md += `## ${item.title || 'Untitled'}\n`;
      md += `- **Service**: ${item.serviceLabel || item.serviceId}\n`;
      if (item.updatedAt) md += `- **Last Updated**: ${new Date(item.updatedAt).toLocaleString()}\n`;
      if (item.url) md += `- **URL**: ${item.url}\n`;
      md += '\n';
    });

    this.downloadFile(md, 'conversations.md', 'text/markdown');
  }

  exportAsJSON(items = this.conversations) {
    const data = JSON.stringify(items, null, 2);
    this.downloadFile(data, 'conversations.json', 'application/json');
  }

  downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async open() {
    if (!this.panel) return;
    if (this.isOpen) return;
    this.isOpen = true;

    const isPremium = await this.refreshView();

    const iframe = document.getElementById('main-iframe');
    const supportPage = document.getElementById('support-page');
    const splitViewBtn = document.getElementById('split-view-btn');
    const toolbar = document.getElementById('toolbar');

    if (supportPage) {
      supportPage.classList.remove('active');
      supportPage.style.display = 'none';
    }

    if (iframe) {
      iframe.style.display = 'none';
    }

    try {
      window.navBarManager?.toggleLoadingState(false);
    } catch (_) {}

    if (splitViewBtn) {
      splitViewBtn.disabled = true;
      splitViewBtn.title = 'Exit conversations first';
    }

    if (toolbar) {
      toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
      const convoBtn = document.getElementById('conversation-hub-btn');
      if (convoBtn) convoBtn.classList.add('active');
    }

    this.panel.style.display = 'flex';
    this.panel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      this.panel.classList.add('active');
    });

    if (this.searchInput && isPremium) {
      setTimeout(() => this.searchInput?.focus(), 150);
    }
  }

  close() {
    if (!this.panel || !this.isOpen) return;
    this.isOpen = false;

    const splitViewBtn = document.getElementById('split-view-btn');
    const toolbar = document.getElementById('toolbar');
    if (splitViewBtn) {
      splitViewBtn.disabled = false;
      splitViewBtn.title = '';
    }

    this.panel.classList.remove('active');
    this.panel.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!this.isOpen) {
        this.panel.style.display = 'none';
      }
    }, 200);

    const iframe = document.getElementById('main-iframe');
    if (iframe) {
      iframe.style.display = 'block';
    }

    if (toolbar) {
      toolbar.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
      if (iframe?.src) {
        try {
          const host = new URL(iframe.src).hostname;
          const match = [...toolbar.querySelectorAll('.btn[data-url]')].find((btn) => {
            try {
              const url = btn.getAttribute('data-url');
              if (!url) return false;
              const btnHost = new URL(url).hostname;
              return btnHost === host || iframe.src.includes(btnHost);
            } catch {
              return false;
            }
          });
          if (match) match.classList.add('active');
        } catch { }
      }
    }

  }

  async sync() {
    if (this.filterSelect) {
      this.selectedService = this.filterSelect.value || this.selectedService;
    }
    const targetService = this.selectedService !== 'all' ? this.selectedService : null;
    const adapters = targetService
      ? ADAPTERS.filter((adapter) => adapter.id === targetService)
      : ADAPTERS;

    if (!adapters.length) {
      return;
    }

    const cache = readConversationHubCache() || {
      version: CONVERSATION_HUB_CACHE_VERSION,
      lastSyncMs: 0,
      services: {}
    };

    if (this.syncBtn) {
      this.syncBtn.disabled = true;
      this.syncBtn.textContent = 'Syncing...';
    }
    if (this.statusEl) {
      const label = targetService ? adapters[0].label : 'conversations';
      this.statusEl.textContent = `Syncing ${label}...`;
      this.statusEl.dataset.syncing = 'true';
    }

    const results = await Promise.all(
      adapters.map(async (adapter) => {
        try {
          const res = await adapter.list();
          return { adapter, res };
        } catch (err) {
          return { adapter, res: { items: [], status: 'error', error: err?.message || 'Sync failed.' } };
        }
      })
    );

    const previousByService = new Map();
    (this.conversations || []).forEach((item) => {
      const sid = item?.serviceId;
      if (!sid) return;
      if (!previousByService.has(sid)) previousByService.set(sid, []);
      previousByService.get(sid).push(item);
    });

    const toCacheItem = (item) => ({
      id: item?.id || '',
      title: item?.title || '',
      url: item?.url || '',
      updatedAt: item?.updatedAt,
      sourceIndex: item?.sourceIndex
    });

    const previousItemsFor = (serviceId) => {
      const fromMemory = previousByService.get(serviceId);
      if (Array.isArray(fromMemory) && fromMemory.length) return fromMemory;
      const fromCache = cache.services?.[serviceId]?.items;
      if (Array.isArray(fromCache) && fromCache.length) return fromCache;
      return [];
    };

    const effectiveByService = new Map();
    ADAPTERS.forEach((adapter) => {
      if (!targetService || adapter.id !== targetService) {
        effectiveByService.set(adapter.id, previousItemsFor(adapter.id));
      }
    });

    const statusMap = new Map(
      Array.isArray(this.statusByService)
        ? this.statusByService.map((entry) => [entry.id, entry])
        : []
    );

    let didUpdateAny = false;

    results.forEach(({ adapter, res }) => {
      const nextStatus = res?.status || 'ok';
      const isFresh = nextStatus === 'ok' || nextStatus === 'empty';
      const items = Array.isArray(res?.items) ? res.items : [];

      if (isFresh) {
        didUpdateAny = true;
        cache.services[adapter.id] = {
          label: adapter.label,
          status: nextStatus,
          savedAtMs: Date.now(),
          items: items.slice(0, DEFAULT_MAX_ITEMS).map(toCacheItem)
        };
      }

      const effectiveItems = isFresh ? items : previousItemsFor(adapter.id);
      effectiveByService.set(adapter.id, effectiveItems);

      statusMap.set(adapter.id, {
        id: adapter.id,
        label: adapter.label,
        status: nextStatus,
        error: res?.error || ''
      });
    });

    const allItems = [];
    const seen = new Set();
    ADAPTERS.forEach((adapter) => {
      const items = effectiveByService.get(adapter.id) || [];
      items.forEach((item) => {
        const key = `${adapter.id}:${item?.id || item?.url}`;
        if (seen.has(key)) return;
        seen.add(key);
        allItems.push({
          ...item,
          serviceId: adapter.id,
          serviceLabel: adapter.label
        });
      });
    });

    this.conversations = allItems.sort((a, b) => {
      const aTime = toMs(a.updatedAt) || 0;
      const bTime = toMs(b.updatedAt) || 0;
      return bTime - aTime;
    });
    this.statusByService = ADAPTERS
      .map((adapter) => statusMap.get(adapter.id))
      .filter(Boolean);
    if (didUpdateAny) {
      this.lastSync = new Date();
      cache.lastSyncMs = this.lastSync.getTime();
      writeConversationHubCache(cache);
    }
    this.hasSyncedOnce = true;

    this.applyFilters();
    this.updateStatusLine();

    if (this.syncBtn) {
      this.syncBtn.disabled = false;
      this.syncBtn.textContent = 'Sync';
    }

    if (this.statusEl) {
      this.statusEl.dataset.syncing = '';
    }
  }

  applyFilters() {
    const query = this.searchQuery;
    const service = this.filterSelect?.value || this.selectedService || 'all';
    this.selectedService = service;

    const filtered = this.conversations.filter((item) => {
      if (service !== 'all' && item.serviceId !== service) return false;
      if (!query) return true;
      const haystack = `${item.title} ${item.serviceLabel}`.toLowerCase();
      return haystack.includes(query);
    });

    this.filteredConversations = filtered;
    this.renderList();
  }

  renderList() {
    if (!this.list) return;
    this.list.innerHTML = '';

    if (!this.filteredConversations.length) {
      if (this.emptyState) this.emptyState.classList.add('visible');
      return;
    }

    if (this.emptyState) this.emptyState.classList.remove('visible');

    this.filteredConversations.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'conversation-item';
      if (item.url) {
        row.dataset.url = item.url;
      }
      row.dataset.service = item.serviceId || '';
      row.dataset.index = String(index);
      row.setAttribute('role', 'button');
      const canOpen = Boolean(item.url || OPEN_TAB_HANDLERS[item.serviceId]);
      row.setAttribute('tabindex', canOpen ? '0' : '-1');
      if (!canOpen) {
        row.classList.add('disabled');
        row.setAttribute('aria-disabled', 'true');
      }

      // Add icon
      const icon = document.createElement('div');
      icon.className = 'conversation-icon';
      const logoUrl = `logos/${item.serviceId}.svg`;
      const needsInvert = ['chatgpt', 'grok', 'mistral', 'perplexity', 'qwen', 'zai'].includes(item.serviceId);
      icon.innerHTML = `<img src="${logoUrl}" alt="${item.serviceLabel}" style="width: 20px; height: 20px; ${needsInvert ? 'filter: brightness(0) invert(1);' : ''}">`;

      const main = document.createElement('div');
      main.className = 'conversation-item-main';

      const title = document.createElement('div');
      title.className = 'conversation-title';
      title.textContent = item.title || 'Untitled conversation';

      const meta = document.createElement('div');
      meta.className = 'conversation-meta';

      const service = document.createElement('span');
      service.className = 'conversation-service';
      service.textContent = item.serviceLabel || item.serviceId || 'Service';

      const updated = document.createElement('span');
      updated.className = 'conversation-updated';
      updated.textContent = formatRelativeTime(item.updatedAt);

      meta.appendChild(service);
      if (updated.textContent) {
        meta.appendChild(updated);
      }

      const indicator = document.createElement('span');
      indicator.className = 'conversation-open-indicator';
      indicator.innerHTML = canOpen ? `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"></path>
        </svg>
      ` : '';

      row.appendChild(icon);
      main.appendChild(title);
      main.appendChild(meta);

      row.appendChild(main);
      row.appendChild(indicator);

      this.list.appendChild(row);
    });
  }

  updateStatusLine() {
    if (!this.statusEl) return;

    const total = this.conversations.length;
    const selectedService = this.selectedService;
    const selectedAdapter = selectedService !== 'all'
      ? ADAPTERS.find((adapter) => adapter.id === selectedService)
      : null;
    const selectedLabel = selectedAdapter?.label || 'Selected service';
    const selectedCount = selectedAdapter
      ? this.conversations.filter((item) => item.serviceId === selectedService).length
      : total;
    const failures = this.statusByService.filter((svc) => svc.status === 'error' || svc.status === 'unauthorized');
    const needsTab = this.statusByService.filter((svc) => svc.status === 'needs-tab');
    const unsupported = this.statusByService.filter((svc) => svc.status === 'unsupported');

    const parts = [];
    if (selectedAdapter) {
      parts.push(`Synced ${selectedCount} ${selectedLabel} conversation${selectedCount === 1 ? '' : 's'}.`);
      if (selectedCount !== total) {
        parts.push(`Total ${total} across all services.`);
      }
    } else {
      parts.push(`Synced ${total} conversation${total === 1 ? '' : 's'}.`);
    }

    if (failures.length) {
      parts.push(`${failures.length} service${failures.length === 1 ? '' : 's'} need sign-in.`);
    }

    if (needsTab.length) {
      parts.push(`${needsTab.length} service${needsTab.length === 1 ? '' : 's'} need an open tab.`);
    }

    if (unsupported.length) {
      parts.push(`${unsupported.length} service${unsupported.length === 1 ? '' : 's'} not supported yet.`);
    }

    if (this.lastSync) {
      const time = this.lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      parts.push(`Last sync ${time}.`);
    }

    this.statusEl.textContent = parts.join(' ');
  }

  async openConversation(item) {
    if (!item) return;
    const openInNewTab = localStorage.getItem('conversationOpenInNewTab');
    const shouldOpenInNewTab = openInNewTab === 'true';
    let url = item.url || '';
    const serviceId = item.serviceId || '';

    if (!url) {
      const handler = OPEN_TAB_HANDLERS[serviceId];
      if (!handler) {
        if (this.statusEl) {
          this.statusEl.textContent = 'Unable to open this conversation.';
        }
        return;
      }

      if (this.statusEl) {
        this.statusEl.textContent = `Opening ${handler.label} conversation...`;
      }

      const result = await openConversationByClick({
        ...handler,
        title: item.title,
        sourceIndex: item.sourceIndex
      });

      if (result?.status !== 'ok') {
        if (this.statusEl) {
          this.statusEl.textContent = result?.error || `Unable to open ${handler.label}.`;
        }
        if (result?.tabId) {
          try {
            chrome.tabs.update(result.tabId, { active: true });
          } catch (_) {}
        }
        return;
      }

      if (result?.url) {
        url = result.url;
      } else if (result?.tabId) {
        if (this.statusEl) {
          this.statusEl.textContent = `Opened in ${handler.label} tab.`;
        }
        try {
          chrome.tabs.update(result.tabId, { active: true });
        } catch (_) {}
        return;
      }
    }

    if (!shouldOpenInNewTab) {
      if (window.navBarManager?.openConversationUrl) {
        window.navBarManager.openConversationUrl(url, serviceId);
      } else {
        const iframe = document.getElementById('main-iframe');
        if (iframe) iframe.src = url;
      }
      this.close();
    } else {
      try {
        chrome.tabs.create({ url });
      } catch (_) {
        window.open(url, '_blank', 'noopener');
      }
    }
  }
}
