// Premium Module: modal, verification, and UI wiring
import { checkPremiumStatus } from './premiumAuth.js';
import { ATTEMPT_WINDOW_MS, MAX_ATTEMPTS, isValidEmail, isValidCode } from './premiumShared.js';

export default class PremiumManager {
	constructor() {
		this.overlay = null;
		this.emailInput = null;
		this.codeInput = null;
		this.statusBox = null;
		this.buyBtn = null;
		this.verifyBtn = null;
		this.closeBtn = null;

		this.inMemoryAttempts = new Map();
		this.port = null;
	}

	t(key, fallback, substitutions = []) {
		const localized = window._i18nMessages?.[key]?.message
			|| chrome?.i18n?.getMessage?.(key, substitutions)
			|| '';
		return localized || fallback;
	}

	localizeModal() {
		if (!this.overlay) return;

		const titleEl = this.overlay.querySelector('[data-premium-title]');
		const subtitleEl = this.overlay.querySelector('[data-premium-subtitle]');
		const featureOneEl = this.overlay.querySelector('[data-premium-feature-1]');
		const featureTwoEl = this.overlay.querySelector('[data-premium-feature-2]');
		const featureThreeEl = this.overlay.querySelector('[data-premium-feature-3]');
		const featureFourEl = this.overlay.querySelector('[data-premium-feature-4]');

		if (titleEl) titleEl.textContent = this.t('premiumModalTitle', 'Premium');
		if (subtitleEl) subtitleEl.textContent = this.t('premiumModalSubtitle', 'Unlock extra features and support development.');
		if (featureOneEl) featureOneEl.textContent = this.t('onboardingFeature3', 'Support education & future development');
		if (featureTwoEl) featureTwoEl.textContent = this.t('onboardingFeature2', 'Exclusive Theme Selector & custom styles');
		if (featureThreeEl) featureThreeEl.textContent = this.t('premiumModalFeature3', 'Priority support');
		if (featureFourEl) featureFourEl.textContent = this.t('conversationHubPremiumDescription', 'The Conversation Hub allows you to see and search all your AI conversations in one place. This is a premium feature to support the development.');

		if (this.emailInput) this.emailInput.placeholder = this.t('premiumModalEmailPlaceholder', 'Email used at checkout');
		if (this.codeInput) this.codeInput.placeholder = this.t('premiumModalLicensePlaceholder', 'License key');
		if (this.buyBtn) this.buyBtn.textContent = this.t('onboardingGoPremiumBtn', 'Go Premium');
		if (this.verifyBtn) this.verifyBtn.textContent = this.t('premiumModalVerifyButton', 'Verify');
		if (this.closeBtn) this.closeBtn.setAttribute('aria-label', this.t('extractionModalClose', 'Close'));

		if (this.statusBox && !this.statusBox.textContent) {
			this.statusBox.textContent = this.t('premiumModalStatusPrompt', 'Enter your email and license to verify.');
		}
	}

	init() {
		this.replaceSupportButton();
		// Listen for global requests to open the premium modal (e.g. from supportMessage)
		window.addEventListener('openPremiumModal', () => {
			try { this.open(); } catch (e) { /* ignore */ }
		});
		this.ensurePort();
	}

	ensurePort() {
		try {
			this.port = chrome.runtime.connect({ name: 'premium-status' });
			this.port.onMessage.addListener((msg) => {
				if (msg?.type === 'PREMIUM_STATUS_UPDATED') {
					// Optionally refresh UI state if needed
					this.updateStatusFromStorage();
				}
			});
		} catch (_) {
			// ignore if not available
		}
	}

