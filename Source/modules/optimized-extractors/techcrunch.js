// TechCrunch Content Extractor
export const techcrunchExtractor = {
  name: 'TechCrunch',
  description: 'Extract articles, news, and tech content',
  icon: `<path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>`,
  keywords: ['techcrunch', 'tech', 'news', 'article', 'startup'],
  
  extract: () => {
    console.log('Using TechCrunch extractor');
    let title = '';
    let content = '';
    
    // TechCrunch article title
    const titleSelectors = [
      'h1.wp-block-post-title',
      'h1.entry-title',
      '.article-header h1',
      'h1'
    ];
    
    for (const selector of titleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl && titleEl.textContent.trim()) {
        title = titleEl.textContent.trim();
        break;
      }
    }
    
    // TechCrunch article content - clean extraction
    const contentEl = document.querySelector('.entry-content, .wp-block-post-content, .article-content');
    if (contentEl) {
      const clonedEl = contentEl.cloneNode(true);
      
      // Remove unwanted elements
      const unwantedSelectors = [
        '.advertisement', '.ad-unit', '.related-articles',
        '.social-share', '.newsletter-signup', '.author-bio',
        '.tags', '.categories', '.wp-block-embed',
        '.crunchbase-single', '.piano-inline-promo',
        '.wp-block-separator', '.wp-block-spacer'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = clonedEl.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      // Extract paragraphs and headings cleanly
      const paragraphs = clonedEl.querySelectorAll('p, h2, h3, h4, blockquote');
      const contentBlocks = [];
      
      paragraphs.forEach(p => {
        const text = p.textContent.trim();
        if (text && text.length > 20 && !text.includes('TechCrunch+')) {
          contentBlocks.push(text);
        }
      });
      
      content = contentBlocks.join('\n\n');
    }
    
    return { title, content };
  }
};