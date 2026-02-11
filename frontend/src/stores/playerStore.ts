export type PlayerState = {
  songId: string | null;
  isPlaying: boolean;
};

let state: PlayerState = { songId: null, isPlaying: false };
const listeners = new Set<() => void>();

export const playerStore = {
  getState() {
    return state;
  },
  setState(next: Partial<PlayerState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};


