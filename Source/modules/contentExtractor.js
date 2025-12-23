// Content Extractor Manager Module
import { extractors, topExtractors, searchExtractors } from './optimized-extractors/index.js';

export class ContentExtractorManager {
  constructor() {
    this.isExtracting = false;
    this.feedbackTimeout = null;
    this.translations = {};
    this.init();
  }

  init() {
    this.addExtractorButton();
    this.initializeEventHandlers();
    this.initializeToggleState();
    this.updateLanguage(); // Ensure localization on init
  }
  updateLanguage(translations) {
    // Accept translations object, or fetch from global if not provided
    if (translations) {
      this.translations = translations;
    } else if (window._i18nMessages) {
      this.translations = window._i18nMessages;
    }

    // Update extractor button text
    const btn = document.getElementById('content-extractor-btn');
    if (btn) {
      const span = btn.querySelector('span');
      if (span) {
        span.textContent = this._t('extractButton') || 'Extract';
      }
      btn.title = this._t('extractButtonTitle') || 'Extract and copy content from current page';
      btn.setAttribute('aria-label', btn.title);
    }

    // Update modal if open
    const modal = document.getElementById('extraction-options-modal');
    if (modal) {
      const header = modal.querySelector('.extraction-modal-header h3');
      if (header) header.textContent = this._t('extractionModalTitle') || 'Choose Extraction Method';
      const searchInput = modal.querySelector('#extraction-search');
      if (searchInput) searchInput.placeholder = this._t('extractionSearchPlaceholder') || 'Search extractors...';
    }
  }

  _t(key, ...args) {
    // Helper to get translation string and replace $1, $2, ...
    if (this.translations && this.translations[key]) {
      let msg = this.translations[key].message;
      args.forEach((val, idx) => {
        msg = msg.replace(new RegExp(`\\$${idx+1}`, 'g'), val);
      });
      return msg;
    }
    return null;
  }

  initializeToggleState() {
    // Check if the content extractor should be visible based on settings
    const showExtractor = localStorage.getItem('show_content-extractor');
    const btn = document.getElementById('content-extractor-btn');

    if (btn) {
      // Default to visible if no setting exists
      const isVisible = showExtractor !== null ? showExtractor === 'true' : true;
      btn.style.display = isVisible ? 'flex' : 'none';
    }
  }

  addExtractorButton() {
    const toolbar = document.getElementById('toolbar');
    const splitViewBtn = document.getElementById('split-view-btn');
    const supportBtn = document.getElementById('support-btn');

    if (!toolbar || !supportBtn) {
      console.error('Required elements not found for content extractor button');
      return;
    }

    // Create the content extractor button
    const extractorBtn = document.createElement('button');
    extractorBtn.id = 'content-extractor-btn';
    extractorBtn.className = 'btn';
    extractorBtn.title = 'Extract and copy content from current page';
    extractorBtn.setAttribute('draggable', 'true');
    extractorBtn.setAttribute('aria-label', 'Extract and copy content from current page');
    extractorBtn.setAttribute('role', 'button');
    extractorBtn.setAttribute('tabindex', '0');

    extractorBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
      </svg>
      <span>Extract</span>
    `;

    // Insert before split view button to keep system buttons at the end
    if (splitViewBtn) {
      toolbar.insertBefore(extractorBtn, splitViewBtn);
    } else {
      toolbar.insertBefore(extractorBtn, supportBtn);
    }

    // Add keyboard support
    extractorBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleExtractorClick();
      }
    });
  }

  initializeEventHandlers() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;

    // Use event delegation to handle the extractor button click
    toolbar.addEventListener('click', (e) => {
      const extractorButton = e.target.closest('#content-extractor-btn');
      if (extractorButton) {
        this.handleExtractorClick();
      }
    });
  }

  async handleExtractorClick() {
    if (this.isExtracting) return;

    // Show extraction options modal
    this.showExtractionOptions();
  }

  showExtractionOptions() {
    // Remove any existing modal
    const existingModal = document.getElementById('extraction-options-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'extraction-options-modal';
    modal.className = 'extraction-modal';

    modal.innerHTML = `
      <div class="extraction-modal-content">
        <div class="extraction-modal-header">
          <h3>${this._t('extractionModalTitle') || 'Choose Extraction Method'}</h3>
          <button class="extraction-modal-close" aria-label="${this._t('extractionModalClose') || 'Close'}">&times;</button>
        </div>
        <div class="extraction-modal-body">
          <div class="extraction-search-container">
            <input type="text" id="extraction-search" placeholder="${this._t('extractionSearchPlaceholder') || 'Search extractors...'}" class="extraction-search-input">
            <svg class="extraction-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
          <div class="extraction-options" id="extraction-options-list">
            <!-- Options will be populated by JavaScript -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Populate options and set up event listeners
    this.populateExtractionOptions();
    this.setupModalEventListeners(modal);

    // Show modal with animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  populateExtractionOptions(searchQuery = '') {
    const optionsList = document.getElementById('extraction-options-list');
    if (!optionsList) return;

    // Get filtered extractors
    const filteredKeys = searchExtractors(searchQuery);

    // Sort to show top extractors first
    const sortedKeys = [
      ...topExtractors.filter(key => filteredKeys.includes(key)),
      ...filteredKeys.filter(key => !topExtractors.includes(key))
    ];

    optionsList.innerHTML = '';

    sortedKeys.forEach(key => {
      const extractor = extractors[key];
      const option = document.createElement('button');
      option.className = 'extraction-option';
      option.setAttribute('data-type', key);

      option.innerHTML = `
        <div class="extraction-option-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            ${extractor.icon}
          </svg>
        </div>
        <div class="extraction-option-content">
          <div class="extraction-option-title">${extractor.name}</div>
          <div class="extraction-option-desc">${extractor.description}</div>
        </div>
      `;

      optionsList.appendChild(option);
    });
  }

