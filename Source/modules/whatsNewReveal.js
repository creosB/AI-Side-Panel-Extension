// What's-New re-exposure overlay (v1.6.1).
//
// On update, background arms `showWhatsNew`. When the side panel next opens
// and the user is NOT premium, we show a short value-first sequence:
//   step 0 — Conversation Hub value
//   step 1 — Privacy Mask value
//   step 2 — Premium CTA (the ask, last)
// Re-selling value before the ask beats dropping straight onto the paywall.
// First-time installers keep the full onboarding overlay untouched — this
// path is only reached via the update flag.
//
// The overlay is self-contained DOM (does not touch onboarding.html, whose
// slider track is hardcoded to 5 slides). whatsnew_shown fires once per
// update; the flag is cleared on read.

import { track } from './analytics.js';

const WHATS_NEW_FLAG_KEY = 'showWhatsNew';

const STEPS = [
  {
    key: 'hub',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
    eyebrow: 'Conversation Hub',
    title: 'All your AI chats, one place',
    body: 'See and search conversations across ChatGPT, Claude, Gemini and more — without leaving the panel.'
  },
  {
    key: 'privacy',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/><path d="M9 12l2 2 4-4"/></svg>`,
    eyebrow: 'Privacy Mask',
    title: 'Redact before you send',
    body: 'Automatically mask emails, card numbers, keys and IDs in your prompt before it reaches the AI.'
  },
  {
    key: 'premium',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.88L18.18 22 12 18.8 5.82 22 7 14.15l-5-4.88 6.91-1.01L12 2z"/></svg>`,
    eyebrow: 'Go Pro',
    title: 'Unlock it all — one payment, forever',
    body: 'Unlimited history depth, Privacy Mask, themes and priority support. A single lifetime payment, no subscription.'
  }
];

export function initWhatsNewReveal() {
  try {
    chrome.storage.local.get([WHATS_NEW_FLAG_KEY], (res) => {
      if (!res || !res[WHATS_NEW_FLAG_KEY]) return;
      // Clear immediately so a re-open in the same profile never re-fires.
      try { chrome.storage.local.remove([WHATS_NEW_FLAG_KEY]); } catch (_) {}

      // Skip entirely for already-premium users.
      chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' }, (status) => {
        try {
          if (chrome.runtime.lastError) return;
          if (status && status.isPremium) return; // premium: no reveal
          showReveal();
        } catch (_) {}
      });
    });
  } catch (_) {}
}

function showReveal() {
  try { track('whatsnew_shown', { sequence: 'value_then_premium' }); } catch (_) {}

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  let step = 0;
  const render = () => paintStep(overlay, step);
  render();

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'next') {
      if (step < STEPS.length - 1) { step += 1; render(); }
    } else if (action === 'back') {
      if (step > 0) { step -= 1; render(); }
    } else if (action === 'premium') {
      closeOverlay(overlay);
      window.premiumManager?.openFrom?.('whatsnew') || window.premiumManager?.open?.();
    } else if (action === 'skip') {
      closeOverlay(overlay);
    } else if (e.target === overlay.querySelector('.wnr-backdrop')) {
      // backdrop click = skip (only on non-final steps to avoid accidental loss)
      closeOverlay(overlay);
    }
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeOverlay(overlay); }
    if (e.key === 'ArrowRight') {
      const btn = overlay.querySelector('[data-action="next"], [data-action="premium"]');
      btn?.click();
    }
    if (e.key === 'ArrowLeft') {
      overlay.querySelector('[data-action="back"]')?.click();
    }
  });
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'wnr-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', "What's new");
  overlay.innerHTML = `
    <div class="wnr-backdrop" data-action="backdrop"></div>
    <div class="wnr-card" tabindex="-1">
      <button class="wnr-close" data-action="skip" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
      </button>
      <div class="wnr-step"></div>
      <div class="wnr-controls"></div>
    </div>
  `;
  // focus the card for keyboard nav
  setTimeout(() => overlay.querySelector('.wnr-card')?.focus(), 50);
  return overlay;
}

function paintStep(overlay, step) {
  const data = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const stepEl = overlay.querySelector('.wnr-step');
  stepEl.innerHTML = `
    <div class="wnr-icon ${isLast ? 'wnr-icon--premium' : ''}">${data.icon}</div>
    <div class="wnr-eyebrow ${isLast ? 'wnr-eyebrow--premium' : ''}">${data.eyebrow}</div>
    <h2 class="wnr-title">${data.title}</h2>
    <p class="wnr-body">${data.body}</p>
  `;

  const dots = STEPS.map((_, i) =>
    `<div class="wnr-dot ${i === step ? 'active' : ''} ${i === STEPS.length - 1 ? 'wnr-dot--amber' : ''}"></div>`
  ).join('');

  const ctrlEl = overlay.querySelector('.wnr-controls');
  ctrlEl.innerHTML = `
    <div class="wnr-dots">${dots}</div>
    <div class="wnr-btn-row">
      ${step > 0 ? `<button class="wnr-btn wnr-btn--back" data-action="back" aria-label="Back">
        <svg viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>` : '<span></span>'}
      ${isLast
        ? `<button class="wnr-btn wnr-btn--premium" data-action="premium">Go Pro</button>
           <button class="wnr-btn wnr-btn--ghost" data-action="skip">Maybe later</button>`
        : `<button class="wnr-btn wnr-btn--next" data-action="next">Next</button>`}
    </div>
  `;
}

function closeOverlay(overlay) {
  try {
    overlay.classList.remove('is-open');
    setTimeout(() => overlay.remove(), 250);
  } catch (_) {
    try { overlay.remove(); } catch (_) {}
  }
}
