import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import DetailPlayer from "@/components/player/DetailPlayer";
import SharePoster from "@/components/share/SharePoster";
import { getShare, type ResolvedShare } from "@/api/shares";
import { API_BASE } from "@/lib/http";

type WechatConfig = {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
};

async function loadWeChatSdk(): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as any).wx) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load WeChat JS-SDK"));
    document.head.appendChild(script);
  });
}

export default function Share() {
  const { shareId } = useParams();
  const [data, setData] = useState<ResolvedShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posterExporting, setPosterExporting] = useState(false);
  const [wechatReady, setWechatReady] = useState(false);

  const shareUrl = useMemo(() => {
    if (!shareId) return window.location.href;
    const base = window.location.origin;
    return `${base}/share/${encodeURIComponent(shareId)}`;
  }, [shareId]);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    getShare(shareId)
      .then((d) => setData(d))
      .catch((e: any) => setError(e?.message || "Failed to load share"))
      .finally(() => setLoading(false));
  }, [shareId]);

  // WeChat JS-SDK config
  useEffect(() => {
    async function setup() {
      try {
        await loadWeChatSdk();
        const cleanUrl = window.location.href.split("#")[0];
        const res = await fetch(
          `${API_BASE}/api/wechat/jsconfig?url=${encodeURIComponent(cleanUrl)}`
        );
        if (!res.ok) return;
        const cfg = (await res.json()) as WechatConfig;
        if (typeof wx === "undefined") return;
        wx.config({
          debug: false,
          appId: cfg.appId,
          timestamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"]
        });
        wx.ready(() => {
          const title = data?.file.original_filename || "Shared track from AIMusic";
          const desc = "Listen to this AI-generated track on AIMusic.";
          const imgUrl = `${window.location.origin}/favicon.ico`;
          wx.updateAppMessageShareData({
            title,
            desc,
            link: shareUrl,
            imgUrl
          });
          wx.updateTimelineShareData({
            title,
            link: shareUrl,
            imgUrl
          });
          setWechatReady(true);
        });
        wx.error(() => {
          setWechatReady(false);
        });
      } catch {
        setWechatReady(false);
      }
    }
    void setup();
    // we intentionally do not depend on `data` to avoid reconfiguring too often
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareUrl]);

  const expired = data?.expires_at ? new Date(data.expires_at) < new Date() : false;
  const revoked = !!data?.revoked_at;

  const handleExportPoster = async () => {
    const el = document.getElementById("share-poster");
    if (!el || posterExporting) return;
    setPosterExporting(true);
    try {
      const canvas = await html2canvas(el, { backgroundColor: null });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `aimusic-share-${shareId || "poster"}.png`;
      a.click();
    } finally {
      setPosterExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Shared track</h1>
      <p className="mt-2 text-sm text-gray-300 break-all">Link: {shareUrl}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-300">
        <button
          type="button"
          className="rounded-full border border-white/20 px-3 py-1 hover:bg-white/10"
          onClick={() => {
            void navigator.clipboard.writeText(shareUrl);
          }}
        >
          Copy link
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-3 py-1 hover:bg-white/10 disabled:opacity-60"
          disabled={!wechatReady}
        >
          {wechatReady ? "WeChat share ready" : "WeChat share not available"}
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-3 py-1 hover:bg-white/10 disabled:opacity-60"
          onClick={handleExportPoster}
          disabled={posterExporting}
        >
          {posterExporting ? "Exporting poster…" : "Save poster"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-800/80 p-5">
        {loading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-300">{error}</div>
        ) : !data ? (
          <div className="text-sm text-gray-400">Share not found.</div>
        ) : revoked ? (
          <div className="text-sm text-yellow-300">This share link has been revoked by the creator.</div>
        ) : expired ? (
          <div className="text-sm text-yellow-300">This share link has expired.</div>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
            <div>
              <DetailPlayer audioUrl={data.content_url} />
              <div className="mt-3 text-xs text-gray-300">
                <div>Filename: {data.file.original_filename || "Shared track"}</div>
                <div className="mt-1">
                  Expires:{" "}
                  {data.expires_at ? new Date(data.expires_at).toLocaleString() : "No expiry"}
                </div>
              </div>
            </div>
            <div>
              <SharePoster share={data} shareUrl={shareUrl} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

