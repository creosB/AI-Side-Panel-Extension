// News Content Extractor
// Supports BBC, New York Times, and other major news sites
export const newsExtractor = {
  name: 'News',
  description: 'Extract articles from news sites (BBC, NYT, CNN, etc.)',
  icon: `<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4zm-2-8h1v10H2V8zm0-2V4h18v2H2z"/>`,
  keywords: ['news', 'article', 'bbc', 'nyt', 'cnn', 'journalism', 'newspaper'],
  
  extract: () => {
    console.log('Using News extractor');
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
      // First try to get the summary
      const nytSummary = document.querySelector('#article-summary.css-79rysd');
      let summaryText = '';
      if (nytSummary) {
        summaryText = nytSummary.textContent.trim();
      }
      
      // Then get the main article body
      const nytArticleBody = document.querySelector('[name="articleBody"].meteredContent');
      if (nytArticleBody) {
        const contentBlocks = [];
        
        // Add summary if available
        if (summaryText) {
          contentBlocks.push(summaryText);
        }
        
        // Extract paragraphs from StoryBodyCompanionColumn divs
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
    
    // General news content extraction fallback
    if (!content || content.length < 100) {
      const generalContentSelectors = [
        '.article-content', '.entry-content', '.story-body',
        '.post-content', '.article-body', 'main article', '[role="main"]'
      ];
      
      for (const selector of generalContentSelectors) {
        const contentEl = document.querySelector(selector);
        if (contentEl) {
          const clonedEl = contentEl.cloneNode(true);
          
          // Remove unwanted elements
          const unwantedSelectors = [
            '.advertisement', '.ad-unit', '.ad-slot', '.dotcom-ad',
            '.social-share', '.share-buttons', '.newsletter-signup',
            '.related-articles', '.recommended-articles',
            '.author-bio', '.byline-block', '.tags', '.categories',
            '.comments-section', '.subscription-banner',
            '[data-testid="ad-unit"]', '[data-component="ad-slot"]',
            '[data-component="links-block"]', '[data-component="tags"]',
            'figure', 'figcaption'
          ];
          
          unwantedSelectors.forEach(selector => {
            const elements = clonedEl.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          });
          
          const paragraphs = clonedEl.querySelectorAll('p, h2, h3, h4, h5, h6');
          const contentBlocks = [];
          
          paragraphs.forEach(p => {
            const text = p.textContent.trim();
            if (text && 
                text.length > 30 && 
                !text.match(/^(Share|Tweet|Like|Follow|Subscribe|Sign up|Login|Register|Save|More)$/i) &&
                !text.match(/^(Image|Credit|Getty Images|Reuters|AP|AFP)$/i) &&
                !text.includes('cookie') &&
                !text.includes('privacy policy')) {
              contentBlocks.push(text);
            }
          });
          
          content = contentBlocks.join('\n\n');
          if (content.length > 100) break;
        }
      }
    }
    
    return { 
      title: title || 'News Article', 
      content: content || 'No content could be extracted from this news article.' 
    };
  }
};