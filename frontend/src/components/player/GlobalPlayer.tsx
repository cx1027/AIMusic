import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { playerStore, type PlayerState, type QueueItem } from "../../stores/playerStore";

type LocalState = PlayerState & {
  currentItem: QueueItem | null;
};

export default function GlobalPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<LocalState>(() => {
    const s = playerStore.getState();
    return {
      ...s,
      currentItem: s.currentIndex >= 0 ? s.queue[s.currentIndex] ?? null : null
    };
  });
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const unsub = playerStore.subscribe(() => {
      const s = playerStore.getState();
      setState({
        ...s,
        currentItem: s.currentIndex >= 0 ? s.queue[s.currentIndex] ?? null : null
      });
    });
    return unsub;
  }, []);

  // Sync audio element source & playback with store
  useEffect(() => {
    const item = state.currentItem;
    if (!audioRef.current) return;

    if (!item) {
      audioRef.current.pause();
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const audio = audioRef.current;
    if (audio.src !== item.audioUrl) {
      audio.src = item.audioUrl;
      audio.load();
    }
    audio.volume = state.volume;

    if (state.isPlaying) {
      void audio.play().catch(() => {
        // Autoplay might be blocked; keep isPlaying=false in UI
        playerStore.pause();
      });
    } else {
      audio.pause();
    }
  }, [state.currentItem, state.isPlaying, state.volume]);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
    if (audio.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
  };

  const handleEnded = () => {
    playerStore.next();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    audio.currentTime = clamped * duration;
    setProgress(clamped);
    setCurrentTime(audio.currentTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    playerStore.setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const handleClose = () => {
    playerStore.setQueue([]);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  };

  if (!state.currentItem) {
    return null;
  }

  const formatTime = (t: number) => {
    if (!Number.isFinite(t) || t < 0) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="sticky bottom-0 z-30 border-t border-white/10 bg-black/80 backdrop-blur relative">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClose}
        className="absolute right-4 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/40 text-gray-300 hover:border-white/60 hover:text-white"
        aria-label="Close player"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm text-gray-100">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs uppercase tracking-wide text-gray-400">
            Now playing
          </div>
          <div className="truncate text-sm font-medium">{state.currentItem.title}</div>
          <div
            className="mt-2 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-pink-400"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/40 text-xs hover:border-white/60"
            onClick={() => playerStore.prev()}
            aria-label="Previous"
          >
            {"<<"}
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-medium text-black hover:bg-gray-100"
            onClick={() => (state.isPlaying ? playerStore.pause() : playerStore.play())}
            aria-label={state.isPlaying ? "Pause" : "Play"}
          >
            {state.isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/40 text-xs hover:border-white/60"
            onClick={() => playerStore.next()}
            aria-label="Next"
          >
            {">>"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            onChange={handleVolumeChange}
            className="h-1 w-24 accent-pink-400"
          />
        </div>
      </div>
    </div>
  );
}

