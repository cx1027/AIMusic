import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../lib/media";

type PopularArtistCardProps = {
  username: string;
  avatar_url?: string | null;
  background_url?: string | null;
};

export function PopularArtistCard({ username, avatar_url, background_url }: PopularArtistCardProps) {
  const avatarSrc = avatar_url ? resolveMediaUrl(avatar_url) || avatar_url : null;
  const backgroundSrc = background_url ? resolveMediaUrl(background_url) || background_url : null;

  return (
    <Link
      to={`/profile/${encodeURIComponent(username)}`}
      className="group flex w-40 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-xs text-gray-200 shadow-sm hover:border-white/40 hover:bg-white/10 transition"
    >
      <div className="relative h-40 w-full overflow-hidden bg-slate-900">
        {backgroundSrc ? (
          <img
            src={backgroundSrc}
            alt={username}
            className="h-full w-full object-cover"
          />
        ) : avatarSrc ? (
          <img
            src={avatarSrc}
            alt={username}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-3xl font-semibold text-white/80">
            {username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2">
          <div className="line-clamp-1 text-[13px] font-semibold text-white">
            {username}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gray-300">
            Popular Artist
          </div>
        </div>
      </div>
    </Link>
  );
}

