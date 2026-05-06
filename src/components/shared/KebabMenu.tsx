"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import styles from "./KebabMenu.module.css";

export function KebabMenu() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="6" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="18" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <Link
            href="/history"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            History
          </Link>
          <Link
            href="/day-templates"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            Day templates
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <div className={styles.divider} role="presentation" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
