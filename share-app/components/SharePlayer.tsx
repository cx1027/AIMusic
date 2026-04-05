"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";
import { APP_URL } from "@/lib/site";
import styles from "./SharePlayer.module.css";

interface SharePlayerProps {
  audioUrl: string | null;
  title: string;
  songId: string;
  slug: string;
}

/** Downsample decoded audio to one merged (max L/R) envelope so WaveSurfer draws a single row. */
async function computeMonoPeaks(
  audioUrl: string,
  barCount = 800
): Promise<{ peaks: Float32Array; duration: number }> {
  const res = await fetch(audioUrl, { mode: "cors" });
  if (!res.ok) throw new Error(`fetch audio failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audioBuf = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const duration = audioBuf.duration;
    const len = audioBuf.length;
    const nCh = audioBuf.numberOfChannels;
    const ch0 = audioBuf.getChannelData(0);
    const ch1 = nCh > 1 ? audioBuf.getChannelData(1) : null;
    const peaks = new Float32Array(barCount);
    const samplesPerBar = len / barCount;
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * samplesPerBar);
      const end = Math.min(Math.floor((i + 1) * samplesPerBar), len);
      let max = 0;
      for (let s = start; s < end; s++) {
        let v = Math.abs(ch0[s]);
        if (ch1) v = Math.max(v, Math.abs(ch1[s]));
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return { peaks, duration };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export default function SharePlayer({ audioUrl, title }: SharePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const resolvedUrl = resolveMediaUrl(audioUrl);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const instanceRef: { current: any } = { current: null };

    async function initWaveSurfer() {
      const resolved = resolveMediaUrl(audioUrl);
      if (!resolved) return;
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;

        let peaks: Float32Array;
        let dur: number;
        try {
          const out = await computeMonoPeaks(resolved);
          peaks = out.peaks;
          dur = out.duration;
        } catch (e) {
          console.warn("[SharePlayer] mono peaks failed, falling back to decode in WaveSurfer:", e);
          peaks = new Float32Array(0);
          dur = 0;
        }

        if (cancelled || !waveformRef.current) return;

        const wavesurfer = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "rgba(255,255,255,0.2)",
          progressColor: "#ec4899",
          cursorColor: "rgba(255,255,255,0.5)",
          barWidth: 2,
          barRadius: 2,
          cursorWidth: 1,
          height: 56,
          normalize: true,
          backend: "WebAudio",
        });

        wavesurfer.on("ready", () => {
          if (cancelled) return;
          setLoading(false);
          setDuration(wavesurfer.getDuration());
        });

        wavesurfer.on("error", (err: any) => {
          console.error("WaveSurfer error:", err);
          setError("Failed to load audio");
          setLoading(false);
        });

        wavesurfer.on("play", () => setIsPlaying(true));
        wavesurfer.on("pause", () => setIsPlaying(false));
        wavesurfer.on("finish", () => setIsPlaying(false));

        wavesurfer.on("audioprocess", (time: number) => {
          setCurrentTime(time);
        });

        wavesurfer.on("seeking", (time: number) => {
          setCurrentTime(time);
        });

        instanceRef.current = wavesurfer;

        if (peaks.length > 0 && dur > 0) {
          await wavesurfer.load(resolved, [peaks], dur);
        } else {
          await wavesurfer.load(resolved);
        }

        if (cancelled) {
          wavesurfer.destroy();
          instanceRef.current = null;
          wavesurferRef.current = null;
          return;
        }
        wavesurferRef.current = wavesurfer;
      } catch (err) {
        console.error("Failed to load WaveSurfer:", err);
        setLoading(false);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load audio (often blocked by CORS on R2 — allow your share domain in bucket CORS)."
        );
      }
    }

    void initWaveSurfer();

    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
      wavesurferRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    if (!wavesurferRef.current) {
      const resolved = resolveMediaUrl(audioUrl);
      if (!audioRef.current) {
        if (!resolved) return;
        audioRef.current = new Audio(resolved);
        audioRef.current.addEventListener("timeupdate", () => {
          setCurrentTime(audioRef.current!.currentTime);
        });
        audioRef.current.addEventListener("ended", () => {
          setIsPlaying(false);
        });
        audioRef.current.addEventListener("loadedmetadata", () => {
          setDuration(audioRef.current!.duration);
          setLoading(false);
        });
      }
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
      return;
    }
    wavesurferRef.current.playPause();
  }, [isPlaying, audioUrl]);

  const handleMute = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setMuted(!muted);
    } else if (audioRef.current) {
      audioRef.current.muted = !muted;
    }
    setMuted(!muted);
  }, [muted]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!waveformRef.current) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (wavesurferRef.current) {
        wavesurferRef.current.seekTo(ratio);
      } else if (audioRef.current && duration) {
        audioRef.current.currentTime = ratio * duration;
      }
    },
    [duration]
  );

  const formatTime = (t: number) => {
    if (!Number.isFinite(t) || t < 0) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className={styles.player}>
      <audio ref={audioRef} preload="none" />

      <div className={styles.controls}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!resolvedUrl || loading}
          className={styles.playButton}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {loading ? (
            <span className={styles.spinner} />
          ) : isPlaying ? (
            <Pause className={styles.icon} />
          ) : (
            <Play className={styles.icon} />
          )}
        </button>

        <div className={styles.waveWrapper}>
          <div className={styles.timeRow}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <div ref={waveformRef} className={styles.waveform} onClick={handleSeek} />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleMute}
          className={styles.muteButton}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className={styles.iconSmall} /> : <Volume2 className={styles.iconSmall} />}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {!loading && !resolvedUrl && (
        <p className={styles.noAudio}>No audio available for this track.</p>
      )}

      <div className={styles.cta}>
        <a href={APP_URL} className={styles.ctaButton}>
          Create Your Own Music
        </a>
      </div>
    </div>
  );
}
