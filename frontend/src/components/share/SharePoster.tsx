import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { ResolvedShare } from "@/api/shares";

type Props = {
  share: ResolvedShare;
  shareUrl: string;
};

export default function SharePoster(props: Props) {
  const { share, shareUrl } = props;
  const expiresLabel = share.expires_at ? new Date(share.expires_at).toLocaleString() : "No expiry";
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareUrl, { width: 256, margin: 1 }, (err, url) => {
      if (err || cancelled) return;
      setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  return (
    <div
      id="share-poster"
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-700/60 via-fuchsia-600/60 to-indigo-700/60 p-4 text-white shadow-xl"
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
      <div className="relative space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-wide">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          AIMusic Share
        </div>
        <div>
          <div className="text-xs text-white/70">Track</div>
          <div className="truncate text-lg font-semibold">
            {share.file.original_filename || "Shared track from AIMusic"}
          </div>
        </div>
        <div className="rounded-xl bg-black/25 p-3 text-xs text-white/80">
          <div className="flex items-center justify-between">
            <span className="text-white/60">Share ID</span>
            <span className="font-mono text-[11px]">{share.slug}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-white/60">Expires</span>
            <span>{expiresLabel}</span>
          </div>
        </div>
        <p className="text-xs text-white/80">
          Scan the QR code to open this track on mobile, or share the link with friends.
        </p>
        <div className="mt-2 flex justify-center">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Share QR"
              className="h-32 w-32 rounded-lg bg-white p-1"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white/10 text-[11px] text-white/80">
              Generating QR…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

