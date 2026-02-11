import { Pause, Play } from "lucide-react";
import { useWaveSurfer } from "../../hooks/useWaveSurfer";

type DetailPlayerProps = {
  audioUrl: string | null | undefined;
  durationSeconds?: number;
};

export default function DetailPlayer({ audioUrl, durationSeconds }: DetailPlayerProps) {
  const {
    containerRef,
    ready,
    isPlaying,
    currentTime,
    duration,
    loading,
    error,
    playPause,
  } = useWaveSurfer({ url: audioUrl || null });

  const total = duration || durationSeconds || 0;
  const formatTime = (sec: number) => {
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={playPause}
          disabled={!audioUrl || loading || !!error}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="flex-1 text-xs text-gray-400">
          {loading && <span>Loading audio…</span>}
          {!loading && !audioUrl && <span>No audio available</span>}
          {error && <span className="text-red-400">{error}</span>}
          {!loading && !error && audioUrl && !ready && <span>Preparing waveform…</span>}
        </div>
        <div className="text-xs tabular-nums text-gray-300">
          {formatTime(currentTime)} / {formatTime(total)}
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-24 w-full rounded-lg border border-white/10 bg-black/40"
      />
    </div>
  );
}

