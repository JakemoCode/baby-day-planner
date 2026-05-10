"use client";

import type { ReactNode } from "react";
import styles from "./ActionButton.module.css";

export type ActionButtonProps = {
  /** Visual treatment — maps to a class in `ActionButton.module.css`. */
  variant: "primary" | "secondary" | "danger";
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** Optional className for additional layout/spacing tweaks. */
  className?: string | undefined;
  /** Accessibility: forwarded to the underlying `<button>`. */
  "aria-live"?: "polite" | "assertive" | "off" | undefined;
};

const VARIANT_CLASS: Record<ActionButtonProps["variant"], string> = {
  primary: "",
  secondary: styles.secondary ?? "",
  danger: styles.danger ?? "",
};

/**
 * Shared dashboard action button. Always full-width, 56px tall, uses the
 * three accent variants from `ActionButton.module.css`.
 */
export function ActionButton({
  variant,
  onClick,
  children,
  disabled,
  className,
  "aria-live": ariaLive,
}: ActionButtonProps) {
  const variantClass = VARIANT_CLASS[variant];
  const cls = [styles.button, variantClass, className].filter(Boolean).join(" ");
  const ariaProps = ariaLive !== undefined ? { "aria-live": ariaLive } : {};
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      {...ariaProps}
    >
      {children}
    </button>
  );
}
