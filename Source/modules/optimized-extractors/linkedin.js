// LinkedIn Content Extractor
export const linkedinExtractor = {
  name: 'LinkedIn',
  description: 'Extract LinkedIn posts and professional content',
  icon: `<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>`,
  keywords: ['linkedin', 'professional', 'post', 'business', 'networking'],
  
  extract: () => {
    let title = '';
    let content = '';
    
    // LinkedIn posts are in a feed structure, we need to find the currently focused/visible post
    // Look for the main post container that's currently in view or has focus
    const postContainers = document.querySelectorAll('.feed-shared-update-v2[role="article"]');
    
    let targetPost = null;
    
    // Try to find the post that's currently in focus or most visible
    for (const post of postContainers) {
      // Check if this post is in the viewport or has focus indicators
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
      return { title: chrome.i18n.getMessage('extractionLinkedInTitle'), content: chrome.i18n.getMessage('extractionNoContentLinkedIn') };
    }
    
    // Extract author information for the title
    const authorElement = targetPost.querySelector('.update-components-actor__title .hoverable-link-text');
    const authorName = authorElement ? authorElement.textContent.trim() : '';
    
    const authorDescription = targetPost.querySelector('.update-components-actor__description');
    const authorRole = authorDescription ? authorDescription.textContent.trim() : '';
    
    // Create title from author info
    if (authorName) {
      title = chrome.i18n.getMessage('extractionLinkedInTitleBy', [authorName]);
      if (authorRole && authorRole.length < 100) {
        title += ` (${authorRole})`;
      }
    } else {
      title = chrome.i18n.getMessage('extractionLinkedInTitle');
    }
    
    // Extract the main post content
    const contentContainer = targetPost.querySelector('.update-components-text .break-words');
    if (contentContainer) {
      // Get the text content, preserving line breaks
      const textSpans = contentContainer.querySelectorAll('span[dir="ltr"]');
      const contentBlocks = [];
      
      textSpans.forEach(span => {
        const text = span.textContent.trim();
        if (text && text.length > 0) {
          // Handle line breaks
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
    
    // Extract engagement metrics for additional context
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
      content += `\n\n---\n${chrome.i18n.getMessage('extractionEngagementLabel')}: ${metrics.join(' • ')}`;
    }
    
    // Extract timestamp
    const timeElement = targetPost.querySelector('.update-components-actor__sub-description time, .update-components-actor__sub-description [aria-hidden="true"]');
    if (timeElement) {
      const timeText = timeElement.textContent.trim();
      if (timeText && content) {
        content += `\n${chrome.i18n.getMessage('extractionPostedLabel')}: ${timeText}`;
      }
    }
    
    return { 
      title, 
      content: content || chrome.i18n.getMessage('extractionNoContentLinkedInPost') 
    };
  }
};
