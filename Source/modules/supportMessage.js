/**
 * Premium Support Message Module
 * Created with love and convenience for donations
 */

class SupportMessage {
    constructor() {
        this.container = null;
        this.card = null;
        this.button = null;
        this.isInitialized = false;
    }

    init() {
        // Avoid double initialization
        if (this.isInitialized) return;

    this.container = document.querySelector('.support-message-container');
    this.card = document.querySelector('.support-message-card');
    // Prefer new premium button ID, fallback to new class
    this.button = document.getElementById('premium-cta-button') || document.querySelector('.premium-cta-button');
        
        if (!this.container || !this.card || !this.button) {
            // Elements might not be ready yet, retry after a short delay
            setTimeout(() => this.init(), 100);
            return;
        }

        this.setupEventListeners();
        this.createFloatingParticles();
        this.startHeartbeatAnimation();
        this.isInitialized = true;

    }

    setupEventListeners() {
        // Enhanced hover effects
        this.card.addEventListener('mouseenter', this.onCardHover.bind(this));
        this.card.addEventListener('mouseleave', this.onCardLeave.bind(this));
        
        // Button interaction effects
        this.button.addEventListener('mouseenter', this.onButtonHover.bind(this));
        this.button.addEventListener('click', this.onButtonClick.bind(this));
        
        // Touch support for mobile
        this.card.addEventListener('touchstart', this.onCardTouch.bind(this), { passive: true });
    }

    onCardHover() {
        // Trigger sparkle animation
        this.triggerSparkles();
        
        // Add extra glow effect
        this.card.style.boxShadow = `
            0 25px 50px rgba(0, 255, 170, 0.2),
            0 12px 25px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.3)
        `;
    }

    onCardLeave() {
        // Reset glow effect
        this.card.style.boxShadow = '';
    }

    onCardTouch() {
        // Add haptic feedback simulation for touch devices
        this.card.style.transform = 'translateY(-2px) scale(1.01)';
        setTimeout(() => {
            this.card.style.transform = '';
        }, 150);
    }

    onButtonHover() {
        // Create ripple effect
        this.createRippleEffect(this.button);
    }

    onButtonClick(e) {
        // Prevent default temporarily for animation
        e.preventDefault();
        
        // Create celebration effect
        this.createCelebrationEffect();
        
        // Track the donation click (optional analytics)
        this.trackDonationClick();
        
        // Proceed with opening premium modal after animation.
        // Emit a custom event so the premium module handles the modal/checkout flow.
        setTimeout(() => {
            const ev = new CustomEvent('openPremiumModal', { detail: { source: 'supportMessage' } });
            window.dispatchEvent(ev);
        }, 300);
    }

    createRippleEffect(element) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            transform: scale(0);
            animation: ripple 600ms ease-out;
            pointer-events: none;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            margin-top: -10px;
            margin-left: -10px;
        `;
        
        element.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }

    triggerSparkles() {
        const sparkles = this.card.querySelectorAll('.sparkle');
        sparkles.forEach((sparkle, index) => {
            sparkle.style.animation = 'none';
            sparkle.offsetHeight; // Trigger reflow
            sparkle.style.animation = `sparkle-float 2s ease-in-out ${index * 0.3}s`;
        });
    }

    createCelebrationEffect() {
        // Create temporary celebration particles
        for (let i = 0; i < 12; i++) {
            this.createParticle(i);
        }
    }

    createParticle(index) {
        const particle = document.createElement('div');
        const emoji = ['✨', '💫', '⭐', '🎉', '💖', '🙏'][Math.floor(Math.random() * 6)];
        
        particle.textContent = emoji;
        particle.style.cssText = `
            position: absolute;
            pointer-events: none;
            font-size: 1.2rem;
            z-index: 1000;
            animation: particle-burst 1s ease-out forwards;
        `;
        
        // Position around the button
        const buttonRect = this.button.getBoundingClientRect();
        const angle = (index * 30) * Math.PI / 180;
        const distance = 50 + Math.random() * 30;
        
        particle.style.left = (buttonRect.left + buttonRect.width / 2) + 'px';
        particle.style.top = (buttonRect.top + buttonRect.height / 2) + 'px';
        particle.style.setProperty('--end-x', Math.cos(angle) * distance + 'px');
        particle.style.setProperty('--end-y', Math.sin(angle) * distance + 'px');
        
        document.body.appendChild(particle);
        
        // Remove particle after animation
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 1000);
    }

    createFloatingParticles() {
        // Create subtle floating background particles
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return; // Skip for reduced motion users
        }

        setInterval(() => {
            if (Math.random() < 0.3 && this.card && this.card.offsetParent) { // 30% chance and card is visible
                this.createFloatingParticle();
            }
        }, 3000);
    }

    createFloatingParticle() {
        const particle = document.createElement('div');
        particle.textContent = ['✨', '💫', '⭐'][Math.floor(Math.random() * 3)];
        particle.style.cssText = `
            position: absolute;
            pointer-events: none;
            font-size: 0.8rem;
            opacity: 0.6;
            animation: float-up 4s ease-out forwards;
            z-index: 1;
        `;
        
        // Random position within the card
        const cardRect = this.card.getBoundingClientRect();
        particle.style.left = Math.random() * cardRect.width + 'px';
        particle.style.top = cardRect.height + 'px';
        
        this.card.appendChild(particle);
        
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 4000);
    }

    startHeartbeatAnimation() {
        const heartIcon = this.card.querySelector('.support-heart-icon');
        if (!heartIcon) return;

        // Add subtle pulsing effect that syncs with "heartbeat"
        setInterval(() => {
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && heartIcon.offsetParent) {
                heartIcon.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    heartIcon.style.transform = 'scale(1)';
                }, 150);
            }
        }, 2000);
    }

    trackDonationClick() {
        // Optional: Add analytics tracking here
        
        // Could integrate with analytics services:
        // gtag('event', 'donation_click', { 'source': 'support_message' });
        // or other tracking services
    }
}

// Add required CSS animations dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    @keyframes particle-burst {
        0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
        }
        100% {
            transform: translate(var(--end-x), var(--end-y)) scale(0);
            opacity: 0;
        }
    }
    
    @keyframes float-up {
        0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0.6;
        }
        100% {
            transform: translateY(-100px) rotate(180deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Export for module use
export default SupportMessage;
