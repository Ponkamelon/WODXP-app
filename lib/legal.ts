// Single source of truth for the legal settings used by signup, /terms and /privacy.

// Minimum age for new registrations (decision 2026-10-31).
export const MIN_AGE = 16;

// Bump when /terms or /privacy change in a way users must accept again.
// Stored in the user's auth metadata together with the acceptance time.
export const TERMS_VERSION = '2026-10-31';

export const LEGAL_LAST_UPDATED = 'October 31, 2026';

// Year-of-birth check. Only the year is asked for, so a person who turns
// MIN_AGE later in the year of birthYear + MIN_AGE passes a few months early.
export function isOldEnough(birthYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - birthYear >= MIN_AGE;
}

export function isValidBirthYear(birthYear: number, now: Date = new Date()): boolean {
  return Number.isInteger(birthYear) && birthYear >= 1900 && birthYear <= now.getFullYear();
}
