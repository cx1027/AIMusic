export type Song = {
  id: string;
  title: string;
  audio_url?: string | null;
  created_at: string;
};

let songs: Song[] = [];
const listeners = new Set<() => void>();

export const songStore = {
  getState() {
    return { songs };
  },
  setSongs(next: Song[]) {
    songs = next;
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};


