import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.register(email, username, password);
      nav("/login");
    } catch (e: any) {
      setErr(e?.message || "Register failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Create Account</h1>
      <p className="mt-2 text-sm text-gray-300">
        Join our AI music generation platform. Start creating and sharing AI songs today.{" "}
        <Link className="underline" to="/login">
          Already have an account? Login
        </Link>
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="space-y-1">
          <label className="text-sm text-gray-200">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-200">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            placeholder="your name"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-200">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
            placeholder="••••••••"
          />
        </div>
        {err ? <div className="text-sm text-red-300">{err}</div> : null}
        <button
          disabled={loading}
          className="w-full rounded-md bg-white px-3 py-2 text-black disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}


