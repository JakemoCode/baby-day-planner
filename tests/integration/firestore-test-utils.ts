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
 * Seed `/users/{uid}` with the given childIds, bypassing security rules.
 *
 * Most repo tests now require the user → childIds mapping to exist because
 * `/children/{id}` (and its subcollections) are gated on `request.auth.uid in
 * users.childIds`. Without this seed, every authenticated write would fail
 * with permission-denied even for the canonical ALLOWED_USER.
 *
 * Call inside `beforeEach` after `env.clearFirestore()`.
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
