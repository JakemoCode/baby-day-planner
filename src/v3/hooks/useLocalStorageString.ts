"use client";

import { useSyncExternalStore } from "react";

function subscribe(key: string, callback: () => void): () => void {
  const localEvent = `bdp:ls-change:${key}`;
  window.addEventListener("storage", callback);
  window.addEventListener(localEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(localEvent, callback);
  };
}

/**
 * Reads a localStorage string, stays in sync across tabs (via the native
 * `storage` event) and within the same tab (via a per-key custom event that
 * the setter dispatches, since storage events don't fire in the originating tab).
 */
export function useLocalStorageString(
  key: string,
  defaultValue: string,
): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => {
      try {
        return localStorage.getItem(key) ?? defaultValue;
      } catch {
        return defaultValue;
      }
    },
    () => defaultValue,
  );

  function setValue(next: string): void {
    try {
      localStorage.setItem(key, next);
      window.dispatchEvent(new Event(`bdp:ls-change:${key}`));
    } catch {
      // localStorage unavailable (private mode) — write has no effect.
    }
  }

  return [value, setValue];
}
