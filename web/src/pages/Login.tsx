import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useBrandingStore } from "../store/brandingStore";
import type { AuthResponse } from "../types";

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const { companyName, logoUrl } = useBrandingStore();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login" ? { email, password } : { email, password, firstName, lastName };
      const result = await api.post<AuthResponse>(path, body);
      setAuth(result);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {logoUrl && <img src={logoUrl} alt="" className="mb-4 h-10 w-10 rounded object-contain" />}
        <h1 className="text-lg font-semibold text-slate-900">
          {mode === "login" ? "Sign in" : "Create the first account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{companyName || "Campaign Manager"}</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          {mode === "register" && (
            <div className="flex gap-3">
              <input
                className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <input
                className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          )}
          <input
            type="email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 text-sm text-slate-500 hover:text-slate-700"
        >
          {mode === "login"
            ? "First time setting this up? Create the admin account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
