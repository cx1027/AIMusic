import { useMemo, useState } from "react";
import { API_BASE } from "@/lib/http";
import type { PublishShareResponse } from "@/api/shares";

type Props = {
  open: boolean;
  onOpenChange(open: boolean): void;
  fileObjectId: string | null;
};

export default function ShareModal({ open, onOpenChange, fileObjectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<PublishShareResponse | null>(null);

  const shareUrl = useMemo(() => {
    if (!share?.slug) return "";
    const base = window.location.origin;
    return `${base}/share/${encodeURIComponent(share.slug)}`;
  }, [share]);

  async function publish() {
    if (!fileObjectId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/shares/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_object_id: fileObjectId })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PublishShareResponse;
      setShare(data);
    } catch (e: any) {
      setError(e?.message || "Failed to publish share");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-5 text-sm text-white shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Share track</h2>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-200"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
        <div className="mt-3 text-xs text-gray-300">
          Generate a private share link. The audio stays on our servers; people with the link can only stream it.
        </div>

        <div className="mt-4 space-y-3">
          {!share ? (
            <button
              type="button"
              disabled={!fileObjectId || loading}
              onClick={publish}
              className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-xs font-medium text-black disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {loading ? "Publishing…" : "Create share link"}
            </button>
          ) : (
            <>
              <div className="text-xs text-gray-300">Share link</div>
              <div className="flex items-center gap-2 rounded-md bg-black/40 px-3 py-2">
                <input
                  className="flex-1 bg-transparent text-xs text-white outline-none"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="text-[11px] font-medium text-blue-300 hover:text-blue-100"
                  onClick={() => {
                    if (!shareUrl) return;
                    void navigator.clipboard.writeText(shareUrl);
                  }}
                >
                  Copy
                </button>
              </div>
            </>
          )}

          {error ? <div className="text-xs text-red-300">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

