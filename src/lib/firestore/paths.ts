export const CHILDREN = "children";

export function childPath(childId: string): string {
  return `${CHILDREN}/${childId}`;
}

export function settingsPath(childId: string): string {
  return `${childPath(childId)}/settings/current`;
}

export function daysCollectionPath(childId: string): string {
  return `${childPath(childId)}/days`;
}

export function dayPath(childId: string, dayId: string): string {
  return `${daysCollectionPath(childId)}/${dayId}`;
}

export function eventsCollectionPath(childId: string, dayId: string): string {
  return `${dayPath(childId, dayId)}/events`;
}

export function eventPath(childId: string, dayId: string, eventId: string): string {
  return `${eventsCollectionPath(childId, dayId)}/${eventId}`;
}

export function templatesCollectionPath(childId: string): string {
  return `${childPath(childId)}/templates`;
}

export function templatePath(childId: string, templateId: string): string {
  return `${templatesCollectionPath(childId)}/${templateId}`;
}

export function tomorrowPlansCollectionPath(childId: string): string {
  return `${childPath(childId)}/tomorrowPlans`;
}

export function tomorrowPlanPath(childId: string, date: string): string {
  return `${tomorrowPlansCollectionPath(childId)}/${date}`;
}
