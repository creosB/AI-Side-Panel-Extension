// Twitter/X Content Extractor
export const twitterExtractor = {
  name: 'Twitter (X)',
  description: 'Extract tweets, threads, and author info',
  icon: `<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
  keywords: ['twitter', 'x', 'tweet', 'social'],
  
  extract: () => {
    let title = '';
    let content = '';
    
    // Twitter-specific selectors for clean extraction
    const tweetSelectors = [
      '[data-testid="tweetText"]',
      '[data-testid="tweet"] [lang]',
      '.tweet-text'
    ];
    
    for (const selector of tweetSelectors) {
      const tweetEl = document.querySelector(selector);
      if (tweetEl && tweetEl.textContent.trim()) {
        content = tweetEl.textContent.trim();
        break;
      }
    }
    
    // Get author name
    const authorSelectors = [
      '[data-testid="User-Name"]',
      '.username',
      '.fullname'
    ];
    
    for (const selector of authorSelectors) {
      const authorEl = document.querySelector(selector);
      if (authorEl && authorEl.textContent.trim()) {
        title = `Tweet by ${authorEl.textContent.trim()}`;
        break;
      }
    }
    
    if (!title) title = 'Tweet';
    
    // Try to get thread content if it's a thread
    const threadTweets = document.querySelectorAll('[data-testid="tweetText"]');
    if (threadTweets.length > 1) {
      const threadContent = [];
      threadTweets.forEach((tweet, index) => {
        const text = tweet.textContent.trim();
        if (text) {
          threadContent.push(`${index + 1}. ${text}`);
        }
      });
      if (threadContent.length > 1) {
        content = threadContent.join('\n\n');
        title = `Thread by ${title.replace('Tweet by ', '')}`;
      }
    }
    
    return { title, content };
  }
};
