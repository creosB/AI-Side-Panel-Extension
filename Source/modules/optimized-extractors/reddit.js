// Reddit Content Extractor
export const redditExtractor = {
  name: 'Reddit',
  description: 'Extract posts, comments, and discussions',
  icon: `<path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>`,
  keywords: ['reddit', 'post', 'discussion', 'forum', 'comments'],
  
  extract: () => {
    console.log('Using Reddit extractor');
    let title = '';
    let content = '';
    
    // Extract title from the specific Reddit structure
    const titleElement = document.querySelector('h1#post-title-t3_rk8qub[slot="title"]');
    if (titleElement) {
      title = titleElement.textContent.trim();
    } else {
      // Fallback title selectors for different Reddit layouts
      const titleSelectors = [
        'h1[slot="title"]',
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
    
    // Extract content from the specific Reddit post structure
    const textBodyContainer = document.querySelector('[slot="text-body"]');
    if (textBodyContainer) {
      const markdownContent = textBodyContainer.querySelector('.md');
      if (markdownContent) {
        const contentBlocks = [];
        
        // Extract paragraphs
        const paragraphs = markdownContent.querySelectorAll('p');
        paragraphs.forEach(p => {
          const text = p.textContent.trim();
          if (text && text.length > 10) {
            contentBlocks.push(text);
          }
        });
        
        // Extract links with context
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
    
    // Fallback content extraction for other Reddit layouts
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
              
              // Try to get comment author
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
    
    // Final fallback with post metadata
    if (!content) {
      const subredditEl = document.querySelector('[data-testid="subreddit-name"], .subreddit, [href*="/r/"]');
      const subreddit = subredditEl ? subredditEl.textContent.trim().replace('r/', '') : '';
      
      const scoreEl = document.querySelector('[data-testid="vote-arrows"], .score, [aria-label*="upvote"]');
      const score = scoreEl ? scoreEl.textContent.trim() : '';
      
      const authorEl = document.querySelector('[data-testid="post_author_link"], .author');
      const author = authorEl ? authorEl.textContent.trim() : '';
      
      const metadataParts = [];
      if (subreddit) metadataParts.push(`Subreddit: r/${subreddit}`);
      if (author) metadataParts.push(`Author: u/${author}`);
      if (score) metadataParts.push(`Score: ${score}`);
      
      content = metadataParts.length > 0 
        ? `${metadataParts.join(' • ')}\n\n[This appears to be a link post, image post, or video post with no text content]`
        : 'No content could be extracted from this Reddit post.';
    }
    
    return { 
      title: title || 'Reddit Post', 
      content 
    };
  }
};