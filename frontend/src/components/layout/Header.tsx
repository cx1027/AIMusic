import { useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearTokens, getAccessToken, subscribeAuth } from "../../lib/auth";

export default function Header() {
  const nav = useNavigate();
  const token = useSyncExternalStore(subscribeAuth, getAccessToken, () => null);
  return (
    <div className="border-b border-white/10 bg-black/20">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          AI Music
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-200">
          <Link className="hover:text-white" to="/generate">
            Generate
          </Link>
          <Link className="hover:text-white" to="/library">
            Library
          </Link>
          <Link className="hover:text-white" to="/playlists">
            Playlists
          </Link>
          <Link className="hover:text-white" to="/discover">
            Discover
          </Link>
          <Link className="hover:text-white" to="/pricing">
            Pricing
          </Link>
          {!token ? (
            <>
              <Link className="hover:text-white" to="/login">
                Login
              </Link>
              <Link className="hover:text-white" to="/register">
                Register
              </Link>
            </>
          ) : (
            <>
              <Link className="hover:text-white" to="/profile">
                Profile
              </Link>
              <button
                className="rounded-md border border-white/15 px-3 py-1 hover:bg-white/10"
                onClick={() => {
                  clearTokens();
                  nav("/login");
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


