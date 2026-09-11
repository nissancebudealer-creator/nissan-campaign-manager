import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../../lib/adminApi";
import { ApiError } from "../../lib/api";
import type { AdminRole, AdminUser } from "../../types";

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  async function load() {
    setLoading(true);
    const [usersResult, rolesResult] = await Promise.all([adminApi.listUsers(), adminApi.listRoles()]);
    setUsers(usersResult.users);
    setRoles(rolesResult.roles);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(user: AdminUser) {
    setError(null);
    try {
      await adminApi.updateUser(user.id, { isActive: !user.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this user.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{users.length} user{users.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormKey((k) => k + 1);
            setFormOpen(true);
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add user
        </button>
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last login</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{user.email}</td>
                  <td className="px-4 py-2 text-slate-600">{user.role.name}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={
                        user.isActive
                          ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                      }
                    >
                      {user.isActive ? "Active" : "Deactivated"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setFormKey((k) => k + 1);
                        setFormOpen(true);
                      }}
                      className="mr-3 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setResetTarget(user)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <UserFormModal
        key={formKey}
        open={formOpen}
        user={editingUser}
        roles={roles}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />
      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}

function UserFormModal({
  open,
  user,
  roles,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: AdminUser | null;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(user);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [roleId, setRoleId] = useState(user?.role.id ?? roles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        await adminApi.updateUser(user!.id, { firstName, lastName, roleId });
      } else {
        await adminApi.createUser({ email, password, firstName, lastName, roleId });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">{isEdit ? "Edit user" : "Add user"}</h2>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">First name *</span>
            <input
              className="input mt-1"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Last name *</span>
            <input className="input mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-500">Email *</span>
          <input
            type="email"
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            required
          />
          {isEdit && <span className="mt-1 block text-[11px] text-slate-400">Email can't be changed here.</span>}
        </label>

        {!isEdit && (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-500">Initial password *</span>
            <input
              type="password"
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
        )}

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-500">Role *</span>
          <select className="input mt-1" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordModal({ target, onClose }: { target: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!target) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await adminApi.resetPassword(target!.id, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset this password.");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setPassword("");
    setDone(false);
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">Reset password for {target.firstName}</h2>
        {done ? (
          <>
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Password reset. Tell {target.firstName} their new password directly — it's never emailed
              or logged anywhere.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleClose}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500">New password *</span>
              <input
                type="password"
                className="input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Reset password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
