import { Link } from "react-router-dom";
import { ReactNode, useState } from "react";
import { Play, Pause, Heart, Share2 } from "lucide-react";
import { resolveMediaUrl } from "../../lib/media";
import { playerStore } from "../../stores/playerStore";

type BaseSong = {
  id: string;
  title: string;
  audio_url?: string | null;
  cover_image_url?: string | null;
  created_at: string;
};

type SongCardProps = {
  song: BaseSong & {
    username?: string;
    genre?: string | null;
    is_public?: boolean;
    like_count?: number;
    liked_by_me?: boolean;
  };
  variant?: "card" | "list";
  isPlaying?: boolean;
  showPlayButton?: boolean;
  showLikeButton?: boolean;
  showVisibilityToggle?: boolean;
  showUsername?: boolean;
  showGenre?: boolean;
  showDate?: boolean;
  onPlay?: () => void;
  onLike?: () => void;
  onToggleVisibility?: () => void;
  onSelect?: () => void;
  isLoading?: boolean;
  isUpdatingVisibility?: boolean;
  playButtonText?: string;
  useLink?: boolean; // Use Link instead of button for title
  linkTo?: string; // Custom link destination
  additionalActions?: ReactNode; // Additional action buttons to render
  footer?: ReactNode; // Additional content to render below main card content
};

