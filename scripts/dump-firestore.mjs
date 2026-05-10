import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs } from "firebase/firestore";
import { readFileSync } from "node:fs";

const env = await initializeTestEnvironment({
  projectId: "baby-day-planner-local",
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host: "localhost",
    port: 8080,
  },
});

// Use allowlisted user
const ctx = env.authenticatedContext("jake-uid", { email: "jake136@yahoo.com" });
const db = ctx.firestore();

const out = { children: {} };

const childrenSnap = await getDocs(collection(db, "children"));
for (const childDoc of childrenSnap.docs) {
  const childId = childDoc.id;
  out.children[childId] = { settings: null, days: [], templates: [], events: {} };

  const settingsSnap = await getDocs(collection(db, `children/${childId}/settings`));
  for (const s of settingsSnap.docs) {
    out.children[childId].settings = { id: s.id, data: s.data() };
  }

  const daysSnap = await getDocs(collection(db, `children/${childId}/days`));
  for (const d of daysSnap.docs) {
    out.children[childId].days.push({ id: d.id, data: d.data() });
    const eventsSnap = await getDocs(collection(db, `children/${childId}/days/${d.id}/events`));
    out.children[childId].events[d.id] = eventsSnap.docs.map((e) => ({ id: e.id, data: e.data() }));
  }

  const tplSnap = await getDocs(collection(db, `children/${childId}/templates`));
  for (const t of tplSnap.docs) {
    out.children[childId].templates.push({ id: t.id, data: t.data() });
  }
}

console.log(JSON.stringify(out, null, 2));
await env.cleanup();
