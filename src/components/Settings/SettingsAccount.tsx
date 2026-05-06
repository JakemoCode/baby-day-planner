"use client";

import { useAuth } from "@/lib/auth/useAuth";
import styles from "./SettingsField.module.css";

export function SettingsAccount() {
  const { user, signOut } = useAuth();

  return (
    <section className={styles.section} aria-labelledby="account-h">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id="account-h">
          Account
        </h3>
      </header>
      <p className={styles.sectionDescription}>{user?.email ?? "Not signed in"}</p>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </button>
    </section>
  );
}
