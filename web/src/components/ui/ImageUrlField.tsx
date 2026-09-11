import { useRef, useState } from "react";
import { uploadsApi } from "../../lib/uploadApi";
import { ApiError } from "../../lib/api";

interface ImageUrlFieldProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUrlField({ value, onChange }: ImageUrlFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const result = await uploadsApi.uploadImage(file);
      onChange(result.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload this image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <input
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… or upload a file from your drive"
          />
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload…"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
