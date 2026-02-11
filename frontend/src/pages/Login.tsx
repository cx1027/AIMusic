import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setTokens } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setTokens(res.access_token, res.refresh_token);
      const from = (location.state as any)?.from?.pathname || "/generate";
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-gray-300">
        No account?{" "}
        <Link className="underline" to="/register">
          Register
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
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}


