import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { segmentsApi } from "../../lib/segmentsApi";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import type { Segment } from "../../types";

export function Segments() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const result = await segmentsApi.list();
    setSegments(result.segments);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    await segmentsApi.remove(deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  function groupSummary(segment: Segment) {
    const groupCount = segment.rulesJson.groups.length;
    const conditionCount = segment.rulesJson.groups.reduce((n, g) => n + g.conditions.length, 0);
    return `${conditionCount} condition${conditionCount === 1 ? "" : "s"} in ${groupCount} group${groupCount === 1 ? "" : "s"}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Segments</h1>
          <p className="mt-1 text-sm text-slate-600">
            Rule-based audiences built from contact fields, tags, and consent status.
          </p>
        </div>
        <button
          onClick={() => navigate("/segments/new")}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          New segment
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Rules</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && segments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No segments yet. Create one to target a specific audience for campaigns.
                </td>
              </tr>
            )}
            {!loading &&
              segments.map((segment) => (
                <tr key={segment.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{segment.name}</div>
                    {segment.description && (
                      <div className="text-xs text-slate-400">{segment.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{groupSummary(segment)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(segment.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/segments/${segment.id}`)}
                      className="mr-3 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(segment)}
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
        title="Delete this segment?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently removed. Any campaign built on it would lose its audience definition.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
