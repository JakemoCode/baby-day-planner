// Authorized users for the Baby Day Planner.
// To add or remove a user, update this array AND firestore.rules in lockstep.
export const ALLOWLISTED_EMAILS: readonly string[] = [
  "jake136@yahoo.com",
  "kellyrbarber@gmail.com",
] as const;

export function isAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWLISTED_EMAILS.includes(email.toLowerCase());
}
