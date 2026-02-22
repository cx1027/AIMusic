import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { getAccessToken } from "../lib/auth";

type UseWaveSurferOptions = {
  url: string | null;
};

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

    // Get auth token for fetch headers
    // Wavesurfer needs auth headers to fetch audio files that may require authentication
    const token = getAccessToken();
    const fetchParams: RequestInit = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {};

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4b5563",
      progressColor: "#ffffff",
      cursorColor: "#ffffff",
      barWidth: 2,
      barGap: 1,
      height: 96,
      responsive: true,
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

