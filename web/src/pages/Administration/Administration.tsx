import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ApiError } from "../../lib/api";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { AuditLogTab } from "./AuditLogTab";
import { SendingLimitsTab } from "./SendingLimitsTab";
import { BrandingTab } from "./BrandingTab";
import { BackupTab } from "./BackupTab";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "audit", label: "Audit Log" },
  { key: "limits", label: "Sending Limits" },
  { key: "branding", label: "Branding" },
  { key: "backup", label: "Backup" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function Administration() {
  const [tab, setTab] = useState<TabKey>("users");
  const [accessChecked, setAccessChecked] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    adminApi
      .listRoles()
      .then(() => setDenied(false))
      .catch((err) => setDenied(err instanceof ApiError && err.status === 403))
      .finally(() => setAccessChecked(true));
  }, []);

  if (!accessChecked) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (denied) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Administration</h1>
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You don't have permission to view this page — Administration is restricted to the
          Administrator role.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Administration</h1>
      <p className="mt-1 text-sm text-slate-600">
        User accounts, real (not decorative) role-based access, the audit trail, and per-channel
        sending limits.
      </p>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "users" && <UsersTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "audit" && <AuditLogTab />}
        {tab === "limits" && <SendingLimitsTab />}
        {tab === "branding" && <BrandingTab />}
        {tab === "backup" && <BackupTab />}
      </div>
    </div>
  );
}
