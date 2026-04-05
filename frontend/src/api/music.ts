import { authedHttp } from "../lib/http";

export type MusicPollState = {
  task_id?: string;
  user_id?: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message?: string;
  payload?: any;
  result?: {
    runpod_job_id?: string;
    output_url?: string | null;
    song_id?: string;
    audio_url?: string;
    cover_image_url?: string | null;
    cover_image_error?: string;
  } | null;
};

export function createMusicJob(payload: any) {
  return authedHttp<{ job_id: string; runpod_job_id?: string }>(`/api/music/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMusicJobStatus(jobId: string) {
  return authedHttp<MusicPollState>(`/api/music/status/${encodeURIComponent(jobId)}`);
}

