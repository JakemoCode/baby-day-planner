import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  title: string;
  body?: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className={styles.root} role="status">
      <h3 className={styles.title}>{title}</h3>
      {body && <p className={styles.body}>{body}</p>}
    </div>
  );
}
