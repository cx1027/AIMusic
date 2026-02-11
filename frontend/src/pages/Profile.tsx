import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FileUpload } from "@/components/files/FileUpload";

export default function Profile() {
  const [me, setMe] = useState<{ email: string; username: string; credits_balance: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((u) => setMe({ email: u.email, username: u.username, credits_balance: u.credits_balance }))
      .catch((e: any) => setErr(e?.message || "Failed to load profile"));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        {err ? <div className="text-sm text-red-300">{err}</div> : null}
        {!me ? (
          <div className="text-gray-300">Loading…</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Email:</span> <span className="text-gray-200">{me.email}</span>
            </div>
            <div>
              <span className="text-gray-400">Username:</span> <span className="text-gray-200">{me.username}</span>
            </div>
            <div>
              <span className="text-gray-400">Credits:</span> <span className="text-gray-200">{me.credits_balance}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <FileUpload accept="audio/*" label="Upload audio" />
      </div>
    </div>
  );
}


