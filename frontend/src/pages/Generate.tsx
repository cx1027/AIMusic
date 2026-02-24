import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import { resolveMediaUrl } from "../lib/media";
import { ALL_GENRES, Genre, inferGenresFromPrompt } from "../lib/genres";

type GenState = {
  task_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message?: string;
  result?: { song_id?: string; audio_url?: string; cover_image_url?: string };
};

export default function Generate() {
  const token = getAccessToken();
  const [title, setTitle] = useState("My new song");
  const [prompt, setPrompt] = useState("lofi chill beats, rainy night");
  const [genres, setGenres] = useState<Genre[]>(() => inferGenresFromPrompt("lofi chill beats, rainy night"));
  const [genresAuto, setGenresAuto] = useState<boolean>(true);
  const [lyrics, setLyrics] = useState<string>("");
  const [duration, setDuration] = useState<number>(30);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<GenState | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const audioUrl = useMemo(() => state?.result?.audio_url || null, [state]);
  const audioSrc = useMemo(() => resolveMediaUrl(audioUrl), [audioUrl]);
  const coverImageUrl = useMemo(() => state?.result?.cover_image_url || null, [state]);
  const coverImageSrc = useMemo(() => resolveMediaUrl(coverImageUrl), [coverImageUrl]);

  // Debug logging
  useEffect(() => {
    if (state) {
      console.log("[Generate] State update:", {
        status: state.status,
        progress: state.progress,
        message: state.message,
        result: state.result,
        coverImageUrl: coverImageUrl,
        coverImageSrc: coverImageSrc,
      });
    }
  }, [state, coverImageUrl, coverImageSrc]);

  useEffect(() => {
    if (genresAuto) {
      setGenres(inferGenresFromPrompt(prompt));
    }
  }, [prompt, genresAuto]);

  function toggleGenre(g: Genre) {
    setGenresAuto(false);
    setGenres((prev) => {
      // If already selected, remove it
      if (prev.includes(g)) {
        return prev.filter((x) => x !== g);
      }
      // If newly selected, make it the primary genre (first in the list)
      return [g, ...prev.filter((x) => x !== g)];
    });
  }

  async function start() {
    if (!token) return;
    setErr(null);
    setState(null);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    // Send all selected genres as comma-separated string, or null if none selected
    const genreString = genres.length > 0 ? genres.join(", ") : null;
    try {
      const res = await api.generate(
        prompt,
        lyrics.trim() ? lyrics : null,
        duration,
        title.trim() ? title.trim() : null,
        genreString
      );
      const url = `${API_BASE}${res.events_url}?token=${encodeURIComponent(token)}`;
      // NOTE: backend uses Authorization header, but SSE can't set headers; we pass token via query and handle it server-side
      // if you don't want query tokens, switch to cookie auth.
      const es = new EventSource(url);
      esRef.current = es;
      es.addEventListener("progress", (e: MessageEvent) => {
        const next = JSON.parse(e.data) as GenState;
        console.log("[Generate] SSE progress event:", {
          status: next.status,
          progress: next.progress,
          message: next.message,
          result: next.result,
        });
        setState(next);
        if (next.status === "completed" || next.status === "failed") {
          console.log("[Generate] Task completed/failed, closing SSE connection");
          es.close();
          esRef.current = null;
        }
      });
      es.addEventListener("error", () => {
        setErr("SSE connection error");
      });
    } catch (e: any) {
      setErr(e?.message || "Generate failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Generate</h1>
      <p className="mt-2 text-sm text-gray-300">Create a generation task and watch progress via SSE.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="space-y-1">
            <label className="text-sm text-gray-200">Song name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midnight Rain"
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-200">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-200">Genre tags</label>
              <span className="text-xs text-gray-400">
                {genresAuto ? "Auto from prompt – click to adjust" : "Manual – click to toggle"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((g) => {
                const active = genres.includes(g);
                return (
                  <span
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={
                      "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs transition-colors " +
                      (active
                        ? "border-white bg-white text-black"
                        : "border-white/20 bg-black/30 text-gray-300")
                    }
                    aria-pressed={active}
                  >
                    {g}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-200">Lyrics (optional)</label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-200">Duration</label>
            <input
              type="number"
              min={1}
              max={300}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value || "30", 10))}
              className="w-28 rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          {err ? <div className="text-sm text-red-300">{err}</div> : null}
          <button className="w-full rounded-md bg-white px-3 py-2 text-black" onClick={start}>
            Start generation
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-gray-300">Status</div>
          {!state ? (
            <div className="text-gray-400">No task yet.</div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-200">{state.status}</div>
                <div className="text-gray-300">{state.progress}%</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                <div className="h-2 bg-white" style={{ width: `${state.progress}%` }} />
              </div>
              <div className="text-sm text-gray-300">{state.message}</div>
              <div className="space-y-1 pt-2">
                <div className="text-sm text-gray-200">Genres</div>
                <div className="flex flex-wrap gap-2">
                  {genres.length === 0 ? (
                    <span className="text-xs text-gray-400">None selected</span>
                  ) : (
                    genres.map((g) => (
                      <span
                        key={g}
                        className="inline-flex items-center rounded-full border border-white/30 bg-black/40 px-2 py-0.5 text-xs text-gray-100"
                      >
                        {g}
                      </span>
                    ))
                  )}
                </div>
              </div>
              {coverImageSrc ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-200">Cover Image</div>
                  <div className="flex justify-center">
                    <img
                      src={coverImageSrc}
                      alt="Generated cover"
                      className="max-w-full rounded-lg border border-white/10"
                      style={{ maxHeight: "400px" }}
                      onLoad={() => console.log("[Generate] Cover image loaded successfully:", coverImageSrc)}
                      onError={(e) => {
                        console.error("[Generate] Cover image failed to load:", coverImageSrc, e);
                        console.error("[Generate] Image error details:", {
                          coverImageUrl,
                          coverImageSrc,
                          result: state.result,
                        });
                      }}
                    />
                  </div>
                </div>
              ) : state.status === "completed" && !coverImageSrc ? (
                <div className="text-sm text-yellow-300">
                  Cover image not available (may not be generated or FLUX.1 Schnell not installed)
                </div>
              ) : null}
              {audioUrl ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-200">Audio</div>
                  <audio controls className="w-full" src={audioSrc ?? undefined} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


