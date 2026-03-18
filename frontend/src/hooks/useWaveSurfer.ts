import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { API_BASE } from "../lib/http";
import { getAccessToken } from "../lib/auth";

type UseWaveSurferOptions = {
  url: string | null;
};

/** Only send auth for same-origin API requests; external URLs (e.g. R2) must not get custom headers to avoid CORS preflight failure. */
function buildFetchParams(url: string): RequestInit {
  const isOurApi = url.startsWith(API_BASE);
  if (!isOurApi) return {};
  const token = getAccessToken();
  if (!token) return {};
  return {
    headers: { Authorization: `Bearer ${token}` },
  };
}

export function useWaveSurfer({ url }: UseWaveSurferOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);

  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const fetchParams = buildFetchParams(url);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4b5563",
      progressColor: "#ffffff",
      cursorColor: "#ffffff",
      barWidth: 2,
      barGap: 1,
      height: 96,
      fetchParams,
    });

    waveSurferRef.current = ws;
    setReady(false);
    setLoading(true);
    setError(null);

    ws.load(url);

    const onReady = () => {
      setReady(true);
      setLoading(false);
      setDuration(ws.getDuration() || 0);
    };

    const onError = (e: string | Error) => {
      const errorMessage = typeof e === 'string' ? e : e?.message || "Failed to load audio";
      setError(errorMessage);
      setLoading(false);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(ws.getCurrentTime() || 0);
    };

    ws.on("ready", onReady);
    ws.on("error", onError);
    ws.on("play", onPlay);
    ws.on("pause", onPause);
    ws.on("timeupdate", onTimeUpdate);

    return () => {
      ws.un("ready", onReady);
      ws.un("error", onError);
      ws.un("play", onPlay);
      ws.un("pause", onPause);
      ws.un("timeupdate", onTimeUpdate);
      try {
        ws.destroy();
      } catch (e) {
        // Ignore errors during cleanup (e.g., AbortError from aborted fetch)
        if (e instanceof Error && e.name === "AbortError") return;
        console.debug("Error during wavesurfer cleanup:", e);
      }
      waveSurferRef.current = null;
    };
  }, [url]);

  const playPause = () => {
    if (!waveSurferRef.current || !ready) return;
    waveSurferRef.current.playPause();
  };

  const seekTo = (ratio: number) => {
    if (!waveSurferRef.current || !ready) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    waveSurferRef.current.seekTo(clamped);
  };

  return {
    containerRef,
    ready,
    isPlaying,
    currentTime,
    duration,
    loading,
    error,
    playPause,
    seekTo,
  };
}

