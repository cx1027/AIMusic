import { http } from "./client";

export function register(email: string, username: string, password: string) {
  return http<{ id: string; email: string; username: string }>(`/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({ email, username, password })
  });
}

export function login(email: string, password: string) {
  return http<{ access_token: string; refresh_token: string; token_type: string }>(`/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}


