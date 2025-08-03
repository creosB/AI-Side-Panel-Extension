// General Content Extractor
export const generalExtractor = {
  name: 'General',
  description: 'Smart extraction for any website',
  icon: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>`,
  keywords: ['general', 'article', 'blog', 'news', 'content'],
  
  extract: () => {
    console.log('Using general extractor');
    let title = document.title || 'Extracted Content';
    
    // Find main content area
    const article = document.querySelector('main, article, [role="main"]');
    const contentBlocks = [];
    
    if (article) {
      const paragraphs = article.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote');
      paragraphs.forEach(block => {
        const text = block.textContent.trim();
        if (text && text.length > 15) {
          contentBlocks.push(text);
        }
      });
    }
    
    // Fallback to body if no main content
    if (contentBlocks.length === 0) {
      const bodyBlocks = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote');
      bodyBlocks.forEach(block => {
        const text = block.textContent.trim();
        if (text && text.length > 15) {
          // Skip navigation and footer content
          const parent = block.closest('nav, footer, aside, .navigation, .sidebar, .menu');
          if (!parent) {
            contentBlocks.push(text);
          }
        }
      });
    }
    
    const content = contentBlocks.join('\n\n').trim();
    return { title, content };
  }
};