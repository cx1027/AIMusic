import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import SongCard from "../components/song/SongCard";
import SongDetailSidebar from "../components/song/SongDetailSidebar";

type Song = {
  id: string;
  title: string;
  audio_url?: string | null;
  created_at: string;
  is_public: boolean;
  play_count?: number;
  like_count?: number;
  liked_by_me?: boolean;
};

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    email: string;
    credits_balance: number;
    details?: string | null;
    avatar_url?: string | null;
    background_url?: string | null;
    followers_count?: number;
    following_count?: number;
  } | null>(null);
  const [profileUser, setProfileUser] = useState<{
    id: string;
    username: string;
    avatar_url?: string | null;
    background_url?: string | null;
    details?: string | null;
    subscription_tier: string;
    created_at: string;
    followers_count?: number;
    following_count?: number;
    is_following?: boolean | null;
    is_me?: boolean | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [detailsValue, setDetailsValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [publicSongs, setPublicSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [totalLikes, setTotalLikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowList, setShowFollowList] = useState<null | "followers" | "following">(null);
  const [followers, setFollowers] = useState<
    Array<{ id: string; username: string; avatar_url?: string | null; details?: string | null }>
  >([]);
  const [following, setFollowing] = useState<
    Array<{ id: string; username: string; avatar_url?: string | null; details?: string | null }>
  >([]);
  const [followListLoading, setFollowListLoading] = useState(false);

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
          avatar_url: me.avatar_url || null,
          background_url: me.background_url || null,
          details: me.details || null,
          followers_count: me.followers_count,
          following_count: me.following_count,
        });

        // If no username in URL, redirect to own profile
        if (!username) {
          navigate(`/profile/${me.username}`, { replace: true });
          return;
        }

        // If viewing own profile
        if (me.username === username) {
          // For own profile, enrich with server-side profile data (including followers/following)
          try {
            const profile = await api.getUserByUsername(me.username);
            setProfileUser(profile);
          } catch {
            setProfileUser({
              id: me.id,
              username: me.username,
              avatar_url: me.avatar_url || null,
              background_url: me.background_url || null,
              details: me.details || null,
              subscription_tier: "free",
              created_at: new Date().toISOString(),
              followers_count: me.followers_count,
              following_count: me.following_count,
            });
          }
          setEmailValue(me.email);
          setUsernameValue(me.username);
          setDetailsValue(me.details || "");
          setLoading(false);
        } else {
          // Viewing someone else's profile
          try {
            const userProfile = await api.getUserByUsername(username);
            setProfileUser(userProfile);
            setIsFollowing(userProfile.is_following ?? null);
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
            const userProfile = await api.getUserByUsername(username);
            setProfileUser(userProfile);
            setIsFollowing(userProfile.is_following ?? null);
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
          const likesSum = publicSongsList.reduce(
            (sum, s) => sum + (s.like_count ?? 0),
            0
          );
          setTotalLikes(likesSum);
        })
        .catch((e: any) => setErr(e?.message || "Failed to load songs"))
        .finally(() => setSongsLoading(false));
    } else {
      // For other users, get their public songs
      api
        .getPublicSongsByUser(profileUser.id)
        .then((songs: any) => {
          setPublicSongs(songs);
          const likesSum = (songs as Song[]).reduce(
            (sum, s) => sum + (s.like_count ?? 0),
            0
          );
          setTotalLikes(likesSum);
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
        details: updated.details || null,
      });
      setProfileUser({
        id: updated.id,
        username: updated.username,
        details: updated.details || null,
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
        details: updated.details || null,
      });
      setProfileUser({
        id: updated.id,
        username: updated.username,
        details: updated.details || null,
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

  const handleSaveDetails = async () => {
    if (!currentUser || !isOwnProfile) {
      setEditingDetails(false);
      return;
    }
    const currentDetails = currentUser.details || "";
    if (detailsValue === currentDetails) {
      setEditingDetails(false);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.updateUser({ details: detailsValue || null });
      setCurrentUser({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        credits_balance: updated.credits_balance,
        details: updated.details || null,
      });
      setProfileUser({
        id: updated.id,
        username: updated.username,
        details: updated.details || null,
        subscription_tier: "free",
        created_at: new Date().toISOString(),
      });
      setEditingDetails(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to update details");
      if (currentUser) setDetailsValue(currentUser.details || "");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    if (!currentUser || !isOwnProfile) return;
    setErr(null);
    setUploadingAvatar(true);
    try {
      const res = await api.uploadAvatar(file);
      const avatarUrl = res.avatar_url;
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              avatar_url: avatarUrl,
            }
          : prev
      );
      setProfileUser((prev) =>
        prev
          ? {
              ...prev,
              avatar_url: avatarUrl,
            }
          : prev
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBackgroundChange = async (file: File) => {
    if (!currentUser || !isOwnProfile) return;
    setErr(null);
    setUploadingBackground(true);
    try {
      const res = await api.uploadBackground(file);
      const bgUrl = res.background_url;
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              background_url: bgUrl,
            }
          : prev
      );
      setProfileUser((prev) =>
        prev
          ? {
              ...prev,
              background_url: bgUrl,
            }
          : prev
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to upload background");
    } finally {
      setUploadingBackground(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!currentUser || !profileUser || isOwnProfile) return;

    setFollowLoading(true);
    setErr(null);

    try {
      if (isFollowing) {
        await api.unfollowUser(profileUser.id);
        setIsFollowing(false);
        setProfileUser((prev) =>
          prev
            ? {
                ...prev,
                followers_count: Math.max((prev.followers_count ?? 1) - 1, 0),
              }
            : prev
        );
      } else {
        await api.followUser(profileUser.id);
        setIsFollowing(true);
        setProfileUser((prev) =>
          prev
            ? {
                ...prev,
                followers_count: (prev.followers_count ?? 0) + 1,
              }
            : prev
        );
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleOpenFollowList = async (type: "followers" | "following") => {
    if (!profileUser) return;
    setShowFollowList(type);
    setFollowListLoading(true);
    setErr(null);
    try {
      if (type === "followers") {
        const data = await api.getFollowers(profileUser.id);
        setFollowers(data);
      } else {
        const data = await api.getFollowing(profileUser.id);
        setFollowing(data);
      }
    } catch (e: any) {
      setErr(e?.message || `Failed to load ${type}`);
    } finally {
      setFollowListLoading(false);
    }
  };

  const handlePlaySong = (song: Song) => {
    if (!song.audio_url) return;
    const url = resolveMediaUrl(song.audio_url);
    if (!url) return;

    // Optimistically bump play count
    setPublicSongs((prev) =>
      prev.map((s) =>
        s.id === song.id
          ? {
              ...s,
              play_count: (s.play_count ?? 0) + 1,
            }
          : s
      )
    );

    // Persist to backend (best-effort)
    void api
      .incrementPlayCount(song.id)
      .catch(() => {
        // ignore errors
      });

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
    <>
    <div className={`mx-auto px-4 py-10 transition-all ${selectedSongId ? 'max-w-4xl' : 'max-w-5xl'}`}>
      {/* Profile header with background and avatar */}
      <div className="rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-r from-purple-700/60 via-indigo-700/60 to-slate-900/80">
        <div
          className="h-32 sm:h-40 w-full bg-cover bg-center"
          style={
            profileUser.background_url
              ? { backgroundImage: `url(${resolveMediaUrl(profileUser.background_url) || profileUser.background_url})` }
              : { backgroundImage: "linear-gradient(135deg, rgba(129, 140, 248, 0.4), rgba(236, 72, 153, 0.4))" }
          }
        />
        <div className="px-5 pb-5 flex flex-col gap-4 sm:flex-row sm:items-end -mt-10">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-slate-950/80 bg-slate-900/80 overflow-hidden shadow-lg">
              {profileUser.avatar_url ? (
                <img
                  src={resolveMediaUrl(profileUser.avatar_url) || profileUser.avatar_url}
                  alt={profileUser.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-2xl font-semibold bg-slate-800 text-white/80">
                  {profileUser.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {isOwnProfile && (
              <>
                <label className="absolute -bottom-2 right-0 cursor-pointer rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-gray-200 border border-white/20 hover:bg-black">
                  {uploadingAvatar ? "Uploading…" : "Change"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleAvatarChange(file);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                {isOwnProfile ? "Your Profile" : `@${profileUser.username}`}
              </h1>
              <p className="mt-1 text-xs text-gray-300">
                Joined {new Date(profileUser.created_at).toLocaleDateString()}
              </p>
              <div className="mt-3 flex gap-4 text-xs text-gray-200">
                <button
                  type="button"
                  className="text-left hover:text-white transition"
                  onClick={() => void handleOpenFollowList("followers")}
                >
                  <span className="font-semibold">
                    {profileUser.followers_count ?? 0}
                  </span>{" "}
                  <span className="text-gray-300">Followers</span>
                </button>
                <button
                  type="button"
                  className="text-left hover:text-white transition"
                  onClick={() => void handleOpenFollowList("following")}
                >
                  <span className="font-semibold">
                    {profileUser.following_count ?? 0}
                  </span>{" "}
                  <span className="text-gray-300">Following</span>
                </button>
                <div className="text-left">
                  <span className="font-semibold">
                    {totalLikes}
                  </span>{" "}
                  <span className="text-gray-300">Likes</span>
                </div>
              </div>
            </div>
            {currentUser && !isOwnProfile && (
              <div className="flex items-center sm:mb-1">
                <button
                  type="button"
                  onClick={() => void handleToggleFollow()}
                  disabled={followLoading}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium border transition ${
                    isFollowing
                      ? "border-white/40 bg-white/15 text-white hover:bg-white/25"
                      : "border-white/30 bg-white/10 text-white hover:bg-white/20"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {followLoading
                    ? "Updating…"
                    : isFollowing
                    ? "Following"
                    : "Follow"}
                </button>
              </div>
            )}
            {isOwnProfile && (
              <div className="flex flex-col items-start gap-2 sm:items-end sm:mb-1">
                <label className="cursor-pointer rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white border border-white/20 hover:bg-white/20">
                  {uploadingBackground ? "Uploading…" : "Change background"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingBackground}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleBackgroundChange(file);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

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
                <label className="block text-xs font-medium text-gray-400 mb-1">Details</label>
                {editingDetails ? (
                  <div className="flex items-start gap-2">
                    <textarea
                      className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30 min-h-[80px] resize-y"
                      value={detailsValue}
                      onChange={(e) => setDetailsValue(e.target.value)}
                      disabled={saving}
                      placeholder="Tell us about yourself..."
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleSaveDetails}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/20 bg-black/40 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                        onClick={() => {
                          setDetailsValue(currentUser.details || "");
                          setEditingDetails(false);
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-200 whitespace-pre-wrap flex-1">
                      {profileUser.details || "No details provided"}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-200 underline"
                      onClick={() => setEditingDetails(true)}
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
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                <span className="text-gray-200">@{profileUser.username}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Details</label>
                <span className="text-gray-200 whitespace-pre-wrap">
                  {profileUser.details || "No details provided"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Public AI Songs</h2>
        <div className={`rounded-xl border border-white/10 bg-white/5 p-5 transition-all ${selectedSongId ? 'max-w-3xl' : ''}`}>
          {songsLoading ? (
            <div className="text-gray-300">Loading…</div>
          ) : publicSongs.length === 0 ? (
            <div className="text-gray-400">No public AI songs shared yet.</div>
          ) : (
            <div className="grid gap-3">
              {publicSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  variant="card"
                  showPlayButton={true}
                  showDate={true}
                  onSelect={() => setSelectedSongId(song.id)}
                  onPlay={() => handlePlaySong(song)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    <SongDetailSidebar
      songId={selectedSongId}
      onClose={() => setSelectedSongId(null)}
      onLikeChange={({ songId, liked, like_count }) => {
      setPublicSongs((prev) => {
        const next = prev.map((s) =>
          s.id === songId
            ? {
                ...s,
                liked_by_me: liked,
                like_count,
              }
            : s
        );
        const likesSum = next.reduce(
          (sum, s) => sum + (s.like_count ?? 0),
          0
        );
        setTotalLikes(likesSum);
        return next;
      });
      }}
    />
    {showFollowList && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">
              {showFollowList === "followers" ? "Followers" : "Following"}
            </h2>
            <button
              type="button"
              className="text-xs text-gray-300 hover:text-white"
              onClick={() => setShowFollowList(null)}
            >
              Close
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto px-4 py-3 text-sm">
            {followListLoading ? (
              <div className="text-gray-300">Loading…</div>
            ) : showFollowList === "followers" ? (
              followers.length === 0 ? (
                <div className="text-gray-400">No followers yet.</div>
              ) : (
                <ul className="space-y-2">
                  {followers.map((u) => (
                    <li key={u.id}>
                      <Link
                        to={`/profile/${encodeURIComponent(u.username)}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5"
                        onClick={() => setShowFollowList(null)}
                      >
                        <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-white/80 overflow-hidden">
                          {u.avatar_url ? (
                            <img
                              src={resolveMediaUrl(u.avatar_url) || u.avatar_url}
                              alt={u.username}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            u.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-white text-xs">@{u.username}</div>
                          {u.details && (
                            <div className="truncate text-[11px] text-gray-400">
                              {u.details}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : following.length === 0 ? (
              <div className="text-gray-400">Not following anyone yet.</div>
            ) : (
              <ul className="space-y-2">
                {following.map((u) => (
                  <li key={u.id}>
                    <Link
                      to={`/profile/${encodeURIComponent(u.username)}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5"
                      onClick={() => setShowFollowList(null)}
                    >
                      <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-white/80 overflow-hidden">
                        {u.avatar_url ? (
                          <img
                            src={resolveMediaUrl(u.avatar_url) || u.avatar_url}
                            alt={u.username}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          u.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-white text-xs">@{u.username}</div>
                        {u.details && (
                          <div className="truncate text-[11px] text-gray-400">
                            {u.details}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
