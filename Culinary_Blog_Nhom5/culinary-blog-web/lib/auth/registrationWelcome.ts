// UI-only receipt, never an authorization credential. No email, password or token.
export const WELCOME_KEY = "culinary.registration-welcome";
export const WELCOME_TTL = 10 * 60 * 1000;
export function validWelcomeReceipt(raw: string | null, userId: string, now = Date.now()): boolean {
  try {
    const value = JSON.parse(raw ?? "null");
    return Boolean(userId && value?.userId === userId && Number.isFinite(value.createdAt)
      && now >= value.createdAt && now - value.createdAt < WELCOME_TTL);
  } catch { return false; }
}
export function markRegistration(userId: string) {
  try { sessionStorage.setItem(WELCOME_KEY, JSON.stringify({ userId, createdAt: Date.now() })); } catch { /* Storage restrictions must not fail registration. */ }
}
export function clearRegistration() {
  try { sessionStorage.removeItem(WELCOME_KEY); } catch { /* Optional UI state. */ }
}