	// UI creation
	createModal() {
		if (this.overlay) return;

		const overlay = document.createElement('div');
		overlay.className = 'premium-modal-overlay';
		overlay.innerHTML = `
			<div class="premium-modal-backdrop" data-premium-backdrop></div>
			<div class="premium-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title">
				<button class="premium-close" aria-label="Close" data-premium-close>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
				</button>
				
				<!-- 30% Off Promo Hero Banner -->
				<div class="premium-discount-banner">
					<div class="discount-banner-content">
						<div class="discount-banner-title">30% STORE-WIDE DISCOUNT</div>
						<div class="discount-banner-pill" id="discount-copy-pill" title="Click to copy code">
							<span class="discount-code-text">AISUMMER</span>
							<svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
							</svg>
							<span class="copy-tooltip" id="copy-tooltip">Copy</span>
						</div>
					</div>
					<div class="discount-scarcity">Ends July 7 — Limited Time Only!</div>
				</div>

				<div class="premium-modal-header">
					<h2 id="premium-title" class="premium-modal-title" data-premium-title>Premium</h2>
					<div class="premium-modal-subtitle" data-premium-subtitle>Unlock extra features and support development.</div>
				</div>
				<div class="premium-modal-body">
					<div class="premium-features">
						<div class="premium-feature"><span>✔</span><span data-premium-feature-1>Your support helps fund ongoing development and my education.</span></div>
						<div class="premium-feature"><span>✔</span><span data-premium-feature-2>Enhance your browsing with beautiful, custom themes.</span></div>
						<div class="premium-feature"><span>✔</span><span data-premium-feature-3>Priority support</span></div>
						<div class="premium-feature"><span>✔</span><span data-premium-feature-4>The Conversation Hub allows you to see and search all your AI conversations in one place. This is a premium feature to support the development.</span></div>
					</div>

					<!-- Primary & Secondary Conversion Buttons -->
					<div class="premium-conversion-actions" id="premium-conversion-actions">
						<button class="premium-btn primary conversion-btn" data-premium-buy>Go Premium, 30% OFF</button>
						<a href="https://artistscompany.lemonsqueezy.com/?checkout[discount_code]=AISUMMER" target="_blank" class="premium-btn secondary conversion-btn" id="premium-browse-store">
							Browse All Products, 30% OFF
							<span class="store-coupon-badge">AISUMMER</span>
						</a>
					</div>

					<!-- Separate Verification Section -->
					<div class="premium-verify-section" id="premium-verify-section">
						<div class="premium-verify-section-title">Have a license? Verify below</div>
						<div class="premium-form" data-premium-form>
							<input type="email" class="premium-input" placeholder="Email used at checkout" data-premium-email />
							<input type="text" class="premium-input" placeholder="License key" data-premium-code />
						</div>
						<div class="premium-status" data-premium-status></div>
						<div class="premium-actions" data-premium-actions style="margin-top: 10px; display: block;">
							<button class="premium-btn secondary" data-premium-verify style="width: 100%;">Verify License</button>
						</div>
					</div>
				</div>
			</div>
		`;

		document.body.appendChild(overlay);
		this.overlay = overlay;
		this.emailInput = overlay.querySelector('[data-premium-email]');
		this.codeInput = overlay.querySelector('[data-premium-code]');
		this.statusBox = overlay.querySelector('[data-premium-status]');
		this.buyBtn = overlay.querySelector('[data-premium-buy]');
		this.verifyBtn = overlay.querySelector('[data-premium-verify]');
		this.formEl = overlay.querySelector('[data-premium-form]');
		this.actionsEl = overlay.querySelector('[data-premium-actions]');
		this.closeBtn = overlay.querySelector('[data-premium-close]');

		overlay.querySelector('[data-premium-backdrop]')?.addEventListener('click', () => this.close());
		this.closeBtn?.addEventListener('click', () => this.close());
		this.buyBtn?.addEventListener('click', () => {
			window.open('https://artistscompany.lemonsqueezy.com/buy/07ad19ea-1d92-4855-a68e-56d9c77a0b6a?checkout[discount_code]=AISUMMER', '_blank');
		});
		this.verifyBtn?.addEventListener('click', () => this.handleVerify());

		// Copy to Clipboard logic
		const copyPill = overlay.querySelector('#discount-copy-pill');
		const copyTooltip = overlay.querySelector('#copy-tooltip');
		copyPill?.addEventListener('click', () => {
			navigator.clipboard.writeText('AISUMMER').then(() => {
				if (copyTooltip) {
					copyTooltip.textContent = 'Copied!';
					copyPill.classList.add('copied');
					setTimeout(() => {
						copyTooltip.textContent = 'Copy';
						copyPill.classList.remove('copied');
					}, 2000);
				}
			}).catch(err => {
				console.error('Failed to copy text: ', err);
			});
		});

		this.localizeModal();

		// pre-fill status if already premium
		this.updateStatusFromStorage();
	}

	open() {
		this.createModal();
		this.overlay.classList.add('is-open');
	}

	close() {
		if (this.overlay) this.overlay.classList.remove('is-open');
	}

	replaceSupportButton() {
		try {
			// Hook up the premium CTA button in the support message card
			const premiumCta = document.getElementById('premium-cta-button');
			if (premiumCta) {
				premiumCta.addEventListener('click', (e) => {
					e.preventDefault();
					this.open();
				});
			}

			// Hook up the premium social button in the footer
			const premiumSocial = document.getElementById('premium-social-button');
			if (premiumSocial) {
				premiumSocial.addEventListener('click', (e) => {
					e.preventDefault();
					this.open();
				});
				// track badge element for toggling
				this.footerBadge = premiumSocial.querySelector('.premium-badge');
			}
		} catch (e) {
			console.error('Premium button setup failed:', e);
		}
	}

