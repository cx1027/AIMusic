import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import { authedHttp } from "../lib/http";
import { getAccessToken } from "../lib/auth";
import { resolveMediaUrl } from "../lib/media";
import { ALL_GENRES, Genre, inferGenresFromPrompt } from "../lib/genres";
import { createMusicJob, getMusicJobStatus, MusicPollState } from "../api/music";

type GenState = {
  task_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message?: string;
  result?: { song_id?: string; audio_url?: string; cover_image_url?: string; output_url?: string | null; cover_image_error?: string };
};

export default function Generate() {
  const token = getAccessToken();
  const [mode, setMode] = useState<"simple" | "custom">("custom");
  const [title, setTitle] = useState("My new song");
  const [prompt, setPrompt] = useState("lofi chill beats, rainy night");
  const [sampleQuery, setSampleQuery] = useState<string>("a soft acoustic guitar ballad for a quiet evening");
  const [simpleInstrumentalOnly, setSimpleInstrumentalOnly] = useState<boolean>(false);
  const [genres, setGenres] = useState<Genre[]>(() => inferGenresFromPrompt("lofi chill beats, rainy night"));
  const [genresAuto, setGenresAuto] = useState<boolean>(true);
  const [lyrics, setLyrics] = useState<string>("");
  
  // Optional parameters
  const [thinking, setThinking] = useState<boolean>(true);
  const [audioDuration, setAudioDuration] = useState<number>(60);
  const [bpm, setBpm] = useState<number | null>(null);
  const [vocalLanguage, setVocalLanguage] = useState<string>("en");
  const [audioFormat, setAudioFormat] = useState<string>("mp3");
  const [inferenceSteps, setInferenceSteps] = useState<number>(8);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);

  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<GenState | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const audioUrl = useMemo(() => state?.result?.audio_url || state?.result?.output_url || null, [state]);
  const audioSrc = useMemo(() => resolveMediaUrl(audioUrl), [audioUrl]);
  const coverImageUrl = useMemo(() => state?.result?.cover_image_url || null, [state]);
  const coverImageSrc = useMemo(() => resolveMediaUrl(coverImageUrl), [coverImageUrl]);
  const coverImageError = useMemo(() => {
    const error = state?.result?.cover_image_error;
    if (error) {
      console.log("[Generate] Cover image error detected:", error);
    }
    return error || null;
  }, [state]);

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
        coverImageError: coverImageError,
        hasResult: !!state.result,
        resultKeys: state.result ? Object.keys(state.result) : [],
      });
    }
  }, [state, coverImageUrl, coverImageSrc, coverImageError]);

  useEffect(() => {
    if (genresAuto) {
      setGenres(inferGenresFromPrompt(prompt));
    }
  }, [prompt, genresAuto]);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

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
    
    // Validation
    if (mode === "custom" && !prompt.trim()) {
      setErr("Caption is required for custom mode");
      return;
    }
    if (mode === "custom" && !lyrics.trim()) {
      setErr("Lyrics are required for custom mode");
      return;
    }
    if (mode === "simple" && !sampleQuery.trim()) {
      setErr("Sample query is required for simple mode");
      return;
    }
    
    setErr(null);
    setState(null);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    // Send all selected genres as comma-separated string, or null if none selected
    const genreString = genres.length > 0 ? genres.join(", ") : null;
    try {
      const payload: any = {
        mode,
        title: title.trim() ? title.trim() : null,
        genre: genreString,
        thinking,
        audio_duration: audioDuration,
        vocal_language: vocalLanguage,
        audio_format: audioFormat,
        inference_steps: inferenceSteps,
        batch_size: batchSize,
      };
      
      if (mode === "simple") {
        payload.sample_query = sampleQuery.trim();
        payload.instrumental = simpleInstrumentalOnly;
      } else {
        // RunPod JSON expects `caption` for custom mode
        payload.caption = prompt.trim();
        // Required for custom mode (matches RunPod_JSON_Inputs.md)
        payload.lyrics = lyrics.trim();
      }
      
      if (bpm !== null) {
        payload.bpm = bpm;
      }

      const transport = (import.meta as any).env?.VITE_MUSIC_GEN_TRANSPORT || "sse"; // "sse" | "polling"
      if (String(transport).toLowerCase() === "polling") {
        const created = await createMusicJob(payload);
        const jobId = created.job_id;
        // Seed UI state
        setState({
          task_id: jobId,
          status: "running",
          progress: 5,
          message: "queued",
          result: undefined,
        });

        const pollOnce = async () => {
          const next = (await getMusicJobStatus(jobId)) as unknown as MusicPollState;
          setState({
            task_id: jobId,
            status: (next.status as any) || "running",
            progress: Number(next.progress ?? 0),
            message: next.message,
            result: next.result || undefined,
          });
          if (next.status === "completed" || next.status === "failed") {
            if (pollTimerRef.current) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        };

        await pollOnce();
        pollTimerRef.current = window.setInterval(() => {
          pollOnce().catch((e: any) => {
            console.error("[Generate] Poll error:", e);
          });
        }, 2000);
      } else {
        const res = await authedHttp<{ task_id: string; events_url: string }>(`/api/generate`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

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
            cover_image_error: next.result?.cover_image_error,
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
      }
    } catch (e: any) {
      setErr(e?.message || "Generate failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Generate AI Song</h1>
      <p className="mt-2 text-sm text-gray-300">
        Create your AI-generated song using Simple Mode (sample_query mode: AI infers caption/lyrics/metas) or Custom Mode (you provide prompt; lyrics optional).
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
          {/* Mode Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">Generation Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("simple")}
                className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                  mode === "simple"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-black/30 text-gray-300 hover:border-white/30"
                }`}
              >
                Simple Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                  mode === "custom"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-black/30 text-gray-300 hover:border-white/30"
                }`}
              >
                Custom Mode
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {mode === "simple"
                ? "sample_query mode: provide a natural-language description; AI will infer caption/lyrics/metas"
                : "custom mode: provide a prompt (caption). Lyrics are optional; leave blank for instrumental"}
            </p>
          </div>

          {/* Song name */}
          <div className="space-y-1">
            <label className="text-sm text-gray-200">Song name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midnight Rain"
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>

          {/* Mode-specific fields */}
          {mode === "simple" ? (
            <div className="space-y-1">
              <label className="text-sm text-gray-200">
                Sample Query (sample_query) <span className="text-red-400">*</span>
              </label>
              <textarea
                value={sampleQuery}
                onChange={(e) => setSampleQuery(e.target.value)}
                placeholder="e.g. a soft acoustic guitar ballad for a quiet evening"
                className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
              />
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="simpleInstrumentalOnly"
                  checked={simpleInstrumentalOnly}
                  onChange={(e) => setSimpleInstrumentalOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/30 text-white focus:ring-white/30"
                />
                <label htmlFor="simpleInstrumentalOnly" className="text-sm text-gray-200 cursor-pointer">
                  Instrumental only (maps to RunPod JSON simple mode)
                </label>
              </div>
              <p className="text-xs text-gray-400">
                {simpleInstrumentalOnly
                  ? "Uses JSON simple mode: server will set lyrics=[Instrumental] and treat this as a pure-instrumental prompt."
                  : "Natural language description. Uses JSON sample_query mode (LLM infers caption/lyrics/metas)."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-sm text-gray-200">
                  Caption <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Chinese hip-hop, melodic trap, male rapper with smooth R&B hooks, 808 bass, hi-hats"
                  className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-200">
                  Lyrics <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Enter your lyrics here..."
                  className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                />
                <p className="text-xs text-gray-400">Required for custom mode (matches RunPod JSON custom mode).</p>
              </div>
            </>
          )}

          {/* Genre tags */}
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

          {/* Audio Duration - between Genre tags and More Options */}
          <div className="space-y-1">
            <label className="text-sm text-gray-200">
              Audio Duration (s) <span className="text-gray-400">*</span>
            </label>
            <input
              type="number"
              min={10}
              max={600}
              value={audioDuration}
              onChange={(e) => setAudioDuration(parseInt(e.target.value || "60", 10))}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            />
            <p className="text-xs text-gray-400">10-600 seconds</p>
          </div>

          {/* More Options (expand/collapse) */}
          <div className="space-y-3 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-200 hover:text-white"
            >
              <svg
                className={`h-5 w-5 shrink-0 transition-transform ${showMoreOptions ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span>More Options</span>
            </button>

            {showMoreOptions && (
            <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-200">BPM</label>
                <input
                  type="number"
                  min={1}
                  value={bpm || ""}
                  onChange={(e) => setBpm(e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder="Auto"
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-200">Vocal Language</label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-sm text-gray-200">Audio Format</label>
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                </select>
              </div>
            </div>
            </div>
            )}

          </div>

          {err ? <div className="text-sm text-red-300">{err}</div> : null}
          <button className="w-full rounded-md bg-white px-3 py-2 text-black font-medium hover:bg-gray-100 transition-colors" onClick={start}>
            Generate AI Song
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-medium text-gray-200">Status</div>
          {!state ? (
            <div className="text-gray-400">No task yet.</div>
          ) : (
            <>
              <div className="text-sm text-gray-200">
                Status: <span className="font-semibold">{state.status}</span>
              </div>
              <div className="text-xs text-gray-300">
                Progress: <span className="font-mono">{state.progress}%</span>
                {state.message && !state.message.includes("ace-step-api") ? (
                  <span className="ml-1">
                    | {state.message}
                  </span>
                ) : null}
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                <div className="h-2 bg-white" style={{ width: `${state.progress}%` }} />
              </div>
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
              ) : state.status === "completed" && !coverImageSrc && !coverImageUrl ? (
                <div className="text-sm text-yellow-300">
                  {coverImageError ? (
                    <div>
                      <div className="font-semibold mb-1">Cover image generation failed:</div>
                      <div className="text-xs text-yellow-200 whitespace-pre-wrap">{coverImageError}</div>
                      <div className="mt-2 text-xs text-gray-400">
                        The music was generated successfully, but the cover image could not be created.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-semibold mb-1">Cover image not available</div>
                      <div className="text-xs text-yellow-200">
                        Cover image may not have been generated. This could be because:
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          <li>FLUX.1 Schnell is not installed or configured</li>
                          <li>If using Hugging Face: token is missing (set HUGGINGFACE_HUB_TOKEN)</li>
                          <li>If using RunPod: endpoint is not configured (set FLUXSCHNELL=RUNPOD, FLUX_RUNPOD_ENDPOINT_ID, and RUNPOD_API_KEY)</li>
                        </ul>
                        <div className="mt-2 text-xs text-gray-400">
                          Check backend logs for more details. The music was generated successfully.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {audioUrl ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-200">Audio</div>
                  <audio controls className="w-full" src={audioSrc ?? undefined} />
                </div>
              ) : state.status === "completed" && !audioUrl ? (
                <div className="text-sm text-yellow-300">
                  <div className="font-semibold mb-1">Audio not available</div>
                  <div className="text-xs text-yellow-200">
                    The audio file may not have been generated or uploaded successfully.
                    {state.result?.output_url && (
                      <div className="mt-1 text-xs text-gray-400">
                        Output URL: {state.result.output_url}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


