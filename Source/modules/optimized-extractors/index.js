// Optimized Extractors Index
// This file exports all available extractors for easy management

import { twitterExtractor } from './twitter.js';
import { redditExtractor } from './reddit.js';
import { techcrunchExtractor } from './techcrunch.js';
import { generalExtractor } from './general.js';
import { mediumExtractor } from './medium.js';
import { githubReadmeExtractor, githubCodeExtractor } from './github.js';
import { newsExtractor } from './news.js';
import { linkedinExtractor } from './linkedin.js';

// Export all extractors in the specified order
export const extractors = {
  twitter: twitterExtractor,
  reddit: redditExtractor,
  general: generalExtractor,
  news: newsExtractor,
  linkedin: linkedinExtractor,
  medium: mediumExtractor,
  'github-readme': githubReadmeExtractor,
  'github-code': githubCodeExtractor,
  techcrunch: techcrunchExtractor
};

// Top extractors that always show first
export const topExtractors = ['twitter', 'reddit', 'general', 'news'];

// Get all extractor keys for easy iteration
export const extractorKeys = Object.keys(extractors);

// Search function for extractors
export function searchExtractors(query) {
  if (!query) return extractorKeys;
  
  const lowerQuery = query.toLowerCase();
  return extractorKeys.filter(key => {
    const extractor = extractors[key];
    return (
      extractor.name.toLowerCase().includes(lowerQuery) ||
      extractor.description.toLowerCase().includes(lowerQuery) ||
      extractor.keywords.some(keyword => keyword.includes(lowerQuery))
    );
  });
}
