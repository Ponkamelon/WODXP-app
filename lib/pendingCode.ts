// A printed founder-pass card has a QR code to /signup?code=WODXP-XXXX-XXXX.
// The code is remembered on this device (never sent anywhere) so the Access code
// box can be pre-filled after the person has signed up and logged in.
// Redeeming still happens on the server and still needs a signed-in user.
const KEY = 'wodxp_pending_code';
const CODE_RE = /^WODXP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function capturePendingCode(search: string): void {
  try {
    const raw = new URLSearchParams(search).get('code');
    const code = raw?.trim().toUpperCase() ?? '';
    if (CODE_RE.test(code)) localStorage.setItem(KEY, code);
  } catch {
    // Storage can be unavailable (private mode); the person can type the code instead.
  }
}

export function readPendingCode(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && CODE_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingCode(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
