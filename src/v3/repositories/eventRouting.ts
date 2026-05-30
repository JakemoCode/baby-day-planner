/**
 * Calendar-day routing for newly-created events (DOMAIN.md §2 "midnight rule":
 * an event belongs to the calendar day its clock time falls on). When the app
 * is open across midnight before the active day has rolled over, a new event
 * created "now" must land on today's day doc — not the still-active prior day.
 *
 * Leaf module: composes days + events repos so neither has to import the other.
 */

import type { Firestore } from "firebase/firestore";
import type { Event, TimeMin } from "../schemas";
import { createEvent } from "./events";
import { getOrCreatePlannedDay } from "./days";

/**
 * Persist a new event under the day doc for `calendarDate`, lazy-creating that
 * day (status `planned`) if needed. The event's `dayId` is overwritten to the
 * resolved day so it lands in the right subcollection.
 */
export async function createEventOnCalendarDay(
  db: Firestore,
  childId: string,
  event: Event,
  calendarDate: string,
  defaultWakeTime: TimeMin,
): Promise<void> {
  const target = await getOrCreatePlannedDay(db, childId, calendarDate, defaultWakeTime);
  await createEvent(db, childId, { ...event, dayId: target.id });
}
