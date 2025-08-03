// Medium Content Extractor
export const mediumExtractor = {
  name: 'Medium',
  description: 'Extract Medium articles and stories',
  icon: `<path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>`,
  keywords: ['medium', 'article', 'story', 'blog'],
  
  extract: () => {
    console.log('Using Medium extractor');
    let title = '';
    let content = '';
    
    // Medium title selectors
    const titleSelectors = [
      'h1[data-testid="storyTitle"]',
      'h1.graf--title',
      'h1',
      '.graf--h3'
    ];
    
    for (const selector of titleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl && titleEl.textContent.trim()) {
        title = titleEl.textContent.trim();
        break;
      }
    }
    
    // Medium content selectors
    const contentSelectors = [
      'article section',
      '.postArticle-content',
      '.section-content',
      'article'
    ];
    
    for (const selector of contentSelectors) {
      const contentEl = document.querySelector(selector);
      if (contentEl) {
        const clonedEl = contentEl.cloneNode(true);
        
        // Remove unwanted elements
        const unwantedSelectors = [
          '.applause-button', '.js-actionMultirecommend',
          '.followButton', '.clap-button', '.response-count',
          '.bookmark-button', '.highlight-menu'
        ];
        
        unwantedSelectors.forEach(selector => {
          const elements = clonedEl.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        });
        
        // Extract paragraphs cleanly
        const paragraphs = clonedEl.querySelectorAll('p, h2, h3, h4, blockquote');
        const contentBlocks = [];
        
        paragraphs.forEach(p => {
          const text = p.textContent.trim();
          if (text && text.length > 20) {
            contentBlocks.push(text);
          }
        });
        
        content = contentBlocks.join('\n\n');
        if (content.length > 100) break;
      }
    }
    
    return { title, content };
  }
};