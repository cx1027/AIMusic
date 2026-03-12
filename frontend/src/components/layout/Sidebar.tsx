import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSyncExternalStore } from "react";
import { clearTokens, getAccessToken, subscribeAuth } from "../../lib/auth";
import { api } from "../../lib/api";

interface SidebarProps {
  width: number;
  onWidthChange: (value: number) => void;
}

export default function Sidebar({ width, onWidthChange }: SidebarProps) {
  const nav = useNavigate();
  const location = useLocation();
  const token = useSyncExternalStore(subscribeAuth, getAccessToken, () => null);
  const [username, setUsername] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (token) {
      api
        .me()
        .then((u) => setUsername(u.username))
        .catch(() => setUsername(null));
    } else {
      setUsername(null);
    }
  }, [token]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragging) return;
      const newWidth = Math.min(Math.max(event.clientX, 200), 360);
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      if (dragging) {
        setDragging(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, onWidthChange]);

  const navItems = [
    { path: "/discover", label: "Discover" },
    { path: "/generate", label: "Generate" },
    { path: "/library", label: "Library" },
    { path: "/playlists", label: "Playlists" },
  ];

  const authItems = token
    ? [
        { path: username ? `/profile/${username}` : "/profile", label: "Profile" },
      ]
    : [
        { path: "/login", label: "Login" },
        { path: "/register", label: "Register" },
      ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div
      className="fixed left-0 top-0 z-50 h-screen select-none border-r border-white/10 bg-black/40 px-4 py-6"
      style={{ width }}
    >
      <Link to="/generate" className="mb-8 block font-semibold tracking-tight">
        AI Music · Generate & Share
      </Link>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              isActive(item.path)
                ? "bg-white/10 text-white"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}

        <div className="my-3 border-t border-white/10" />

        {authItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              isActive(item.path)
                ? "bg-white/10 text-white"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}

        {token && (
          <button
            className="rounded-md px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            onClick={() => {
              clearTokens();
              nav("/login");
            }}
          >
            Logout
          </button>
        )}
      </nav>

      <div
        className="absolute right-0 top-0 bottom-0 cursor-col-resize bg-white/0 hover:bg-white/10"
        style={{ width: 4 }}
        onMouseDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
      />
    </div>
  );
}
