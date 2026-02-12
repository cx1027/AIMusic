import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";

type Song = {
  id: string;
  title: string;
  audio_url?: string | null;
  created_at: string;
  is_public: boolean;
};

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; email: string; credits_balance: number } | null>(null);
  const [profileUser, setProfileUser] = useState<{ id: string; username: string; avatar_url?: string | null; subscription_tier: string; created_at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [publicSongs, setPublicSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = currentUser && profileUser && currentUser.id === profileUser.id;

  // Load current user and profile data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErr(null);
      
      try {
        // Always try to get current user (if authenticated)
        const me = await api.me();
        setCurrentUser({
          id: me.id,
          username: me.username,
          email: me.email,
          credits_balance: me.credits_balance,
        });

        // If no username in URL, redirect to own profile
        if (!username) {
          navigate(`/profile/${me.username}`, { replace: true });
          return;
        }

        // If viewing own profile
        if (me.username === username) {
          setProfileUser({
            id: me.id,
            username: me.username,
            subscription_tier: "free",
            created_at: new Date().toISOString(),
          });
          setEmailValue(me.email);
          setUsernameValue(me.username);
          setLoading(false);
        } else {
          // Viewing someone else's profile
          try {
            const user = await api.getUserByUsername(username);
            setProfileUser(user);
            setLoading(false);
          } catch (e: any) {
            setErr(e?.message || "User not found");
            setLoading(false);
          }
        }
      } catch (e: any) {
        // Not authenticated - can still view other users' profiles
        if (username) {
          try {
            const user = await api.getUserByUsername(username);
            setProfileUser(user);
            setLoading(false);
          } catch (err: any) {
            setErr(err?.message || "User not found");
            setLoading(false);
          }
        } else {
          setErr("Please log in to view your profile");
          setLoading(false);
        }
      }
    };

    loadData();
  }, [username, navigate]);

  // Load songs
  useEffect(() => {
    if (!profileUser) return;
    
    setSongsLoading(true);
    if (isOwnProfile && currentUser) {
      // For own profile, get all songs and filter for public ones
      api
        .listSongs()
        .then((songs) => {
          const publicSongsList = songs.filter((s) => s.is_public);
          setPublicSongs(publicSongsList);
        })
        .catch((e: any) => setErr(e?.message || "Failed to load songs"))
        .finally(() => setSongsLoading(false));
    } else {
      // For other users, get their public songs
      api
        .getPublicSongsByUser(profileUser.id)
        .then((songs: any) => {
          setPublicSongs(songs);
        })
        .catch((e: any) => {
          setErr(e?.message || "Failed to load songs");
        })
        .finally(() => setSongsLoading(false));
    }
  }, [profileUser, isOwnProfile, currentUser]);

  const handleSaveEmail = async () => {
    if (!currentUser || !isOwnProfile || emailValue === currentUser.email) {
      setEditingEmail(false);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.updateUser({ email: emailValue });
      setCurrentUser({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        credits_balance: updated.credits_balance,
      });
      setProfileUser({
        id: updated.id,
        username: updated.username,
        subscription_tier: "free",
        created_at: new Date().toISOString(),
      });
      setEditingEmail(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to update email");
      if (currentUser) setEmailValue(currentUser.email);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!currentUser || !isOwnProfile || usernameValue === currentUser.username) {
      setEditingUsername(false);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.updateUser({ username: usernameValue });
      setCurrentUser({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        credits_balance: updated.credits_balance,
      });
      setProfileUser({
        id: updated.id,
        username: updated.username,
        subscription_tier: "free",
        created_at: new Date().toISOString(),
      });
      // Redirect to new username
      navigate(`/profile/${updated.username}`, { replace: true });
      setEditingUsername(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to update username");
      if (currentUser) setUsernameValue(currentUser.username);
    } finally {
      setSaving(false);
    }
  };

  const handlePlaySong = (song: Song) => {
    if (!song.audio_url) return;
    const url = resolveMediaUrl(song.audio_url);
    if (!url) return;
    playerStore.setQueue(
      [
        {
          id: song.id,
          title: song.title,
          audioUrl: url
        }
      ],
      0
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-gray-300">Loading…</div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
          {err ? <div className="text-sm text-red-300">{err}</div> : <div className="text-gray-300">User not found</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Profile{isOwnProfile ? "" : `: @${profileUser.username}`}</h1>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        {err ? <div className="mb-4 text-sm text-red-300">{err}</div> : null}
        <div className="space-y-4 text-sm">
          {isOwnProfile && currentUser ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                {editingEmail ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveEmail}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-white/20 bg-black/40 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                      onClick={() => {
                        setEmailValue(currentUser.email);
                        setEditingEmail(false);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-200">{currentUser.email}</span>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-200 underline"
                      onClick={() => setEditingEmail(true)}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                {editingUsername ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                      value={usernameValue}
                      onChange={(e) => setUsernameValue(e.target.value)}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveUsername}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-white/20 bg-black/40 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                      onClick={() => {
                        setUsernameValue(currentUser.username);
                        setEditingUsername(false);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-200">{profileUser.username}</span>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-200 underline"
                      onClick={() => setEditingUsername(true)}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
              <div>
                <span className="text-gray-400">Credits:</span>{" "}
                <span className="text-gray-200">{currentUser.credits_balance}</span>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
              <span className="text-gray-200">@{profileUser.username}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Public Songs</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          {songsLoading ? (
            <div className="text-gray-300">Loading…</div>
          ) : publicSongs.length === 0 ? (
            <div className="text-gray-400">No public songs yet.</div>
          ) : (
            <div className="grid gap-3">
              {publicSongs.map((song) => (
                <div
                  key={song.id}
                  className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/songs/${song.id}`} className="truncate text-gray-100 hover:underline">
                        {song.title}
                      </Link>
                      <div className="mt-1 text-xs text-gray-400">{new Date(song.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {song.audio_url ? (
                        <button
                          type="button"
                          className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white hover:border-pink-400 hover:text-pink-200"
                          onClick={() => handlePlaySong(song)}
                        >
                          Play
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500">No audio</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
