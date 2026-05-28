/** Collision-safe event id using `crypto.randomUUID()`; `Date.now()`-based ids are banned in V3. */

export function newEventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Collision-safe day id; `day_` prefix distinguishes day ids from event ids in logs and Firestore. */
export function newDayId(): string {
  return `day_${crypto.randomUUID()}`;
}
