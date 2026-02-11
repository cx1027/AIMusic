import { useEffect, useMemo, useRef, useState } from "react";

export function useAudioPlayer(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const audio = useMemo(() => {
    if (!src) return null;
    const a = new Audio(src);
    audioRef.current = a;
    return a;
  }, [src]);

  useEffect(() => {
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audio]);

  return {
    audio,
    playing,
    play: () => audio?.play(),
    pause: () => audio?.pause()
  };
}


