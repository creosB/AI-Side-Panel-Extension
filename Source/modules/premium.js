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
				<div class="premium-modal-header">
					<h2 id="premium-title" class="premium-modal-title">Premium</h2>
					<div class="premium-modal-subtitle">Unlock extra features and support development.</div>
				</div>
				<div class="premium-modal-body">
					<div class="premium-features">
						<div class="premium-feature"><span>✔</span><span>Your support helps fund ongoing development and my education.</span></div>
						<div class="premium-feature"><span>✔</span><span>Enhance your browsing with beautiful, custom themes.</span></div>
						<div class="premium-feature"><span>✔</span><span>Priority support</span></div>
					</div>
					<div class="premium-form" data-premium-form>
						<input type="email" class="premium-input" placeholder="Email used at checkout" data-premium-email />
						<input type="text" class="premium-input" placeholder="License key" data-premium-code />
					</div>
					<div class="premium-status" data-premium-status></div>
					<div class="premium-actions" data-premium-actions>
						<button class="premium-btn primary" data-premium-buy>Upgrade</button>
						<button class="premium-btn secondary" data-premium-verify>Verify</button>
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
			window.open('https://artistscompany.lemonsqueezy.com/buy/07ad19ea-1d92-4855-a68e-56d9c77a0b6a', '_blank');
		});
		this.verifyBtn?.addEventListener('click', () => this.handleVerify());

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
				statusEl.textContent = 'Enter your email and license to verify.';
				this.showVerifyForm(true);
				return;
			}
			if (bg.isPremium) {
				statusEl.className = 'premium-status success show';
				statusEl.textContent = 'Premium active. Thank you!';
				this.showVerifyForm(false);
				// Hide or disable Upgrade button when already premium
				if (this.buyBtn) {
					this.buyBtn.style.display = 'none';
					this.buyBtn.setAttribute('aria-hidden', 'true');
				}
				this.setPremiumBadge(true);
			} else {
				statusEl.className = 'premium-status info show';
				statusEl.textContent = 'License not verified yet.';
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
		if (this.formEl) this.formEl.style.display = show ? '' : 'none';
		if (this.verifyBtn) this.verifyBtn.style.display = show ? '' : 'none';
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

		if (!email || !code) return show('error', 'Email and license are required.');
		if (!this.isValidEmail(email)) return show('error', 'Invalid email.');
		if (!this.isValidCode(code)) return show('error', 'Invalid license format.');

		if (!this.checkRateLimit(email)) return show('error', 'Too many attempts. Try later.');
		this.incrementAttempts(email);

			try {
				const result = await checkPremiumStatus(email, code);
				if (result.isPremium) {
					show('success', 'Access granted. Welcome to Premium!');
					setTimeout(() => this.close(), 1500);
				} else {
					// Show the message from auth
					show('info', result.message || 'Verification failed.');
				}
			} catch (e) {
				console.error('verify error', e);
				show('error', 'Unexpected error.');
			}
	}
}