  setupModalEventListeners(modal) {
    const closeBtn = modal.querySelector('.extraction-modal-close');
    const searchInput = modal.querySelector('#extraction-search');
    const optionsList = modal.querySelector('#extraction-options-list');

    // Close button
    closeBtn.addEventListener('click', () => this.hideExtractionOptions());

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideExtractionOptions();
      }
    });

    // Search functionality
    searchInput.addEventListener('input', (e) => {
      this.populateExtractionOptions(e.target.value);
    });

    // Option selection (using event delegation)
    optionsList.addEventListener('click', (e) => {
      const option = e.target.closest('.extraction-option');
      if (option) {
        const type = option.getAttribute('data-type');
        this.hideExtractionOptions();
        this.performExtraction(type);
      }
    });
  }

  hideExtractionOptions() {
    const modal = document.getElementById('extraction-options-modal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
  }

  async performExtraction(type) {
    if (this.isExtracting) return;

    try {
      this.isExtracting = true;
      this.showLoadingState();

      const result = await this.extractContentFromActiveTab(type);

      if (result.success) {
        await this.copyToClipboard(result.formattedOutput);
        this.showSuccessState();
        // Use dynamic translation for success message
        const successMsg = this._t('extractionSuccessMessage', type.charAt(0).toUpperCase() + type.slice(1)) || `${type.charAt(0).toUpperCase() + type.slice(1)} content copied to clipboard!`;
        this.showFeedback('success', successMsg);
      } else {
        const errorMsg = result.error || this._t('extractionErrorFailed') || 'Failed to extract content';
        this.showFeedback('error', errorMsg);
      }
    } catch (error) {
      console.error('Content extraction error:', error);

      // Provide more specific error messages
      let errorMessage = this._t('extractionErrorGeneric') || 'An error occurred during extraction';
      if (error.message.includes('No active tab')) {
        errorMessage = this._t('extractionErrorNoTab') || 'No active tab found';
      } else if (error.message.includes('clipboard')) {
        errorMessage = this._t('extractionErrorClipboard') || 'Failed to copy to clipboard';
      } else if (error.message.includes('permission')) {
        errorMessage = this._t('extractionErrorPermission') || 'Permission denied to access page';
      }
      this.showFeedback('error', errorMessage);
    } finally {
      this.isExtracting = false;
      this.hideLoadingState();
    }
  }

  async extractContentFromActiveTab(extractionType = 'general') {
    try {
      // Get the active tab (the website the user is currently viewing)
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab) {
        throw new Error('No active tab found');
      }


      // Inject content script to extract content from the active tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        args: [extractionType],
        function: (extractionType) => {

          // Import extractors dynamically in the content script
          const extractorMap = {
            twitter: {
              extract: () => {
                let title = '';
                let content = '';

                // Twitter-specific selectors for clean extraction
                const tweetSelectors = [
                  '[data-testid="tweetText"]',
                  '[data-testid="tweet"] [lang]'
                ];

                for (const selector of tweetSelectors) {
                  const tweetEl = document.querySelector(selector);
                  if (tweetEl && tweetEl.textContent.trim()) {
                    content = tweetEl.textContent.trim();
                    break;
                  }
                }

                // Get author name
                const authorEl = document.querySelector('[data-testid="User-Name"]');
                if (authorEl) {
                  title = `Tweet by ${authorEl.textContent.trim()}`;
                } else {
                  title = 'Tweet';
                }

                return { title, content };
              }
            },

            reddit: {
              extract: () => {
                let title = '';
                let content = '';

                // Extract title from specific Reddit structure
                const titleElement = document.querySelector('h1[slot="title"]');
                if (titleElement) {
                  title = titleElement.textContent.trim();
                } else {
                  const titleSelectors = [
                    '[data-testid="post-content"] h1',
                    'shreddit-post h1',
                    '.Post h3',
                    '[data-adclicklocation="title"] h3',
                    '.thing .title a'
                  ];

                  for (const selector of titleSelectors) {
                    const titleEl = document.querySelector(selector);
                    if (titleEl && titleEl.textContent.trim()) {
                      title = titleEl.textContent.trim();
                      break;
                    }
                  }
                }

                // Extract content from text-body slot
                const textBodyContainer = document.querySelector('[slot="text-body"]');
                if (textBodyContainer) {
                  const markdownContent = textBodyContainer.querySelector('.md');
                  if (markdownContent) {
                    const contentBlocks = [];

                    const paragraphs = markdownContent.querySelectorAll('p');
                    paragraphs.forEach(p => {
                      const text = p.textContent.trim();
                      if (text && text.length > 10) {
                        contentBlocks.push(text);
                      }
                    });

                    const links = markdownContent.querySelectorAll('a[href]');
                    const linkTexts = [];
                    links.forEach(link => {
                      const linkText = link.textContent.trim();
                      const href = link.getAttribute('href');
                      if (linkText && href && href.startsWith('http')) {
                        linkTexts.push(`${linkText}: ${href}`);
                      }
                    });

                    if (linkTexts.length > 0) {
                      contentBlocks.push('\nLinks:');
                      contentBlocks.push(...linkTexts);
                    }

                    content = contentBlocks.join('\n\n');
                  }
                }

                // Fallback content extraction
                if (!content || content.length < 50) {
                  const contentSelectors = [
                    '[data-testid="post-content"] [slot="text-body"] .md',
                    'shreddit-post [slot="text-body"] .md',
                    '.Post .md',
                    '.usertext-body .md',
                    '[data-click-id="text"] .md',
                    '.thing .usertext .md'
                  ];

                  for (const selector of contentSelectors) {
                    const contentEl = document.querySelector(selector);
                    if (contentEl) {
                      const text = contentEl.textContent.trim();
                      if (text && text.length > 30) {
                        content = text;
                        break;
                      }
                    }
                  }
                }

                // Extract top comments if no post content
                if (!content || content.length < 50) {
                  const commentSelectors = [
                    'shreddit-comment .md',
                    '[data-testid="comment"] .md',
                    '.Comment .md',
                    '.comment .usertext-body .md'
                  ];

                  const topComments = [];

                  for (const selector of commentSelectors) {
                    const comments = document.querySelectorAll(selector);

                    comments.forEach((comment, index) => {
                      if (index < 5 && topComments.length < 3) {
                        const text = comment.textContent.trim();
                        if (text &&
                          text.length > 50 &&
                          !text.includes('deleted') &&
                          !text.includes('[removed]') &&
                          !text.includes('AutoModerator')) {

                          const commentContainer = comment.closest('[data-testid="comment"]') ||
                            comment.closest('.comment') ||
                            comment.closest('shreddit-comment');

                          let author = 'User';
                          if (commentContainer) {
                            const authorEl = commentContainer.querySelector('[data-testid="comment_author_link"], .author, [slot="authorName"]');
                            if (authorEl) {
                              author = authorEl.textContent.trim();
                            }
                          }

                          topComments.push(`**${author}:** ${text}`);
                        }
                      }
                    });

                    if (topComments.length > 0) break;
                  }

                  if (topComments.length > 0) {
                    content = `Top Comments:\n\n${topComments.join('\n\n---\n\n')}`;
                  }
                }

                return {
                  title: title || 'Reddit Post',
                  content: content || 'No content could be extracted from this Reddit post.'
                };
              }
            },

            news: {
              extract: () => {
                let title = '';
                let content = '';

                // BBC-specific title extraction
                const bbcTitleEl = document.querySelector('[data-component="headline-block"] h1.sc-f98b1ad2-0');
                if (bbcTitleEl) {
                  title = bbcTitleEl.textContent.trim();
                }

                // NYT-specific title extraction
                if (!title) {
                  const nytTitleEl = document.querySelector('[data-testid="headline"].css-88wicj');
                  if (nytTitleEl) {
                    title = nytTitleEl.textContent.trim();
                  }
                }

                // General news title fallback
                if (!title) {
                  const generalTitleSelectors = [
                    'h1.headline', 'h1.entry-title', 'h1.article-title',
                    '.article-header h1', '.story-headline', '.post-title', 'h1'
                  ];

                  for (const selector of generalTitleSelectors) {
                    const titleEl = document.querySelector(selector);
                    if (titleEl && titleEl.textContent.trim()) {
                      title = titleEl.textContent.trim();
                      break;
                    }
                  }
                }

                // BBC-specific content extraction
                const bbcTextBlocks = document.querySelectorAll('[data-component="text-block"] p.sc-9a00e533-0');
                if (bbcTextBlocks.length > 0) {
                  const contentBlocks = [];
                  bbcTextBlocks.forEach(p => {
                    const text = p.textContent.trim();
                    if (text && text.length > 30) {
                      contentBlocks.push(text);
                    }
                  });
                  content = contentBlocks.join('\n\n');
                }

                // NYT-specific content extraction
                if (!content || content.length < 100) {
                  const nytSummary = document.querySelector('#article-summary.css-79rysd');
                  let summaryText = '';
                  if (nytSummary) {
                    summaryText = nytSummary.textContent.trim();
                  }

                  const nytArticleBody = document.querySelector('[name="articleBody"].meteredContent');
                  if (nytArticleBody) {
                    const contentBlocks = [];

                    if (summaryText) {
                      contentBlocks.push(summaryText);
                    }

                    const storyColumns = nytArticleBody.querySelectorAll('.StoryBodyCompanionColumn .css-53u6y8 p.css-at9mc1');
                    storyColumns.forEach(p => {
                      const text = p.textContent.trim();
                      if (text &&
                        text.length > 50 &&
                        !text.match(/^(Share|Tweet|Like|Follow|Subscribe|Sign up|Login|Register|Save|More)$/i) &&
                        !text.match(/^(Image|Credit|Getty Images|Reuters|AP|AFP)$/i)) {
                        contentBlocks.push(text);
                      }
                    });

                    content = contentBlocks.join('\n\n');
                  }
                }

                return {
                  title: title || 'News Article',
                  content: content || 'No content could be extracted from this news article.'
                };
              }
            },

            linkedin: {
              extract: () => {
                let title = '';
                let content = '';

                // Find LinkedIn posts in the feed
                const postContainers = document.querySelectorAll('.feed-shared-update-v2[role="article"]');

                let targetPost = null;

                // Try to find the post that's currently in focus or most visible
                for (const post of postContainers) {
                  const rect = post.getBoundingClientRect();
                  const isInViewport = rect.top >= 0 && rect.top <= window.innerHeight / 2;

                  if (isInViewport) {
                    targetPost = post;
                    break;
                  }
                }

                // If no post is clearly in focus, take the first one
                if (!targetPost && postContainers.length > 0) {
                  targetPost = postContainers[0];
                }

                if (!targetPost) {
                  return { title: 'LinkedIn Post', content: 'No LinkedIn post found on this page.' };
                }

                // Extract author information for the title
                const authorElement = targetPost.querySelector('.update-components-actor__title .hoverable-link-text');
                const authorName = authorElement ? authorElement.textContent.trim() : '';

                const authorDescription = targetPost.querySelector('.update-components-actor__description');
                const authorRole = authorDescription ? authorDescription.textContent.trim() : '';

                // Create title from author info
                if (authorName) {
                  title = `LinkedIn Post by ${authorName}`;
                  if (authorRole && authorRole.length < 100) {
                    title += ` (${authorRole})`;
                  }
                } else {
                  title = 'LinkedIn Post';
                }

                // Extract the main post content
                const contentContainer = targetPost.querySelector('.update-components-text .break-words');
                if (contentContainer) {
                  const textSpans = contentContainer.querySelectorAll('span[dir="ltr"]');
                  const contentBlocks = [];

                  textSpans.forEach(span => {
                    const text = span.textContent.trim();
                    if (text && text.length > 0) {
                      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                      contentBlocks.push(...lines);
                    }
                  });

                  content = contentBlocks.join('\n\n');
                }

                // If no content found, try alternative selectors
                if (!content) {
                  const alternativeSelectors = [
                    '.feed-shared-update-v2__description .break-words',
                    '.update-components-update-v2__commentary',
                    '.feed-shared-inline-show-more-text .break-words'
                  ];

                  for (const selector of alternativeSelectors) {
                    const contentEl = targetPost.querySelector(selector);
                    if (contentEl) {
                      content = contentEl.textContent.trim();
                      if (content.length > 10) break;
                    }
                  }
                }

                // Extract engagement metrics
                const likesElement = targetPost.querySelector('.social-details-social-counts__reactions-count');
                const commentsElement = targetPost.querySelector('[aria-label*="comments"]');
                const repostsElement = targetPost.querySelector('[aria-label*="reposts"]');

                const metrics = [];
                if (likesElement) {
                  const likes = likesElement.textContent.trim();
                  if (likes) metrics.push(`${likes} reactions`);
                }
                if (commentsElement) {
                  const commentsText = commentsElement.textContent.trim();
                  if (commentsText) metrics.push(commentsText);
                }
                if (repostsElement) {
                  const repostsText = repostsElement.textContent.trim();
                  if (repostsText) metrics.push(repostsText);
                }

                // Add metrics to content if available
                if (metrics.length > 0 && content) {
                  content += `\n\n---\nEngagement: ${metrics.join(' • ')}`;
                }

                // Extract timestamp
                const timeElement = targetPost.querySelector('.update-components-actor__sub-description time, .update-components-actor__sub-description [aria-hidden="true"]');
                if (timeElement) {
                  const timeText = timeElement.textContent.trim();
                  if (timeText && content) {
                    content += `\nPosted: ${timeText}`;
                  }
                }

                return {
                  title,
                  content: content || 'No content could be extracted from this LinkedIn post.'
                };
              }
            },

            'github-readme': {
              extract: () => {
                let title = '';
                let content = '';

                // Extract repository name from breadcrumb
                const repoNameEl = document.querySelector('[data-testid="breadcrumb"] a[href*="/"]');
                if (repoNameEl) {
                  title = repoNameEl.textContent.trim();
                } else {
                  const titleSelectors = [
                    '.js-repo-nav-item[data-selected-links="repo_source"] .js-repo-root',
                    '.AppHeader-context-item-label',
                    'h1.public'
                  ];

                  for (const selector of titleSelectors) {
                    const titleEl = document.querySelector(selector);
                    if (titleEl && titleEl.textContent.trim()) {
                      title = titleEl.textContent.trim();
                      break;
                    }
                  }
                }

                // Extract README from specific container structure
                const readmeContainer = document.querySelector('.Box-sc-g0xbh4-0.js-snippet-clipboard-copy-unpositioned');
                if (readmeContainer) {
                  const markdownBody = readmeContainer.querySelector('.markdown-body.entry-content');
                  if (markdownBody) {
                    const contentBlocks = [];

                    const elements = markdownBody.children;
                    for (let i = 0; i < elements.length; i++) {
                      const element = elements[i];

                      if (element.tagName === 'IMG' || element.tagName === 'TABLE') {
                        continue;
                      }

                      const text = element.textContent.trim();
                      if (text && text.length > 10) {
                        if (element.tagName.startsWith('H')) {
                          const level = parseInt(element.tagName.charAt(1));
                          const prefix = '#'.repeat(level);
                          contentBlocks.push(`${prefix} ${text}`);
                        }
                        else if (element.tagName === 'UL' || element.tagName === 'OL') {
                          const listItems = element.querySelectorAll('li');
                          listItems.forEach(li => {
                            const itemText = li.textContent.trim();
                            if (itemText && itemText.length > 5) {
                              contentBlocks.push(`• ${itemText}`);
                            }
                          });
                        }
                        else if (element.tagName === 'P') {
                          contentBlocks.push(text);
                        }
                        else if (element.tagName === 'PRE') {
                          const codeText = element.textContent.trim();
                          if (codeText.length > 20) {
                            contentBlocks.push(`[Code Block]\n${codeText.substring(0, 200)}${codeText.length > 200 ? '...' : ''}`);
                          }
                        }
                      }
                    }

                    content = contentBlocks.join('\n\n');
                  }
                }

                return {
                  title: title || 'GitHub Repository',
                  content: content || 'No README content found'
                };
              }
            },

            'github-code': {
              extract: () => {
                let title = '';
                let content = '';

                // Get repository and file name
                const repoNameEl = document.querySelector('[data-testid="breadcrumb"] a[href*="/"]');
                const fileNameEl = document.querySelector('.final-path');

                if (repoNameEl && fileNameEl) {
                  title = `${repoNameEl.textContent.trim()}/${fileNameEl.textContent.trim()}`;
                } else if (repoNameEl) {
                  title = repoNameEl.textContent.trim();
                } else {
                  title = 'GitHub Code';
                }

                // Extract code from new GitHub interface
                const codeContainer = document.querySelector('.react-code-file-contents');
                if (codeContainer) {
                  const codeLines = codeContainer.querySelectorAll('.react-code-text.react-code-line-contents-no-virtualization');
                  const extractedLines = [];

                  codeLines.forEach((line, index) => {
                    if (index < 100) {
                      const lineText = line.textContent.trim();
                      if (lineText) {
                        extractedLines.push(lineText);
                      }
                    }
                  });

                  if (extractedLines.length > 0) {
                    content = extractedLines.join('\n');
                  }
                }

                // Fallback to older GitHub interface
                if (!content) {
                  const blobWrapper = document.querySelector('.blob-wrapper');
                  if (blobWrapper) {
                    const codeLines = blobWrapper.querySelectorAll('.blob-code-inner, .js-file-line');
                    const extractedLines = [];

                    codeLines.forEach((line, index) => {
                      if (index < 100) {
                        const lineText = line.textContent.trim();
                        if (lineText) {
                          extractedLines.push(lineText);
                        }
                      }
                    });

                    if (extractedLines.length > 0) {
                      content = extractedLines.join('\n');
                    }
                  }
                }

                return {
                  title,
                  content: content || 'No code content found on this page'
                };
              }
            },

            techcrunch: {
              extract: () => {
                let title = '';
                let content = '';

                // TechCrunch article title
                const titleSelectors = [
                  'h1.wp-block-post-title',
                  'h1.entry-title',
                  '.article-header h1'
                ];

                for (const selector of titleSelectors) {
                  const titleEl = document.querySelector(selector);
                  if (titleEl && titleEl.textContent.trim()) {
                    title = titleEl.textContent.trim();
                    break;
                  }
                }

                // TechCrunch article content - clean extraction
                const contentEl = document.querySelector('.entry-content, .wp-block-post-content');
                if (contentEl) {
                  const clonedEl = contentEl.cloneNode(true);

                  // Remove unwanted elements
                  const unwantedSelectors = [
                    '.advertisement', '.ad-unit', '.related-articles',
                    '.social-share', '.newsletter-signup', '.author-bio',
                    '.tags', '.categories', '.wp-block-embed'
                  ];

                  unwantedSelectors.forEach(selector => {
                    const elements = clonedEl.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                  });

                  // Extract paragraphs cleanly
                  const paragraphs = clonedEl.querySelectorAll('p, h2, h3, h4');
                  const contentBlocks = [];

                  paragraphs.forEach(p => {
                    const text = p.textContent.trim();
                    if (text && text.length > 20) {
                      contentBlocks.push(text);
                    }
                  });

                  content = contentBlocks.join('\n\n');
                }

                return { title, content };
              }
            },

            general: {
              extract: () => {
                let title = document.title || 'Extracted Content';

                // Find main content area
                const article = document.querySelector('main, article, [role="main"]');
                const contentBlocks = [];

                if (article) {
                  const paragraphs = article.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
                  paragraphs.forEach(block => {
                    const text = block.textContent.trim();
                    if (text && text.length > 15) {
                      contentBlocks.push(text);
                    }
                  });
                }

                // Fallback to body if no main content
                if (contentBlocks.length === 0) {
                  const bodyBlocks = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
                  bodyBlocks.forEach(block => {
                    const text = block.textContent.trim();
                    if (text && text.length > 15) {
                      contentBlocks.push(text);
                    }
                  });
                }

                const content = contentBlocks.join('\n\n').trim();
                return { title, content };
              }
            }
          };

          try {
            // Use the appropriate extractor
            const extractor = extractorMap[extractionType] || extractorMap.general;
            const { title, content } = extractor.extract();

            // Ensure we have content
            let finalContent = content;
            if (!finalContent || finalContent.length < 20) {
              finalContent = 'No readable content could be extracted from this page.';
            }

            // Limit content length
            if (finalContent.length > 50000) {
              finalContent = finalContent.substring(0, 50000) + '\n\n[Content truncated due to length]';
            }

            const result = {
              title: title || document.title || 'Extracted Content',
              content: finalContent,
              siteType: extractionType,
              method: `${extractionType}-extraction`,
              url: window.location.href
            };

            return result;

          } catch (error) {
            console.error('Content extraction error:', error);
            return {
              title: document.title || 'Error',
              content: `Failed to extract content: ${error.message}`,
              siteType: extractionType,
              method: 'error',
              url: window.location.href
            };
          }
        }
      });


      if (!results || results.length === 0) {
        throw new Error('Script injection failed - no results array returned. This might be due to permission issues or the page blocking script injection.');
      }

      if (!results[0]) {
        throw new Error('Script injection failed - first result is null. The target tab might not be accessible.');
      }

      if (results[0].result === null || results[0].result === undefined) {
        throw new Error('Content extraction script returned null/undefined. The page might have security restrictions or the content script failed to execute.');
      }

      if (typeof results[0].result !== 'object') {
        throw new Error(`Content extraction script returned unexpected type: ${typeof results[0].result}. Expected an object with title and content.`);
      }

      const extractionResult = results[0].result;

      // Process the extracted content
      const formattedOutput = this.formatContent(extractionResult.title, extractionResult.content);

      return {
        title: extractionResult.title || activeTab.title || 'Extracted Content',
        content: extractionResult.content || 'No content could be extracted',
        url: activeTab.url,
        siteType: extractionResult.siteType || 'unknown',
        extractionMethod: extractionResult.method || 'content-script',
        timestamp: Date.now(),
        success: true,
        formattedOutput
      };

    } catch (error) {
      console.error('Active tab extraction failed:', error);

      // Try to get basic info about the active tab as fallback
      let fallbackTitle = 'Unknown Page';
      let fallbackUrl = 'unknown';

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          fallbackTitle = activeTab.title || 'Unknown Page';
          fallbackUrl = activeTab.url || 'unknown';
        }
      } catch (tabError) {
        console.error('Failed to get tab info:', tabError);
      }

      return {
        title: fallbackTitle,
        content: `Failed to extract content from this page. Error: ${error.message}

This might be due to:
- Page security restrictions
- Content not fully loaded
- Site blocking script injection

Try refreshing the page and trying again.`,
        url: fallbackUrl,
        siteType: 'unknown',
        extractionMethod: 'failed',
        timestamp: Date.now(),
        success: false,
        error: error.message
      };
    }
  }



  detectSiteType(url) {
    if (!url) return 'generic';

    try {
      const hostname = new URL(url).hostname.toLowerCase();

      if (hostname.includes('reddit.com')) return 'reddit';
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
      if (hostname.includes('techcrunch.com')) return 'techcrunch';
      if (hostname.includes('medium.com')) return 'medium';
      if (hostname.includes('github.com')) return 'github';
      if (hostname.includes('stackoverflow.com')) return 'stackoverflow';
      if (hostname.includes('news.ycombinator.com')) return 'hackernews';

      return 'generic';
    } catch (error) {
      console.error('Error detecting site type:', error);
      return 'generic';
    }
  }











  formatContent(title, content) {
    const formattedTitle = title ? `${title}\n\n` : '';
    const formattedContent = content || 'No content extracted';
    return `<content>${formattedTitle}${formattedContent}</content>`;
  }

  cleanText(text) {
    if (!text) return '';

    return text
      // Remove excessive whitespace but preserve paragraph structure
      .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
      .replace(/\n[ \t]+/g, '\n') // Remove spaces at beginning of lines
      .replace(/[ \t]+\n/g, '\n') // Remove spaces at end of lines
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
      .replace(/^\s+|\s+$/g, '') // Trim start and end
      // Remove common unwanted text patterns
      .replace(/^(Advertisement|Ad|Sponsored|Loading|Error|404|Page not found).*$/gmi, '')
      .replace(/^(Share|Tweet|Like|Follow|Subscribe|Sign up|Login|Register).*$/gmi, '')
      .replace(/\b(cookies?|privacy policy|terms of service|gdpr)\b.*$/gmi, '')
      .trim();
  }

  async copyToClipboard(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('No content to copy');
    }

    try {
      // First try the modern Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback using the proven document.execCommand approach
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = text;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.left = '-999999px';
        tempTextarea.style.top = '-999999px';
        tempTextarea.style.opacity = '0';
        tempTextarea.setAttribute('readonly', '');
        tempTextarea.setAttribute('tabindex', '-1');

        document.body.appendChild(tempTextarea);
        tempTextarea.select();

        try {
          const successful = document.execCommand('copy');
          if (!successful) {
            throw new Error('Copy command failed');
          }
        } finally {
          // Always remove the temporary textarea
          document.body.removeChild(tempTextarea);
        }
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      throw new Error(`Failed to copy to clipboard: ${error.message}`);
    }
  }

  showLoadingState() {
    const btn = document.getElementById('content-extractor-btn');
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
      btn.setAttribute('aria-label', 'Extracting content, please wait...');
      btn.title = 'Extracting content...';

      const svg = btn.querySelector('svg');
      if (svg) {
        svg.style.animation = 'spin 1s linear infinite';
      }

      const span = btn.querySelector('span');
    if (span) {
      span.textContent = this._t('extractButtonExtracting') || 'Extracting...';
    }
    btn.title = this._t('extractButtonExtractingTitle') || 'Extracting content...';
    btn.setAttribute('aria-label', this._t('extractButtonExtractingAriaLabel') || 'Extracting content, please wait...');
    }
  }

  hideLoadingState() {
    const btn = document.getElementById('content-extractor-btn');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.setAttribute('aria-label', 'Extract and copy content from current page');
      btn.title = 'Extract and copy content from current page';

      const svg = btn.querySelector('svg');
      if (svg) {
        svg.style.animation = '';
      }

      const span = btn.querySelector('span');
    if (span) {
      span.textContent = this._t('extractButton') || 'Extract';
    }
    btn.title = this._t('extractButtonTitle') || 'Extract and copy content from current page';
    btn.setAttribute('aria-label', btn.title);
    }
  }

  showSuccessState() {
    const btn = document.getElementById('content-extractor-btn');
    if (btn) {
      btn.classList.add('success');
      setTimeout(() => {
        btn.classList.remove('success');
      }, 1000);
    }
  }

  showFeedback(type, message) {
    // Clear any existing feedback timeout
    if (this.feedbackTimeout) {
      clearTimeout(this.feedbackTimeout);
    }

    // Create or update feedback element
    let feedback = document.getElementById('content-extractor-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'content-extractor-feedback';
      feedback.className = 'content-extractor-feedback';
      feedback.setAttribute('role', 'alert');
      feedback.setAttribute('aria-live', 'polite');
      document.body.appendChild(feedback);
    }

    feedback.textContent = message;
    feedback.className = `content-extractor-feedback ${type}`;
    feedback.style.display = 'block';
    feedback.setAttribute('aria-label', `${type}: ${message}`);

    // Update button state for screen readers
    const btn = document.getElementById('content-extractor-btn');
    if (btn) {
      if (type === 'success') {
        btn.setAttribute('aria-label', this._t('extractionSuccessMessage', '') || 'Content extracted successfully and copied to clipboard');
      } else if (type === 'error') {
        btn.setAttribute('aria-label', this._t('extractionErrorFailed') || 'Content extraction failed. Try again.');
      }

      // Reset aria-label after a delay
      setTimeout(() => {
        btn.setAttribute('aria-label', this._t('extractButtonTitle') || 'Extract and copy content from current page');
      }, 5000);
    }

    // Auto-hide after 3 seconds
    this.feedbackTimeout = setTimeout(() => {
      if (feedback) {
        feedback.style.display = 'none';
      }
    }, 3000);
  }
}
