import { Link } from "react-router-dom";

type DiscoverSong = {
  id: string;
  user_id: string;
  username: string;
  title: string;
  audio_url?: string | null;
  duration: number;
  genre?: string | null;
  like_count: number;
  play_count: number;
  created_at: string;
};

export default function DiscoverGrid(props: { songs: DiscoverSong[] }) {
  const { songs } = props;
  if (!songs.length) {
    return <div className="text-xs text-gray-400">No songs yet.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {songs.map((s) => (
        <Link
          key={s.id}
          to={`/songs/${s.id}`}
          className="group flex flex-col justify-between rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-gray-200 hover:border-white/30 hover:bg-black/60"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate font-medium text-white group-hover:text-emerald-300">
                {s.title || "Untitled"}
              </div>
              {s.genre && (
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                  {s.genre}
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-gray-400">
              by <span className="font-medium text-gray-200">@{s.username}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
            <div className="tabular-nums">
              {Math.round(s.duration)}s · {new Date(s.created_at).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-3">
              <span>❤️ {s.like_count}</span>
              <span>▶️ {s.play_count}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}


