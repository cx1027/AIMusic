import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Heart, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../lib/media";
import { playerStore } from "../../stores/playerStore";

type DiscoverSong = {
  id: string;
  user_id: string;
  username: string;
  title: string;
  prompt: string;
  audio_url?: string | null;
  cover_image_url?: string | null;
  duration: number;
  genre?: string | null;
  bpm?: number | null;
  is_public: boolean;
  play_count: number;
  like_count: number;
  created_at: string;
  liked_by_me: boolean;
};

type DiscoverSongCardProps = {
  song: DiscoverSong;
  displayGenre: string | null;
  isPlaying?: boolean;
  onPlay?: () => void;
  onLike?: () => void;
  onSelect?: () => void;
  isLiking?: boolean;
  additionalActions?: ReactNode;
  footer?: ReactNode;
};

export function DiscoverSongCard({
  song,
  displayGenre,
  isPlaying = false,
  onPlay,
  onLike,
  onSelect,
  isLiking = false,
  additionalActions,
  footer,
}: DiscoverSongCardProps) {
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/songs/${encodeURIComponent(song.id)}` : "";
  const coverImageSrc = song.cover_image_url ? resolveMediaUrl(song.cover_image_url) : null;

  // Close share menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isShareMenuOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (shareButtonRef.current?.contains(target)) return;
      if (shareMenuRef.current?.contains(target)) return;

      setIsShareMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsShareMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isShareMenuOpen]);

  return (
    <div className="group relative flex w-full flex-col rounded-xl bg-gradient-to-b from-white/5 to-black/60 text-xs text-gray-200 shadow-sm hover:from-white/10 hover:shadow-lg transition">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className="relative block w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-black"
        aria-label={`Open ${song.title || "song"}`}
      >
        <div className="relative mx-auto w-full max-w-[220px] group/cover">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-slate-800">
            {coverImageSrc ? (
              <img
                src={coverImageSrc}
                alt={song.title || "Song cover"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-400">
                No cover
              </div>
            )}
            {onPlay && song.audio_url && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPlaying) {
                    playerStore.pause();
                  } else {
                    onPlay();
                  }
                }}
                className="absolute inset-0 focus:outline-none"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-within/cover:opacity-100">
                  <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                    {isPlaying ? (
                      <Pause className="h-5 w-5 text-white fill-white" />
                    ) : (
                      <Play className="h-5 w-5 text-white fill-white" />
                    )}
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onSelect}
            className="line-clamp-1 w-full text-left text-[13px] font-semibold text-white hover:underline"
          >
            {song.title || "Untitled"}
          </button>
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <Link
              to={`/profile/${encodeURIComponent(song.username)}`}
              className="line-clamp-1 hover:text-white hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{song.username}
            </Link>
            {displayGenre && (
              <span className="line-clamp-1 rounded-full border border-white/15 px-2 py-[2px] text-[10px] uppercase tracking-wide text-gray-200">
                {displayGenre}
              </span>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-3 text-xs">
          {song.audio_url ? (
            <button
              type="button"
              onClick={() => onPlay?.()}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ${
                isPlaying ? "bg-white/20 text-white" : "bg-transparent text-gray-300 hover:bg-white/10"
              }`}
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
              <span>{song.play_count}</span>
            </button>
          ) : (
            <div className="text-[11px] text-gray-500">No audio</div>
          )}

          <button
            type="button"
            onClick={onLike}
            disabled={isLiking}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
              song.liked_by_me ? "bg-white/20 text-white" : "bg-transparent text-gray-300 hover:bg-white/10"
            }`}
          >
            {isLiking ? (
              <>
                <Heart className="h-3 w-3 text-white fill-white animate-pulse" aria-hidden="true" />
                <span className="sr-only">Liking…</span>
              </>
            ) : (
              <>
                <Heart
                  className={`h-3 w-3 ${
                    song.liked_by_me ? "fill-white text-white" : "text-gray-300"
                  }`}
                  aria-hidden="true"
                />
                <span>{song.like_count}</span>
              </>
            )}
          </button>

          {additionalActions}

          <button
            type="button"
            ref={shareButtonRef}
            className={`ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
              isShareMenuOpen ? "bg-white/20 text-white" : "bg-transparent text-gray-300 hover:bg-white/10"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isShareMenuOpen && shareButtonRef.current) {
                const rect = shareButtonRef.current.getBoundingClientRect();
                const MENU_WIDTH = 224; // w-56
                const PADDING = 8;
                const maxLeft = window.innerWidth - MENU_WIDTH - PADDING;
                const idealLeft = rect.right - MENU_WIDTH;
                const left = Math.max(PADDING, Math.min(maxLeft, idealLeft));
                const top = rect.bottom + PADDING;
                setShareMenuPosition({ top, left });
              }
              setIsShareMenuOpen((open) => !open);
            }}
          >
            <Share2 className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Share</span>
          </button>
          {isShareMenuOpen &&
            shareMenuPosition &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                ref={shareMenuRef}
                style={{
                  position: "fixed",
                  top: shareMenuPosition.top,
                  left: shareMenuPosition.left,
                  zIndex: 50,
                }}
                className="w-56 rounded-md border border-white/10 bg-slate-900/95 p-2 text-xs shadow-lg"
              >
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
            </div>,
            document.body
          )}
        </div>

        {footer}
      </div>
    </div>
  );
}

