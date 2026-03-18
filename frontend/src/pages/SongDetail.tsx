import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DetailPlayer from "../components/player/DetailPlayer";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";

type SongDetailData = {
  id: string;
  title: string;
  prompt: string;
  lyrics?: string | null;
  audio_url?: string | null;
  cover_image_url?: string | null;
  duration: number;
  genre?: string | null;
  bpm?: number | null;
  is_public: boolean;
  play_count: number;
  like_count: number;
  liked_by_me?: boolean;
  created_at: string;
};

export default function SongDetail() {
  const { songId } = useParams();
  const [song, setSong] = useState<SongDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    if (!songId) return;
    setLoading(true);
    setError(null);
    api
      .getSong(songId)
      .then(setSong)
      .catch((e: any) => {
        setError(e?.message || "Failed to load song");
      })
      .finally(() => setLoading(false));
  }, [songId]);

  // Update Open Graph meta tags for Facebook sharing
  useEffect(() => {
    if (!song) {
      // Reset to defaults when no song
      document.title = "AI Music";
      return;
    }

    const shareUrl = `${window.location.origin}/songs/${song.id}`;
    const coverImageUrl = song.cover_image_url ? resolveMediaUrl(song.cover_image_url) : null;
    const description = song.prompt || `Listen to this AI-generated song "${song.title}" on AI Music - AI Songs Generation & Sharing Platform`;

    // Update document title
    document.title = `${song.title} - AI Music`;

    // Helper function to update or create meta tag
    const updateMetaTag = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Update Open Graph tags
    updateMetaTag("og:title", song.title);
    updateMetaTag("og:description", description);
    updateMetaTag("og:url", shareUrl);
    updateMetaTag("og:type", "music.song");
    if (coverImageUrl) {
      updateMetaTag("og:image", coverImageUrl);
      updateMetaTag("og:image:width", "1200");
      updateMetaTag("og:image:height", "630");
    }

    // Also update standard meta tags for better compatibility
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    // Cleanup function to reset meta tags when component unmounts or song changes
    return () => {
      document.title = "AI Music";
    };
  }, [song]);

  const handleToggleLike = () => {
    if (!song || likeLoading) return;
    setLikeLoading(true);
    api
      .toggleLikeSong(song.id)
      .then((res) => {
        setSong((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            like_count: res.like_count,
            // backend puts this on response as `liked`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...( { liked_by_me: res.liked } as any)
          };
        });
      })
      .catch((e: any) => {
        setError(e?.message || "Failed to like song");
      })
      .finally(() => setLikeLoading(false));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {loading && <div className="text-gray-300">Loading…</div>}
      {error && !loading && <div className="text-sm text-red-400">{error}</div>}

      {!loading && !error && song && (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">AI Song</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">{song.title}</h1>
              <p className="mt-2 text-sm text-gray-300">
                Generated at {new Date(song.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <div>
                <div className="font-medium text-gray-200">Plays</div>
                <div className="mt-1 tabular-nums">{song.play_count}</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-200">Likes</div>
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    disabled={likeLoading}
                    className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    {likeLoading
                      ? "…"
                      : // @ts-expect-error backend may return liked_by_me
                        song.liked_by_me
                      ? "Liked"
                      : "Like"}
                  </button>
                </div>
                <div className="mt-1 tabular-nums">{song.like_count}</div>
              </div>
              {song.bpm != null && (
                <div>
                  <div className="font-medium text-gray-200">BPM</div>
                  <div className="mt-1 tabular-nums">{song.bpm}</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
            <DetailPlayer audioUrl={song.audio_url} durationSeconds={song.duration} />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
              <h2 className="text-sm font-semibold text-white">Prompt</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-200">{song.prompt}</p>
            </div>
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
              <h2 className="text-sm font-semibold text-white">Lyrics</h2>
              {song.lyrics ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                  {song.lyrics}
                </pre>
              ) : (
                <p className="text-sm text-gray-400">No lyrics provided.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

