// Store rating prompt (v1.6.1).
//
// Shown once, at a positive moment: after a free user's 3rd Hub open.
// Never adjacent to a paywall moment (no show in the same session as a
// hub_limit_hit or Privacy Mask block, nor right after the premium modal).
// Dismissed-or-clicked → never shown again. Premium users never see it.
//
// All analytics fire-and-forget, try/caught. No new permissions: the store
// URL opens in a new tab via the existing host_permissions.

import { track } from './analytics.js';

const HUB_OPENS_KEY = 'ratingHubOpens';
const RATING_STATE_KEY = 'ratingPromptState'; // 'pending' | 'done'
const TRIGGER_OPENS = 3;

// Session-scoped suppression flags (chrome.storage.session so they reset
// when the panel/browser closes — i.e. "not in this sitting").
const SESSION_SUPPRESS_KEYS = [
  'sessionHubLimitHit',
  'sessionPrivacyBlock',
  'sessionPremiumModalShown'
];

let sessionChecked = false;
let sessionSuppressed = false;

function readLocal(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    } catch (_) { resolve({}); }
  });
}

function readSession(keys) {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.session) { resolve({}); return; }
      chrome.storage.session.get(keys, (res) => resolve(res || {}));
    } catch (_) { resolve({}); }
  });
}

function setLocal(obj) {
  try { chrome.storage.local.set(obj); } catch (_) {}
}

function setSession(obj) {
  try { chrome.storage.session?.set(obj); } catch (_) {}
}

async function isSuppressedThisSession() {
  const res = await readSession(SESSION_SUPPRESS_KEYS);
  return SESSION_SUPPRESS_KEYS.some((k) => res[k]);
}

// Store ID fallback map (defensive only). Primary source is always
// chrome.runtime.id, which returns the correct per-browser CRX ID at
// runtime. These constants only backfill if runtime.id is somehow empty.
const FALLBACK_IDS = {
  chrome: 'icapcpllhdnnpcmfdcgpnbgchfenmjmg',
  edge: 'okldldohcpoeldjackkdakhoflphiipn'
};

// Detect the browser's store from the UA. The real Edge token is "Edg/"
// (Chromium Edge); also accept EdgA/ (Android) and EdgiOS/ for safety.
// Everything else resolves to Chrome Web Store.
function detectStore() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Edg\//i.test(ua) || /EdgA\//i.test(ua) || /EdgiOS\//i.test(ua)) {
    return 'edge';
  }
  return 'chrome';
}

// A CRX ID is 32 lowercase a-p chars. Used to reject malformed/garbage IDs
// before they become a broken /detail/<garbage> navigation.
const CRX_ID_RE = /^[a-p]{32}$/;

function resolveStoreId() {
  const store = detectStore();
  // Primary: runtime.id (correct per-browser at runtime).
  let id = '';
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      id = chrome.runtime.id;
    }
  } catch (_) { /* fall through to fallback */ }

  // Defensive fallback: only if runtime.id is empty/invalid.
  if (!id || !CRX_ID_RE.test(id)) {
    id = store === 'edge' ? FALLBACK_IDS.edge : FALLBACK_IDS.chrome;
  }

  return { id, store };
}

// Build the store review URL. Returns null if no valid ID can be resolved
// (runtime.id empty AND fallback unusable) so the caller can skip the
// prompt rather than open a dead /detail/ page.
function storeReviewUrl() {
  const { id, store } = resolveStoreId();
  if (!id || !CRX_ID_RE.test(id)) return null;
  if (store === 'edge') {
    // Edge shows reviews inline on the detail page — no /reviews sub-path.
    return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
  }
  return `https://chromewebstore.google.com/detail/${id}/reviews`;
}

