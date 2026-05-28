import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ID = "baby-day-planner-test";

export async function startTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "localhost",
      port: 8080,
    },
  });
}

export const ALLOWED_USER = { uid: "jake-uid", email: "jake136@yahoo.com" };
export const FORBIDDEN_USER = { uid: "stranger-uid", email: "stranger@example.com" };

/**
 * Seed `/users/{uid}` with childIds, bypassing rules. Required because `/children/{id}`
 * is gated on `request.auth.uid in users.childIds` — without it every authenticated
 * write is permission-denied. Call inside `beforeEach` after `env.clearFirestore()`.
 */
export async function seedAllowedUser(
  env: RulesTestEnvironment,
  uid: string,
  childIds: string[],
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `users/${uid}`), {
      uid,
      childIds,
      createdAt: 0,
    });
  });
}
