const ACCESS_KEY = "aimusic.access_token";
const REFRESH_KEY = "aimusic.refresh_token";
const AUTH_EVENT = "aimusic:auth";

function notifyAuthChanged() {
  // Notify same-tab listeners
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeAuth(listener: () => void) {
  const onAuth = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCESS_KEY || e.key === REFRESH_KEY) listener();
  };
  window.addEventListener(AUTH_EVENT, onAuth);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_EVENT, onAuth);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  notifyAuthChanged();
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notifyAuthChanged();
}


