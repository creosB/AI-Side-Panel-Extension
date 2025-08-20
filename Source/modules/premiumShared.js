// Shared Premium helpers: constants, validators, and small utils
// Used by UI modules and background to avoid duplication

export const STORAGE_KEY_PREFIX = 'premium_auth_status_v3_';
export const MAX_ATTEMPTS = 3;
export const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(code) {
	// UUID v4 format (case-insensitive)
	return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(code);
}

export function toSortedObject(obj) {
	return Object.keys(obj)
		.sort()
		.reduce((acc, key) => {
			acc[key] = obj[key];
			return acc;
		}, {});
}

