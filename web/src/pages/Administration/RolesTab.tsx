import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ApiError } from "../../lib/api";
import type { AdminRole } from "../../types";

const MODULE_KEYS = [
  "view:dashboard",
  "view:contacts",
  "view:segments",
  "view:campaigns",
  "view:templates",
  "view:automation",
  "view:reports",
  "view:integrations",
  "view:settings",
  "view:help",
];

const WRITE_KEYS = [
  "contacts:write",
  "contacts:delete",
  "tags:manage",
  "segments:write",
  "segments:delete",
  "templates:write",
  "templates:delete",
  "campaigns:write",
  "campaigns:delete",
  "admin:manage",
];

const LABELS: Record<string, string> = {
  "view:dashboard": "Dashboard",
  "view:contacts": "Contacts",
  "view:segments": "Segments",
  "view:campaigns": "Campaigns",
  "view:templates": "Templates",
  "view:automation": "Automation",
  "view:reports": "Reports",
  "view:integrations": "Integrations",
  "view:settings": "Settings",
  "view:help": "Help",
  "contacts:write": "Write contacts",
  "contacts:delete": "Delete contacts",
  "tags:manage": "Manage tags",
  "segments:write": "Write segments",
  "segments:delete": "Delete segments",
  "templates:write": "Write templates",
  "templates:delete": "Delete templates",
  "campaigns:write": "Write campaigns (incl. automation)",
  "campaigns:delete": "Delete campaigns",
  "admin:manage": "Administration",
};

function PermissionCheckbox({
  granted,
  locked,
  saving,
  onToggle,
}: {
  granted: boolean;
  locked: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={granted}
      disabled={locked || saving}
      onChange={onToggle}
      title={locked ? "Can't be removed — would lock every Administrator out" : undefined}
      className="h-4 w-4 rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export function RolesTab() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // `${roleId}:${key}` in flight

  async function load() {
    const r = await adminApi.listRoles();
    setRoles(r.roles);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(role: AdminRole, key: string) {
    const cellId = `${role.id}:${key}`;
    const nextGranted = !role.permissions.includes(key);
    setError(null);
    setSaving(cellId);

    // Optimistic update — reverted on failure.
    setRoles((prev) =>
      prev.map((r) =>
        r.id !== role.id
          ? r
          : { ...r, permissions: nextGranted ? [...r.permissions, key] : r.permissions.filter((p) => p !== key) },
      ),
    );

    try {
      await adminApi.updateRolePermission(role.id, key, nextGranted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this permission.");
      load(); // revert to the real server state
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  function Matrix({ keys, title, hint }: { keys: string[]; title: string; hint: string }) {
    return (
      <>
        <h3 className="mt-6 text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2">{title === "Modules visible per role" ? "Module" : "Permission"}</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-4 py-2 text-center whitespace-nowrap">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{LABELS[key] ?? key}</td>
                  {roles.map((r) => {
                    const locked = r.name === "ADMINISTRATOR" && key === "admin:manage";
                    return (
                      <td key={r.id} className="px-4 py-2 text-center">
                        <PermissionCheckbox
                          granted={r.permissions.includes(key)}
                          locked={locked}
                          saving={saving === `${r.id}:${key}`}
                          onToggle={() => handleToggle(r, key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        What each role can actually do and see — every checkbox here is a real, live permission a
        route guard checks on the very next request, not a display of fixed settings. Toggling one
        takes effect immediately for everyone with that role. Roles themselves can't be created or
        renamed here; they're a fixed part of the app's design (see ARCHITECTURE.md).
      </p>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {roles.map((r) => (
          <span key={r.id}>
            <span className="font-medium text-slate-700">{r.name}</span>: {r.userCount} user
            {r.userCount === 1 ? "" : "s"}
          </span>
        ))}
      </div>

      <Matrix
        keys={MODULE_KEYS}
        title="Modules visible per role"
        hint="Which sidebar pages each role sees. Unchecking one also blocks the page if visited directly by URL — this isn't just a hidden link."
      />
      <Matrix
        keys={WRITE_KEYS}
        title="Write / delete / admin access per role"
        hint="A role with none of these checked is read-only — it can see data (if the module above is checked) but not change it."
      />
    </div>
  );
}
