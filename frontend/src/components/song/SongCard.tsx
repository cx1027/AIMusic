import { Link } from "react-router-dom";
import { ReactNode } from "react";
import { resolveMediaUrl } from "../../lib/media";

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
      ? `space-y-2 rounded-lg border p-3 ${playingClasses}`
      : `flex items-center justify-between py-2 px-2 rounded-md ${playingClasses}`;

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
            <div className="flex-shrink-0">
              <img
                src={coverImageSrc}
                alt={`Cover for ${song.title || "Untitled"}`}
                className="h-16 w-16 rounded-md object-cover"
              />
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
          <div className={`flex items-center ${variant === "card" ? "gap-3" : "gap-2"} text-xs`}>
            {showPlayButton && (
              <>
                {song.audio_url ? (
                  <button
                    type="button"
                    className={`rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white ${
                      variant === "card" ? "hover:border-pink-400 hover:text-pink-200" : "hover:border-emerald-400 hover:text-emerald-200"
                    }`}
                    onClick={onPlay}
                  >
                    {playButtonText || (isPlaying ? "Playing" : "Play")}
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
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  song.liked_by_me
                    ? "border-pink-400/60 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20"
                    : "border-white/20 bg-black/40 text-gray-200 hover:border-pink-400 hover:text-pink-200"
                }`}
              >
                {isLoading ? "..." : song.liked_by_me ? "❤️" : "🤍"} {song.like_count ?? 0}
              </button>
            )}
            {showVisibilityToggle && (
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  song.is_public
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-white/20 bg-black/40 text-gray-200 hover:border-emerald-400 hover:text-emerald-200"
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
          <div className="flex items-center gap-3">
            {showPlayButton && (
              <>
                {song.audio_url ? (
                  <button
                    type="button"
                    className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white hover:border-pink-400 hover:text-pink-200"
                    onClick={onPlay}
                  >
                    {playButtonText || (isPlaying ? "Playing" : "Play")}
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
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  song.liked_by_me
                    ? "border-pink-400/60 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20"
                    : "border-white/20 bg-black/40 text-gray-200 hover:border-pink-400 hover:text-pink-200"
                }`}
              >
                {isLoading ? "..." : song.liked_by_me ? "❤️" : "🤍"} {song.like_count ?? 0}
              </button>
            )}
            {showVisibilityToggle && (
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  song.is_public
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-white/20 bg-black/40 text-gray-200 hover:border-emerald-400 hover:text-emerald-200"
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
