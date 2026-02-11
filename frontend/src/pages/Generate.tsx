import { useMemo, useRef, useState } from "react";
import { api, API_BASE } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type GenState = {
  task_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message?: string;
  result?: { song_id?: string; audio_url?: string };
};

export default function Generate() {
  const token = getAccessToken();
  const [prompt, setPrompt] = useState("lofi chill beats, rainy night");
  const [lyrics, setLyrics] = useState<string>("");
  const [duration, setDuration] = useState<number>(30);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<GenState | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const audioUrl = useMemo(() => state?.result?.audio_url || null, [state]);

  async function start() {
    if (!token) return;
    setErr(null);
    setState(null);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    try {
      const res = await api.generate(prompt, lyrics.trim() ? lyrics : null, duration);
      const url = `${API_BASE}${res.events_url}?token=${encodeURIComponent(token)}`;
      // NOTE: backend uses Authorization header, but SSE can't set headers; we pass token via query and handle it server-side
      // if you don't want query tokens, switch to cookie auth.
      const es = new EventSource(url);
      esRef.current = es;
      es.addEventListener("progress", (e: MessageEvent) => {
        const next = JSON.parse(e.data) as GenState;
        setState(next);
        if (next.status === "completed" || next.status === "failed") {
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
            <label className="text-sm text-gray-200">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
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
              {audioUrl ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-200">Audio</div>
                  <audio controls className="w-full" src={audioUrl} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


