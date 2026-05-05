"use client";

import { useState } from "react";
import { useAuth } from "./useAuth";

export function SignIn() {
  const { signIn, status } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  }

  return (
    <main style={{ padding: "var(--space-4)", maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <h1>Baby Day Planner</h1>
      <p>Sign in to continue.</p>
      <button type="button" onClick={handleClick}>
        Sign in with Google
      </button>
      {status === "forbidden" && (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          This account is not authorized.
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </main>
  );
}