export default function SongCard({
  song,
  variant = "card",
  isPlaying = false,
  showPlayButton = true,
  showLikeButton = false,
  showVisibilityToggle = false,
  showUsername = false,
  showGenre = false,
  showDate = true,
  onPlay,
  onLike,
  onToggleVisibility,
  onSelect,
  isLoading = false,
  isUpdatingVisibility = false,
  playButtonText,
  useLink = false,
  linkTo,
  additionalActions,
  footer,
}: SongCardProps) {
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/songs/${encodeURIComponent(song.id)}` : "";
  const coverImageSrc = song.cover_image_url ? resolveMediaUrl(song.cover_image_url) : null;
  const playingClasses = isPlaying
    ? variant === "card"
      ? "border-pink-400/60 bg-pink-500/10"
      : "bg-pink-500/10 border border-pink-400/60"
    : variant === "card"
    ? "border-white/10 bg-black/20"
    : "";

  const containerClasses =
    variant === "card"
      ? `group space-y-2 rounded-lg border p-3 ${playingClasses}`
      : `group flex items-center justify-between py-2 px-2 rounded-md ${playingClasses}`;

  const titleElement = useLink ? (
    <Link
      to={linkTo || `/songs/${song.id}`}
      className={`${
        variant === "card" ? "text-gray-100" : "text-sm font-medium"
      } truncate hover:underline ${
        variant === "list" ? "text-left block w-full" : ""
      }`}
    >
      {song.title || "Untitled"}
    </Link>
  ) : (
    <button
      onClick={onSelect}
      className={`${
        variant === "card" ? "text-gray-100" : "text-sm font-medium"
      } truncate text-left hover:underline cursor-pointer ${
        variant === "list" ? "block w-full" : ""
      }`}
    >
      {song.title || "Untitled"}
    </button>
  );

  const content = (
    <>
      {variant === "card" ? (
        <div className="flex items-center justify-between gap-3">
          {coverImageSrc && (
            <div className="relative flex-shrink-0">
              {onPlay && song.audio_url ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) {
                      playerStore.pause();
                    } else {
                      onPlay();
                    }
                  }}
                  className="relative h-16 w-16 rounded-md overflow-hidden transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  <img
                    src={coverImageSrc}
                    alt={`Cover for ${song.title || "Untitled"}`}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                      {isPlaying ? (
                        <Pause className="h-5 w-5 text-white fill-white" />
                      ) : (
                        <Play className="h-5 w-5 text-white fill-white" />
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <img
                  src={coverImageSrc}
                  alt={`Cover for ${song.title || "Untitled"}`}
                  className="h-16 w-16 rounded-md object-cover"
                />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {titleElement}
            {showUsername && song.username && (
              <div className="mt-1 text-xs text-gray-400">
                by{" "}
                <Link
                  to={`/profile/${song.username}`}
                  className="font-medium text-gray-200 hover:text-white hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{song.username}
                </Link>
                {showGenre && (
                  <>
                    {" "}
                    · {song.genre ? <span className="uppercase">{song.genre}</span> : "No genre"}
                  </>
                )}
              </div>
            )}
            {showDate && (
              <div className={`text-xs text-gray-400 ${showUsername ? "mt-0.5" : "mt-1"}`}>
                {variant === "card" && showUsername
                  ? new Date(song.created_at).toLocaleString()
                  : variant === "list"
                  ? `Added: ${new Date(song.created_at).toLocaleString()}`
                  : new Date(song.created_at).toLocaleString()}
              </div>
            )}
          </div>
          <div className={`relative flex items-center ${variant === "card" ? "gap-3" : "gap-2"} text-xs`}>
            {showPlayButton && (
              <>
                {song.audio_url ? (
                  <button
                    type="button"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                      isPlaying
                        ? "bg-white/20 text-white"
                        : "bg-transparent text-gray-300 hover:bg-white/10"
                    }`}
                    onClick={() => {
                      if (isPlaying) {
                        playerStore.pause();
                      } else {
                        onPlay?.();
                      }
                    }}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 translate-x-[1px]" aria-hidden="true" />
                        <span className="sr-only">Play</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-[11px] text-gray-500">No audio</div>
                )}
              </>
            )}
            {showLikeButton && (
              <button
                type="button"
                disabled={isLoading}
                onClick={onLike}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  song.liked_by_me
                    ? "bg-white/20 text-white"
                    : "bg-transparent text-gray-300 hover:bg-white/10"
                }`}
              >
                {isLoading ? (
                  <>
                    <Heart className="h-3 w-3 text-white fill-white animate-pulse" aria-hidden="true" />
                    <span className="sr-only">Liking…</span>
                  </>
                ) : (
                  <>
                    <Heart
                      className="h-3 w-3 text-white fill-white"
                      aria-hidden="true"
                    />
                    <span>{song.like_count ?? 0}</span>
                  </>
                )}
              </button>
            )}
            {showVisibilityToggle && (
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] transition ${
                  song.is_public
                    ? "bg-white/20 text-white"
                    : "bg-transparent text-gray-300 hover:bg-white/10"
                }`}
                disabled={isUpdatingVisibility}
                onClick={onToggleVisibility}
              >
                {isUpdatingVisibility
                  ? "Updating…"
                  : song.is_public
                  ? "Public"
                  : "Private"}
              </button>
            )}
            {additionalActions}
            <button
              type="button"
              className={`ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                isShareMenuOpen
                  ? "bg-white/20 text-white"
                  : "bg-transparent text-gray-300 hover:bg-white/10"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setIsShareMenuOpen((open) => !open);
              }}
            >
              <Share2 className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Share</span>
            </button>
            {isShareMenuOpen && (
              <div className="absolute right-0 top-9 z-20 w-52 rounded-md border border-white/10 bg-slate-900/95 p-2 text-xs shadow-lg">
                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Share track
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    void navigator.clipboard.writeText(shareUrl);
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Copy link</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    // Use Facebook's sharer.php endpoint with URL parameter
                    // Facebook will scrape the page for Open Graph tags (og:image, og:title, etc.)
                    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to Facebook</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    const url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
                      shareUrl
                    )}&text=${encodeURIComponent(song.title || "Check out this track")}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to X</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    const url = `https://www.reddit.com/submit?url=${encodeURIComponent(
                      shareUrl
                    )}&title=${encodeURIComponent(song.title || "AIMusic track")}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to Reddit</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    void navigator.clipboard.writeText(shareUrl);
                    window.alert("Link copied. Share it in WeChat.");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to WeChat</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            {titleElement}
            {showDate && (
              <div className="text-xs text-gray-400">
                Added: {new Date(song.created_at).toLocaleString()}
              </div>
            )}
          </div>
          <div className="relative flex items-center gap-3">
            {showPlayButton && (
              <>
                {song.audio_url ? (
                  <button
                    type="button"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                      isPlaying
                        ? "bg-white/20 text-white"
                        : "bg-transparent text-gray-300 hover:bg-white/10"
                    }`}
                    onClick={() => {
                      if (isPlaying) {
                        playerStore.pause();
                      } else {
                        onPlay?.();
                      }
                    }}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 translate-x-[1px]" aria-hidden="true" />
                        <span className="sr-only">Play</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-xs text-gray-500">No audio</div>
                )}
              </>
            )}
            {showLikeButton && (
              <button
                type="button"
                disabled={isLoading}
                onClick={onLike}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  song.liked_by_me
                    ? "bg-white/20 text-white"
                    : "bg-transparent text-gray-300 hover:bg-white/10"
                }`}
              >
                {isLoading ? (
                  <>
                    <Heart className="h-3 w-3 text-white fill-white animate-pulse" aria-hidden="true" />
                    <span className="sr-only">Liking…</span>
                  </>
                ) : (
                  <>
                    <Heart
                      className="h-3 w-3 text-white fill-white"
                      aria-hidden="true"
                    />
                    <span>{song.like_count ?? 0}</span>
                  </>
                )}
              </button>
            )}
            {showVisibilityToggle && (
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] transition ${
                  song.is_public
                    ? "bg-white/20 text-white"
                    : "bg-transparent text-gray-300 hover:bg-white/10"
                }`}
                disabled={isUpdatingVisibility}
                onClick={onToggleVisibility}
              >
                {isUpdatingVisibility
                  ? "Updating…"
                  : song.is_public
                  ? "Public"
                  : "Private"}
              </button>
            )}
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                isShareMenuOpen
                  ? "bg-white/20 text-white"
                  : "bg-transparent text-gray-300 hover:bg-white/10"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setIsShareMenuOpen((open) => !open);
              }}
            >
              <Share2 className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Share</span>
            </button>
            {isShareMenuOpen && (
              <div className="absolute right-0 top-9 z-20 w-52 rounded-md border border-white/10 bg-slate-900/95 p-2 text-xs shadow-lg">
                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Share track
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    void navigator.clipboard.writeText(shareUrl);
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Copy link</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    // Use Facebook's sharer.php endpoint with URL parameter
                    // Facebook will scrape the page for Open Graph tags (og:image, og:title, etc.)
                    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to Facebook</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    const url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
                      shareUrl
                    )}&text=${encodeURIComponent(song.title || "Check out this track")}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to X</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    const url = `https://www.reddit.com/submit?url=${encodeURIComponent(
                      shareUrl
                    )}&title=${encodeURIComponent(song.title || "AIMusic track")}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to Reddit</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10"
                  onClick={() => {
                    if (!shareUrl) return;
                    void navigator.clipboard.writeText(shareUrl);
                    window.alert("Link copied. Share it in WeChat.");
                    setIsShareMenuOpen(false);
                  }}
                >
                  <span>Share to WeChat</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  if (variant === "list") {
    return <li className={containerClasses}>{content}</li>;
  }

  return (
    <div className={containerClasses}>
      {content}
      {footer}
    </div>
  );
}