export async function registerHubOpen() {
  try {
    const [{ [HUB_OPENS_KEY]: opens = 0, [RATING_STATE_KEY]: state = 'pending' },
           suppressed] = await Promise.all([
      readLocal([HUB_OPENS_KEY, RATING_STATE_KEY]),
      isSuppressedThisSession()
    ]);

    if (state === 'done') return; // already shown+resolved, never again
    if (suppressed) {
      // Still count the open (so we don't lose the moment), just don't show.
      setLocal({ [HUB_OPENS_KEY]: opens + 1 });
      return;
    }

    const nextOpens = opens + 1;
    setLocal({ [HUB_OPENS_KEY]: nextOpens });

    if (nextOpens >= TRIGGER_OPENS) {
      // Confirm premium status — premium users never see the rating prompt.
      let isPremium = false;
      try {
        const bg = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
        isPremium = !!(bg && bg.isPremium);
      } catch (_) {}
      if (isPremium) {
        setLocal({ [RATING_STATE_KEY]: 'done' });
        return;
      }
      // Re-check suppression right before showing (race-safe).
      if (await isSuppressedThisSession()) return;
      showRatingPrompt();
    }
  } catch (_) { /* never break the panel */ }
}

// Mark the session as paywall-adjacent so the rating prompt stays hidden.
// Called from conversationHub (hub_limit_hit) and privacy-mask block path.
export function suppressThisSession(reason) {
  try {
    if (reason === 'hub_limit') setSession({ sessionHubLimitHit: true });
    if (reason === 'privacy_block') setSession({ sessionPrivacyBlock: true });
    if (reason === 'premium_modal') setSession({ sessionPremiumModalShown: true });
  } catch (_) {}
}

function showRatingPrompt() {
  try {
    if (document.getElementById('rating-prompt')) return; // already in DOM
  } catch (_) { return; }

  // Resolve the review URL once. If we can't build a valid one (runtime.id
  // missing AND fallback unusable), fail silent — never open a dead page.
  const reviewUrl = storeReviewUrl();
  if (!reviewUrl) return;

  try { track('rating_prompt_shown', { trigger: 'hub_opens', opens: TRIGGER_OPENS }); } catch (_) {}

  const el = buildPrompt(reviewUrl);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));

  // Auto-dismiss after a while if ignored (does NOT mark as 'done' so a
  // future qualifying session can try again — but the trigger counter
  // keeps climbing, so effectively it won't re-trigger easily).
  const autoTimer = setTimeout(() => closePrompt(el, false), 20000);

  const closePrompt = (node, resolved) => {
    clearTimeout(autoTimer);
    try {
      node.classList.remove('is-visible');
      setTimeout(() => node.remove(), 300);
    } catch (_) { try { node.remove(); } catch (_) {} }
    if (resolved) setLocal({ [RATING_STATE_KEY]: 'done' });
    else setLocal({ [RATING_STATE_KEY]: 'done' }); // dismiss also = done, never nag
  };

  el.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'rate') {
      try { track('rating_prompt_clicked', { target: 'store' }); } catch (_) {}
      try { window.open(reviewUrl, '_blank', 'noopener'); } catch (_) {}
      closePrompt(el, true);
    } else if (action === 'dismiss') {
      closePrompt(el, false);
    }
  });
}

function buildPrompt(reviewUrl) {
  const el = document.createElement('div');
  el.id = 'rating-prompt';
  el.className = 'rating-prompt';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Rate the extension');
  el.innerHTML = `
    <div class="rating-prompt-inner">
      <div class="rating-prompt-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.88L18.18 22 12 18.8 5.82 22 7 14.15l-5-4.88 6.91-1.01L12 2z"/>
        </svg>
      </div>
      <div class="rating-prompt-copy">
        <div class="rating-prompt-title">Enjoying AI Side Panel?</div>
        <div class="rating-prompt-sub">A quick rating helps others find it. Takes 10 seconds.</div>
      </div>
      <div class="rating-prompt-actions">
        <button class="rating-prompt-btn rating-prompt-btn--primary" data-action="rate">Rate it</button>
        <button class="rating-prompt-btn rating-prompt-btn--ghost" data-action="dismiss" aria-label="Dismiss">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="rotate(90 8 8)"/></svg>
        </button>
      </div>
    </div>
  `;
  // Stash URL on the node for the click handler (also accessible via closure).
  el.dataset.reviewUrl = reviewUrl;
  return el;
}
