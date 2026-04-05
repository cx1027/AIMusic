import { APP_URL } from "@/lib/site";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.bgOverlay} aria-hidden="true" />
      <div className={styles.card}>
        <div className={styles.header}>
          <a href={APP_URL} className={styles.logo} aria-label="Melodrift Home">
            <span className={styles.logoIcon}>♪</span>
            <span className={styles.logoText}>Melodrift</span>
          </a>
        </div>
        <div className={styles.body}>
          <div className={styles.icon}>404</div>
          <h1 className={styles.title}>Share not found</h1>
          <p className={styles.desc}>
            This share link may have been removed, expired, or never existed.
          </p>
        </div>
        <div className={styles.footer}>
          <a href={APP_URL} className={styles.ctaButton}>
            Create Your Own Music
          </a>
        </div>
      </div>
    </div>
  );
}
