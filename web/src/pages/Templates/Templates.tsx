import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { templatesApi } from "../../lib/templatesApi";
import { CHANNELS, TEMPLATE_CATEGORIES } from "../../lib/constants";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import type { Template } from "../../types";

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [channel, setChannel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const result = await templatesApi.list({ category, channel });
    setTemplates(result.templates);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, channel]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await templatesApi.remove(deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Templates</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reusable message content by category and channel, with personalization variables.
          </p>
        </div>
        <button
          onClick={() => navigate("/templates/new")}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          New template
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <select className="input w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="input w-40" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Channel</th>
              <th className="px-4 py-2">Variables</th>
              <th className="px-4 py-2">Updated</th>
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
            {!loading && templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No templates yet.
                </td>
              </tr>
            )}
            {!loading &&
              templates.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-2 text-slate-600">{t.category}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {CHANNEL_LABELS[t.channel]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {t.variables.length > 0 ? t.variables.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/templates/${t.id}`)}
                      className="mr-3 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this template?"
        description={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
