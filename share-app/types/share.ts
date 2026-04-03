export interface ShareUserInfo {
  username: string;
  avatar_url: string | null;
}

export interface TrackShareData {
  slug: string;
  song_id: string;
  title: string;
  prompt: string;
  o3ics: string | null;
  audio_url: string | null;
  cover_image_url: string | null;
  duration: number;
  genre: string | null;
  bpm: number | null;
  play_count: number;
  like_count: number;
  created_at: string;
  user: ShareUserInfo;
  is_revoked: boolean;
}
