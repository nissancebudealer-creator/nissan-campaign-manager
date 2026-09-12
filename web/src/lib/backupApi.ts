import { useAuthStore } from "../store/authStore";
import { API_BASE, ApiError } from "./api";

export interface RestoreSummary {
  table: string;
  inTotal: number;
  inserted: number;
  skippedOrFailed: number;
}

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const backupApi = {
  // Downloads the backup file directly to the browser's downloads — a plain <a href> can't carry
  // the auth header this endpoint needs, so the response is fetched and turned into a Blob URL.
  async downloadExport(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/admin/backup/export`, { headers: authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Export failed");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] ?? "campaign-manager-backup.json";

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async importBackup(file: File): Promise<{ summaries: RestoreSummary[] }> {
    const formData = new FormData();
    formData.append("backup", file);
    const res = await fetch(`${API_BASE}/api/admin/backup/import`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Import failed");
    }
    return res.json();
  },
};
