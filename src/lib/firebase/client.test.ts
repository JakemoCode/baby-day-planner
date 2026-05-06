import { describe, it, expect, beforeEach, vi } from "vitest";

describe("firebase client config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does NOT throw when only the module is imported (lazy init)", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    // Importing alone should be safe — server-render evaluation must not crash.
    await expect(import("./client")).resolves.toBeDefined();
  });

  it("throws when env vars are missing AND auth/db is actually used", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    const { auth } = await import("./client");
    expect(() => auth.signOut).toThrow(/firebase env/i);
  });

  it("constructs a client when env vars are present and accessed", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "0");
    const mod = await import("./client");
    // Touching a property triggers lazy init.
    expect(mod.auth.app).toBeDefined();
    expect(mod.db.app).toBeDefined();
  });
});
