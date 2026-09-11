import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import type { AdminRole } from "../../types";

export function RolesTab() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listRoles().then((r) => {
      setRoles(r.roles);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <p className="text-sm text-slate-600">
        What each role can actually do right now, computed live from the same route guards every
        API request goes through — not a separate settings table that could quietly drift out of
        sync with real enforcement. Roles can't be created or renamed here; they're a fixed part of
        the app's design (see ARCHITECTURE.md).
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{role.name}</h3>
                  {role.description && <p className="text-xs text-slate-500">{role.description}</p>}
                </div>
                <span className="text-xs text-slate-500">
                  {role.userCount} user{role.userCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {role.grants.length === 0 && (
                  <span className="text-xs text-slate-400">No write/delete/admin access — read-only.</span>
                )}
                {role.grants.map((grant) => (
                  <span
                    key={grant}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                  >
                    {grant}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
