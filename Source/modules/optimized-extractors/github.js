// GitHub README Extractor
export const githubReadmeExtractor = {
  name: 'GitHub README',
  description: 'Extract README and documentation content',
  icon: `<path d="M12.006 2a9.847 9.847 0 0 0-6.484 2.44 10.32 10.32 0 0 0-3.393 6.17 10.48 10.48 0 0 0 1.317 6.955 10.045 10.045 0 0 0 5.4 4.418c.504.095.683-.223.683-.494 0-.245-.01-1.052-.014-1.908-2.78.62-3.366-1.21-3.366-1.21a2.711 2.711 0 0 0-1.11-1.5c-.907-.637.07-.621.07-.621.317.044.62.163.885.346.266.183.487.426.647.71.135.253.318.476.538.655a2.079 2.079 0 0 0 2.37.196c.045-.52.27-1.006.635-1.37-2.219-.259-4.554-1.138-4.554-5.07a4.022 4.022 0 0 1 1.031-2.75 3.77 3.77 0 0 1 .096-2.713s.839-.275 2.749 1.05a9.26 9.26 0 0 1 5.004 0c1.906-1.325 2.74-1.05 2.74-1.05.37.858.406 1.828.101 2.713a4.017 4.017 0 0 1 1.029 2.75c0 3.939-2.339 4.805-4.564 5.058a2.471 2.471 0 0 1 .679 1.897c0 1.372-.012 2.477-.012 2.814 0 .272.18.592.687.492a10.05 10.05 0 0 0 5.388-4.421 10.473 10.473 0 0 0 1.313-6.948 10.32 10.32 0 0 0-3.39-6.165A9.847 9.847 0 0 0 12.007 2Z"/>`,
  keywords: ['github', 'readme', 'documentation', 'repository', 'docs'],
  
  extract: () => {
    console.log('Using GitHub README extractor');
    let title = '';
    let content = '';
    
    // Extract repository name from breadcrumb or header
    const repoNameEl = document.querySelector('[data-testid="breadcrumb"] a[href*="/"]');
    if (repoNameEl) {
      title = repoNameEl.textContent.trim();
    } else {
      // Fallback to other selectors
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
    
    // Extract README content from the specific container structure
    const readmeContainer = document.querySelector('.Box-sc-g0xbh4-0.js-snippet-clipboard-copy-unpositioned');
    if (readmeContainer) {
      const markdownBody = readmeContainer.querySelector('.markdown-body.entry-content');
      if (markdownBody) {
        const contentBlocks = [];
        
        // Process each element in the markdown body
        const elements = markdownBody.children;
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          
          // Skip images and tables for cleaner text extraction
          if (element.tagName === 'IMG' || element.tagName === 'TABLE') {
            continue;
          }
          
          const text = element.textContent.trim();
          if (text && text.length > 10) {
            // Format headings
            if (element.tagName.startsWith('H')) {
              const level = parseInt(element.tagName.charAt(1));
              const prefix = '#'.repeat(level);
              contentBlocks.push(`${prefix} ${text}`);
            }
            // Format lists
            else if (element.tagName === 'UL' || element.tagName === 'OL') {
              const listItems = element.querySelectorAll('li');
              listItems.forEach(li => {
                const itemText = li.textContent.trim();
                if (itemText && itemText.length > 5) {
                  contentBlocks.push(`• ${itemText}`);
                }
              });
            }
            // Regular paragraphs
            else if (element.tagName === 'P') {
              contentBlocks.push(text);
            }
            // Code blocks - simplified representation
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
    
    // Fallback to simpler README extraction
    if (!content) {
      const readmeSelectors = [
        '#readme .markdown-body',
        '.readme .markdown-body',
        '[data-testid="readme"] .markdown-body'
      ];
      
      for (const selector of readmeSelectors) {
        const readmeEl = document.querySelector(selector);
        if (readmeEl) {
          const clonedEl = readmeEl.cloneNode(true);
          
          // Remove images and complex elements
          const unwantedElements = clonedEl.querySelectorAll('img, svg, table, .anchor');
          unwantedElements.forEach(el => el.remove());
          
          // Extract text content
          const textElements = clonedEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li');
          const contentBlocks = [];
          
          textElements.forEach(el => {
            const text = el.textContent.trim();
            if (text && text.length > 10) {
              if (el.tagName.startsWith('H')) {
                const level = parseInt(el.tagName.charAt(1));
                const prefix = '#'.repeat(level);
                contentBlocks.push(`${prefix} ${text}`);
              } else {
                contentBlocks.push(text);
              }
            }
          });
          
          content = contentBlocks.join('\n\n');
          if (content.length > 100) break;
        }
      }
    }
    
    return { 
      title: title || 'GitHub Repository', 
      content: content || 'No README content found' 
    };
  }
};

// GitHub Code Extractor
export const githubCodeExtractor = {
  name: 'GitHub Code',
  description: 'Extract code blocks and technical content',
  icon: `<path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>`,
  keywords: ['github', 'code', 'programming', 'source', 'technical'],
  
  extract: () => {
    console.log('Using GitHub Code extractor');
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
    
    // Extract code from the new GitHub interface
    const codeContainer = document.querySelector('.react-code-file-contents');
    if (codeContainer) {
      const codeLines = codeContainer.querySelectorAll('.react-code-text.react-code-line-contents-no-virtualization');
      const extractedLines = [];
      
      codeLines.forEach((line, index) => {
        if (index < 100) { // Limit to first 100 lines
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
    
    // Extract code blocks from README or markdown files
    if (!content) {
      const codeBlocks = document.querySelectorAll('pre code, .highlight pre');
      const extractedBlocks = [];
      
      codeBlocks.forEach((block, index) => {
        if (index < 5) { // Limit to first 5 code blocks
          const blockText = block.textContent.trim();
          if (blockText && blockText.length > 20) {
            extractedBlocks.push(`--- Code Block ${index + 1} ---\n${blockText}`);
          }
        }
      });
      
      if (extractedBlocks.length > 0) {
        content = extractedBlocks.join('\n\n');
      }
    }
    
    // Extract from issue or PR code snippets
    if (!content) {
      const issueCodeBlocks = document.querySelectorAll('.comment-body pre, .issue-body pre');
      const extractedSnippets = [];
      
      issueCodeBlocks.forEach((block, index) => {
        if (index < 3) {
          const blockText = block.textContent.trim();
          if (blockText && blockText.length > 20) {
            extractedSnippets.push(`--- Code Snippet ${index + 1} ---\n${blockText}`);
          }
        }
      });
      
      if (extractedSnippets.length > 0) {
        content = extractedSnippets.join('\n\n');
      }
    }
    
    return { 
      title, 
      content: content || 'No code content found on this page' 
    };
  }
};