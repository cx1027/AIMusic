import { authHeaders, http } from "./client";

export function createGeneration(token: string, prompt: string, lyrics: string | null, duration: number) {
  return http<{ task_id: string; events_url: string }>(`/api/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ prompt, lyrics, duration })
  });
}


