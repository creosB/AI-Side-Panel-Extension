// Premium Auth (verify, security)
import { STORAGE_KEY_PREFIX, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS, isValidEmail, isValidCode } from './premiumShared.js';

// In-memory attempts (dual-layer with background storage attempts)
const inMemoryAttempts = new Map();

async function getStoredStatus(email) {
  try {
    const result = await chrome.storage.local.get(`${STORAGE_KEY_PREFIX}${email}`);
    return result[`${STORAGE_KEY_PREFIX}${email}`] || null;
  } catch {
    return null;
  }
}

export async function clearStoredStatus(email) {
  try {
    await chrome.storage.local.remove(`${STORAGE_KEY_PREFIX}${email}`);
    inMemoryAttempts.delete(email);
    await chrome.runtime.sendMessage({ type: 'CLEAR_ATTEMPTS', payload: { email } });
  } catch (err) {
    console.error('Clear storage error:', err);
  }
}

function checkRateLimit(email) {
  const now = Date.now();
  const attempt = inMemoryAttempts.get(email);
  if (attempt) {
    if (now - attempt.timestamp < ATTEMPT_WINDOW_MS) {
      if (attempt.count >= MAX_ATTEMPTS) return false;
    } else {
      inMemoryAttempts.delete(email);
    }
  }
  return true;
}

function incrementAttempts(email) {
  const now = Date.now();
  const attempt = inMemoryAttempts.get(email);
  if (!attempt || now - attempt.timestamp > ATTEMPT_WINDOW_MS) {
    inMemoryAttempts.set(email, { count: 1, timestamp: now });
  } else {
    attempt.count++;
  }
}

// Validators now imported from shared

export async function checkPremiumStatus(email, code) {
  try {
    if (!email || !code) {
      return { isPremium: false, message: 'Missing email or code' };
    }
    if (!isValidEmail(email)) {
      return { isPremium: false, message: 'Invalid email' };
    }
    if (!isValidCode(code)) {
      return { isPremium: false, message: 'Invalid license format' };
    }

    // Use cached premium status if still within check period
    const storedStatus = await getStoredStatus(email);
    const now = Date.now();
    const checkPeriodMs = (storedStatus?.checkPeriodDays || 7) * 24 * 60 * 60 * 1000;
    if (storedStatus?.isPremium && storedStatus?.lastChecked && now - storedStatus.lastChecked < checkPeriodMs) {
      return {
        isPremium: true,
        message: 'Already verified',
        lastChecked: storedStatus.lastChecked,
        checkPeriodDays: storedStatus.checkPeriodDays,
      };
    }

    // Dual-layer rate limiting
    if (!checkRateLimit(email)) {
      return { isPremium: false, message: 'Too many attempts. Try again later.' };
    }
    incrementAttempts(email);

    // Ask background to check
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_PREMIUM_STATUS',
      payload: { email, code },
    });

    if (response?.success) {
      return {
        isPremium: !!response.isPremium,
        message: response.isPremium ? 'Access granted' : 'Pending approval or inactive',
        lastChecked: Date.now(),
        checkPeriodDays: response.checkPeriodDays,
      };
    }

    return { isPremium: false, message: response?.error || 'Verification error' };
  } catch (error) {
    console.error('Error checking premium status:', error);
    return { isPremium: false, message: 'Unknown error' };
  }
}
