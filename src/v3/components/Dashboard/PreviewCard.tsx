import type { ReactNode } from "react";
import styles from "./PreviewCard.module.css";

export type PreviewCardProps = {
  /** Uppercase eyebrow heading, e.g. "Next bottle". */
  heading: string;
  /**
   * Primary line. `null` switches the card to the empty-state styling and
   * renders `emptyMessage` instead.
   */
  primary: ReactNode | null;
  /** Italic muted line shown when `primary` is null. */
  emptyMessage?: string;
  /** Optional subtitle line shown beneath `primary`. */
  subtitle?: ReactNode;
  /** Optional footer meta line (e.g. "Last: 8:30 AM"). */
  meta?: ReactNode;
  /**
   * `aria-label` for the card. Defaults to `heading` if omitted — most
   * callers can rely on the default.
   */
  ariaLabel?: string;
};

/**
 * Shared skeleton for dashboard preview cards (Next Bottle, Next Nap, etc.).
 * Renders heading + primary/empty + optional subtitle + optional meta in a
 * stack matching `PreviewCard.module.css`.
 */
export function PreviewCard({
  heading,
  primary,
  emptyMessage,
  subtitle,
  meta,
  ariaLabel,
}: PreviewCardProps) {
  return (
    <article className={styles.card} aria-label={ariaLabel ?? heading}>
      <p className={styles.heading}>{heading}</p>
      {primary !== null ? (
        <p className={styles.primary}>{primary}</p>
      ) : (
        emptyMessage !== undefined && <p className={styles.empty}>{emptyMessage}</p>
      )}
      {primary !== null && subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
      {meta !== undefined && <p className={styles.meta}>{meta}</p>}
    </article>
  );
}
