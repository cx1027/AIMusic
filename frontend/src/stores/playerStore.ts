export type QueueItem = {
  id: string;
  title: string;
  audioUrl: string;
};

export type PlayerState = {
  queue: QueueItem[];
  currentIndex: number; // -1 means nothing selected
  isPlaying: boolean;
  volume: number; // 0-1
};

let state: PlayerState = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  volume: 1
};
const listeners = new Set<() => void>();

export const playerStore = {
  getState() {
    return state;
  },
  setState(next: Partial<PlayerState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  /**
   * Replace the current queue and optionally start from a given index.
   */
  setQueue(queue: QueueItem[], startIndex = 0) {
    if (!queue.length) {
      state = { queue: [], currentIndex: -1, isPlaying: false, volume: state.volume };
    } else {
      const idx = Math.min(Math.max(startIndex, 0), queue.length - 1);
      state = {
        ...state,
        queue,
        currentIndex: idx,
        isPlaying: true
      };
    }
    listeners.forEach((l) => l());
  },
  play() {
    if (!state.queue.length) return;
    state = { ...state, isPlaying: true };
    listeners.forEach((l) => l());
  },
  pause() {
    state = { ...state, isPlaying: false };
    listeners.forEach((l) => l());
  },
  next() {
    if (!state.queue.length) return;
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.queue.length) {
      // stop at end
      state = { ...state, isPlaying: false };
    } else {
      state = { ...state, currentIndex: nextIndex, isPlaying: true };
    }
    listeners.forEach((l) => l());
  },
  prev() {
    if (!state.queue.length) return;
    const prevIndex = state.currentIndex - 1;
    if (prevIndex < 0) {
      state = { ...state, currentIndex: 0 };
    } else {
      state = { ...state, currentIndex: prevIndex, isPlaying: true };
    }
    listeners.forEach((l) => l());
  },
  setVolume(volume: number) {
    const clamped = Math.min(Math.max(volume, 0), 1);
    state = { ...state, volume: clamped };
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};


