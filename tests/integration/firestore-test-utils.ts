import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
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
