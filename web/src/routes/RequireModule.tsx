import { Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

// Real enforcement, not just a hidden sidebar link — visiting a restricted page directly by URL
// lands here instead of rendering the page. Modules come from the user's own session (set at
// login from the server's real, role-derived MODULE_GROUPS — see config/roles.ts), not a
// separately-maintained frontend guess.
export function RequireModule({ module }: { module: string }) {
  const modules = useAuthStore((s) => s.user?.modules) ?? [];

  if (!modules.includes(module)) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Not available</h1>
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You don't have permission to view this page — it isn't part of what your role can access.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
