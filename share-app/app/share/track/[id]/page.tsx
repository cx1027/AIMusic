/**
 * ISR Share Page — /share/track/[id]
 *
 * Renders OG meta tags for crawlers (WeChat, Twitter, etc.)
 * and provides an interactive player for real users.
 *
 * ISR: revalidate at most every 60 seconds.
 * On-demand revalidation is triggered via POST /api/track-shares/revalidate
 * when the song metadata changes.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchShareData } from "@/lib/api";
import SharePlayer from "@/components/SharePlayer";
import styles from "./page.module.css";

interface PageProps {
  params: { id: string };
}

// ---------------------------------------------------------------------------
// Dynamic OG Meta (runs on server — crawlers see full meta)
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = decodeURIComponent(params.id);

  let track;
  try {
    track = await fetchShareData(slug);
  } catch {
    return {
      title: "Melodrift — Share",
      description: "Listen to AI-generated music on Melodrift",
    };
  }

  const title = track.title || "Untitled AI Song";
  const description = track.prompt
    ? `${track.prompt.slice(0, 160)} — Created with Melodrift AI`
    : `An AI-generated song created with Melodrift — ${track.genre ? track.genre + " · " : ""}${track.duration}s`;
  const imageUrl = track.cover_image_url || undefined;
  const audioUrl = track.audio_url || undefined;

  return {
    title,
    description,
    openGraph: {
      type: "music.song",
      title,
      description,
      images: imageUrl ? [{ url: imageUrl, width: 1024, height: 1024 }] : [],
      audio: audioUrl ? [{ url: audioUrl, type: "audio/mpeg" }] : [],
      siteName: "Melodrift",
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
    other: {
      "og:type": "music.song",
      "og:song:url": audioUrl || "",
      "music:duration": String(track.duration),
      "music:musician": `https://your-domain.com/profile/${track.user.username}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Page Component (ISR, revalidates every 60s)
// ---------------------------------------------------------------------------

export const revalidate = 60; // seconds

export default async function ShareTrackPage({ params }: PageProps) {
  const slug = decodeURIComponent(params.id);

  let track;
  try {
    track = await fetchShareData(slug);
  } catch {
    notFound();
  }

  if (track.is_revoked) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorState}>
            <p className="text-yellow-400">This share link has been revoked.</p>
          </div>
        </div>
      </div>
    );
  }

  const coverImageUrl = track.cover_image_url || null;
  const formattedDate = new Date(track.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className={styles.container}>
      {/* Ambient background */}
      {coverImageUrl && (
        <div
          className={styles.bgCover}
          style={{ backgroundImage: `url(${coverImageUrl})` }}
          aria-hidden="true"
        />
      )}
      <div className={styles.bgOverlay} aria-hidden="true" />

      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <a href="/" className={styles.logo} aria-label="Melodrift Home">
            <span className={styles.logoIcon}>♪</span>
            <span className={styles.logoText}>Melodrift</span>
          </a>
        </div>

        {/* Track Info */}
        <div className={styles.trackSection}>
          {/* Cover */}
          <div className={styles.coverWrapper}>
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={`${track.title} cover`}
                className={styles.coverImage}
              />
            ) : (
              <div className={styles.coverPlaceholder}>
                <span className={styles.coverIcon}>♪</span>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className={styles.trackMeta}>
            <h1 className={styles.trackTitle}>{track.title || "Untitled AI Song"}</h1>
            <p className={styles.trackPrompt}>
              {track.prompt || "AI-generated music"}
            </p>

            {/* Tags */}
            <div className={styles.tags}>
              {track.genre && track.genre !== "-1" && (
                <span className={styles.tag}>{track.genre}</span>
              )}
              {track.duration > 0 && (
                <span className={styles.tag}>
                  {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                </span>
              )}
              <span className={styles.tag}>▶ {track.play_count.toLocaleString()}</span>
            </div>

            {/* User */}
            <div className={styles.userRow}>
              {track.user.avatar_url ? (
                <img
                  src={track.user.avatar_url}
                  alt={track.user.username}
                  className={styles.avatar}
                />
              ) : (
                <div className={styles.avatarPlaceholder} />
              )}
              <span className={styles.username}>@{track.user.username}</span>
              <span className={styles.dot} aria-hidden="true">·</span>
              <span className={styles.date}>{formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Interactive Player (Client Component) */}
        <div className={styles.playerSection}>
          <SharePlayer
            audioUrl={track.audio_url}
            title={track.title || "Untitled"}
            songId={track.song_id}
            slug={track.slug}
          />
        </div>

        {/* Footer CTA */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            Create your own AI music with{" "}
            <a href="/" className={styles.footerLink}>
              Melodrift
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
