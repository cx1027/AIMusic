import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";

type SongRow = { id: string; title: string; audio_url?: string | null; created_at: string };

export default function Library() {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest" | "popular">("newest");

  useEffect(() => {
    setLoading(true);
    api
      .listSongs({
        q: q || undefined,
        genre: genre || undefined,
        order
      })
      .then(setSongs)
      .catch((e: any) => setErr(e?.message || "Failed to load songs"))
      .finally(() => setLoading(false));
  }, [q, genre, order]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="mt-2 text-sm text-gray-300">Your generated songs.</p>
        </div>
        <Link className="rounded-md bg-white px-3 py-2 text-sm text-black" to="/generate">
          Generate new
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 border-b border-white/5 pb-4 text-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400">Search</label>
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                placeholder="Search by title or prompt…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="w-full md:w-40">
              <label className="block text-xs font-medium text-gray-400">Genre</label>
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                placeholder="e.g. pop, rock"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full md:w-40">
            <label className="block text-xs font-medium text-gray-400">Sort by</label>
            <select
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
              value={order}
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="popular">Most played</option>
            </select>
          </div>
        </div>

        {loading ? <div className="text-gray-300">Loading…</div> : null}
        {err ? <div className="text-sm text-red-300">{err}</div> : null}
        {!loading && !err && songs.length === 0 ? <div className="text-gray-400">No songs yet.</div> : null}

        <div className="mt-4 grid gap-3">
          {songs.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="min-w-0">
                <Link to={`/songs/${s.id}`} className="truncate text-gray-100 hover:underline">
                  {s.title}
                </Link>
                <div className="mt-1 text-xs text-gray-400">{new Date(s.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-3">
                {s.audio_url ? (
                  <audio controls src={resolveMediaUrl(s.audio_url) ?? undefined} />
                ) : (
                  <div className="text-xs text-gray-500">No audio</div>
                )}
                <button
                  className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deletingId === s.id}
                  onClick={async () => {
                    setErr(null);
                    const ok = window.confirm(`Delete "${s.title}"? This can't be undone.`);
                    if (!ok) return;
                    try {
                      setDeletingId(s.id);
                      await api.deleteSong(s.id);
                      setSongs((prev) => prev.filter((x) => x.id !== s.id));
                    } catch (e: any) {
                      setErr(e?.message || "Failed to delete song");
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  {deletingId === s.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


