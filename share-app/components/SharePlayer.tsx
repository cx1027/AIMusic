"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";
import styles from "./SharePlayer.module.css";

interface SharePlayerProps {
  audioUrl: string | null;
  title: string;
  songId: string;
  slug: string;
}

export default function SharePlayer({ audioUrl, title }: SharePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const resolvedUrl = resolveMediaUrl(audioUrl);

  useEffect(() => {
    if (!resolvedUrl || typeof window === "undefined") return;

    let wavesurfer: any = null;

    async function initWaveSurfer() {
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;

        wavesurfer = WaveSurfer.create({
          container: waveformRef.current!,
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
          if (wavesurfer.getDuration()) {
            setProgress(wavesurfer.getCurrentTime() / wavesurfer.getDuration());
          }
        });

        wavesurfer.on("seeking", (time: number) => {
          setCurrentTime(time);
        });

        wavesurfer.load(resolvedUrl);
        wavesurferRef.current = wavesurfer;
      } catch (err) {
        console.error("Failed to load WaveSurfer:", err);
        // Fallback: use native <audio> element
        setLoading(false);
        setError(null);
      }
    }

    void initWaveSurfer();

    return () => {
      if (wavesurfer) {
        wavesurfer.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [resolvedUrl]);

  const togglePlay = useCallback(() => {
    if (!wavesurferRef.current) {
      // Fallback: use native audio
      if (!audioRef.current) {
        audioRef.current = new Audio(resolvedUrl!);
        audioRef.current.addEventListener("timeupdate", () => {
          setCurrentTime(audioRef.current!.currentTime);
          if (audioRef.current!.duration) {
            setProgress(audioRef.current!.currentTime / audioRef.current!.duration);
          }
        });
        audioRef.current.addEventListener("ended", () => { setIsPlaying(false); });
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
  }, [isPlaying, resolvedUrl]);

  const handleMute = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setMuted(!muted);
    } else if (audioRef.current) {
      audioRef.current.muted = !muted;
    }
    setMuted(!muted);
  }, [muted]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(ratio);
    } else if (audioRef.current && duration) {
      audioRef.current.currentTime = ratio * duration;
      setProgress(ratio);
    }
  }, [duration]);

  const formatTime = (t: number) => {
    if (!Number.isFinite(t) || t < 0) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className={styles.player}>
      {/* Hidden native audio for fallback */}
      <audio ref={audioRef} src={resolvedUrl || undefined} preload="metadata" />

      <div className={styles.controls}>
        {/* Play/Pause */}
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

        {/* Time + Waveform */}
        <div className={styles.waveWrapper}>
          <div className={styles.timeRow}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <div
              ref={waveformRef}
              className={styles.waveform}
              onClick={handleSeek}
            />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>

          {/* Progress bar */}
          <div className={styles.progressTrack} onClick={handleSeek}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Mute */}
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

      {/* CTA */}
      <div className={styles.cta}>
        <a href="/" className={styles.ctaButton}>
          Create Your Own Music
        </a>
      </div>
    </div>
  );
}
