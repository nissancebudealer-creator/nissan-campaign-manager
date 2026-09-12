import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import type { AdminRole } from "../../types";

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  contacts: "Contacts",
  segments: "Segments",
  campaigns: "Campaigns",
  templates: "Templates",
  automation: "Automation",
  reports: "Reports",
  integrations: "Integrations",
  settings: "Settings",
  help: "Help",
};

const MODULE_ORDER = Object.keys(MODULE_LABELS);

function Check({ on }: { on: boolean }) {
  return (
    <span className={on ? "text-emerald-600" : "text-slate-300"} aria-label={on ? "Yes" : "No"}>
      {on ? "✓" : "—"}
    </span>
  );
}

export function RolesTab() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listRoles().then((r) => {
      setRoles(r.roles);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  const grantLabels = Array.from(new Set(roles.flatMap((r) => r.grants)));
  const moduleKeys = MODULE_ORDER.filter((key) => roles.some((r) => r.modules.includes(key)));

  return (
    <div>
      <p className="text-sm text-slate-600">
        What each role can actually do and see, computed live from the same route guards and
        sidebar rules every request goes through — not a separate settings table that could
        quietly drift out of sync with real enforcement. Roles can't be created or renamed here;
        they're a fixed part of the app's design (see ARCHITECTURE.md).
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {roles.map((r) => (
          <span key={r.id}>
            <span className="font-medium text-slate-700">{r.name}</span>: {r.userCount} user
            {r.userCount === 1 ? "" : "s"}
          </span>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">Modules visible per role</h3>
      <p className="mt-1 text-xs text-slate-500">
        Which sidebar pages each role sees. A hidden module is also blocked if visited directly by
        URL — this isn't just a hidden link.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Module</th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-2 text-center whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moduleKeys.map((key) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{MODULE_LABELS[key] ?? key}</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-4 py-2 text-center">
                    <Check on={r.modules.includes(key)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">Write / delete / admin access per role</h3>
      <p className="mt-1 text-xs text-slate-500">
        A role with none of these checked is read-only — it can see data but not change it.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-2 text-center whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grantLabels.map((label) => (
              <tr key={label} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{label}</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-4 py-2 text-center">
                    <Check on={r.grants.includes(label)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
