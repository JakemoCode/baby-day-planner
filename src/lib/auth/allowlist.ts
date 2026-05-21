// Authorized users for the Baby Day Planner (prod gate).
// To add or remove a user, update this array. Firestore rules no longer
// gate on email — per-user data isolation is handled by canAccessChild
// + createdBy — but the client check keeps prod a closed beta.
export const ALLOWLISTED_EMAILS: readonly string[] = [
  "jake136@yahoo.com",
  "kellyrbarber@gmail.com",
] as const;

export function isAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  // Dev bypass: the Firebase Auth emulator's email-generator UI mints
  // throwaway addresses (commonly @example.com) that obviously can't be
  // hardcoded. Treat any signed-in user as authorized when running
  // against the emulator so onboarding flows can be click-tested without
  // editing this list every session. Prod gate is unchanged.
  if (process.env.NODE_ENV === "development") return true;
  return ALLOWLISTED_EMAILS.includes(email.toLowerCase());
}
