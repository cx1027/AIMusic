import { clearTokens, getAccessToken, setTokens } from "../lib/auth";

export type AuthState = {
  accessToken: string | null;
};

export const authStore = {
  getState(): AuthState {
    return { accessToken: getAccessToken() };
  },
  setTokens(access: string, refresh: string) {
    setTokens(access, refresh);
  },
  clear() {
    clearTokens();
  }
};


