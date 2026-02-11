import { useMemo, useState } from "react";
import { API_BASE } from "@/lib/http";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type UploadResult = { id: string; key: string; status: string; content_type?: string | null; original_filename?: string | null };

export function FileUpload(props: { accept?: string; label?: string; onUploaded?: (r: UploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const canUpload = useMemo(() => !!file && !loading, [file, loading]);

  async function upload() {
    if (!file) return;
    setErr(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as UploadResult;
      setResult(data);
      props.onUploaded?.(data);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-100">{props.label || "Upload file"}</div>
          <div className="mt-1 text-xs text-gray-400">Uploads to private storage. You can publish a share link later.</div>
        </div>
        <Button disabled={!canUpload} onClick={upload}>
          {loading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <input
          className="block w-full text-sm text-gray-200 file:mr-4 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
          type="file"
          accept={props.accept}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? <div className="text-xs text-gray-300">Selected: {file.name}</div> : <div className="text-xs text-gray-500">No file selected.</div>}
        {err ? <div className="text-xs text-red-300">{err}</div> : null}
        {result ? <div className="text-xs text-emerald-300">Uploaded as draft. File ID: {result.id}</div> : null}
      </div>
    </div>
  );
}