	async updateStatusFromStorage() {
		try {
			const bg = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
			const statusEl = this.statusBox;
			if (!statusEl) return;
			if (!bg || bg.isPremium === undefined) {
				statusEl.className = 'premium-status info show';
				statusEl.textContent = this.t('premiumModalStatusPrompt', 'Enter your email and license to verify.');
				this.showVerifyForm(true);
				return;
			}
			if (bg.isPremium) {
				statusEl.className = 'premium-status success show';
				statusEl.textContent = this.t('premiumModalStatusActive', 'Premium active. Thank you!');
				this.showVerifyForm(false);
				// Hide or disable Upgrade button when already premium
				if (this.buyBtn) {
					this.buyBtn.style.display = 'none';
					this.buyBtn.setAttribute('aria-hidden', 'true');
				}
				this.setPremiumBadge(true);
			} else {
				statusEl.className = 'premium-status info show';
				statusEl.textContent = this.t('premiumModalStatusPending', 'License not verified yet.');
				this.showVerifyForm(true);
				if (this.buyBtn) {
					this.buyBtn.style.display = '';
					this.buyBtn.removeAttribute('aria-hidden');
				}
				this.setPremiumBadge(false);
			}
		} catch (_) {}
	}

	showVerifyForm(show) {
		const verifySection = this.overlay?.querySelector('#premium-verify-section');
		if (verifySection) verifySection.style.display = show ? '' : 'none';
		
		const buyBtn = this.overlay?.querySelector('[data-premium-buy]');
		if (buyBtn) buyBtn.style.display = show ? '' : 'none';

		const discountBanner = this.overlay?.querySelector('.premium-discount-banner');
		if (discountBanner) discountBanner.style.display = show ? '' : 'none';
	}

	setPremiumBadge(visible) {
		try {
			if (!this.footerBadge) return;
			this.footerBadge.style.display = visible ? 'inline-block' : 'none';
		} catch (_) {}
	}

	checkRateLimit(email) {
		const now = Date.now();
		const rec = this.inMemoryAttempts.get(email);
		if (rec && now - rec.timestamp < ATTEMPT_WINDOW_MS) {
			return rec.count < MAX_ATTEMPTS;
		}
		// window expired or none
		this.inMemoryAttempts.delete(email);
		return true;
	}

	incrementAttempts(email) {
		const now = Date.now();
		const rec = this.inMemoryAttempts.get(email);
		if (!rec || now - rec.timestamp > ATTEMPT_WINDOW_MS) {
			this.inMemoryAttempts.set(email, { count: 1, timestamp: now });
		} else {
			rec.count += 1;
		}
	}

	isValidEmail(email) { return isValidEmail(email); }

	isValidCode(code) { return isValidCode(code); }

		async handleVerify() {
		const email = (this.emailInput?.value || '').trim();
		const code = (this.codeInput?.value || '').trim();

		const show = (type, msg) => {
			if (!this.statusBox) return;
			this.statusBox.className = `premium-status ${type} show`;
			this.statusBox.textContent = msg;
		};

			if (!email || !code) return show('error', this.t('premiumModalStatusMissingFields', 'Email and license are required.'));
			if (!this.isValidEmail(email)) return show('error', this.t('premiumModalStatusInvalidEmail', 'Invalid email.'));
			if (!this.isValidCode(code)) return show('error', this.t('premiumModalStatusInvalidLicense', 'Invalid license format.'));

			if (!this.checkRateLimit(email)) return show('error', this.t('premiumModalStatusRateLimit', 'Too many attempts. Try later.'));
		this.incrementAttempts(email);

			try {
				const result = await checkPremiumStatus(email, code);
				if (result.isPremium) {
						show('success', this.t(result.messageKey || 'premiumModalStatusSuccess', 'Access granted. Welcome to Premium!'));
					setTimeout(() => this.close(), 1500);
				} else {
						const messageKey = result.messageKey || 'premiumModalStatusFailed';
						const message = this.t(messageKey, result.message || 'Verification failed.');
						show(messageKey === 'premiumModalStatusRateLimit' ? 'error' : 'info', message);
				}
			} catch (e) {
				console.error('verify error', e);
					show('error', this.t('premiumModalStatusUnexpected', 'Unexpected error.'));
			}
	}
}

