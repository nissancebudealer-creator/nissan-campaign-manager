import { useAuthStore } from "../store/authStore";
import { API_BASE, ApiError } from "./api";

export const uploadsApi = {
  async uploadImage(file: File): Promise<{ url: string }> {
    const token = useAuthStore.getState().token;
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    // No Content-Type set here — the browser fills in multipart/form-data with the correct
    // boundary itself; setting it manually breaks multer's parsing.

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(`${API_BASE}/api/uploads/image`, { method: "POST", headers, body: formData });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? "Upload failed");
    }
    return res.json();
  },
};
