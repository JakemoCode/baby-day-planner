import { describe, it, expect, beforeEach, vi } from "vitest";

describe("firebase client config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when required env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    await expect(import("./client")).rejects.toThrow(/firebase env/i);
  });

  it("constructs a client when env vars are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "0");
    const mod = await import("./client");
    expect(mod.firebaseApp).toBeDefined();
    expect(mod.auth).toBeDefined();
    expect(mod.db).toBeDefined();
  });
});
