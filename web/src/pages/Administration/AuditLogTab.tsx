import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import type { AuditLogEntry } from "../../types";

const PAGE_SIZE = 50;

export function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const result = await adminApi.listAuditLogs({ action, entityType, page, pageSize: PAGE_SIZE });
    setLogs(result.logs);
    setTotal(result.total);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    setPage(1);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p className="text-sm text-slate-600">
        Every write action across the app records a real entry here — nothing is summarized or
        inferred after the fact.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action, e.g. CAMPAIGN_SENT"
          className="input w-64"
        />
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Filter by entity type, e.g. Campaign"
          className="input w-64"
        />
        <button
          onClick={applyFilters}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Apply
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Who</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No matching audit entries.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : "System"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{log.action}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                    {log.entityType}
                    {log.entityId ? ` (${log.entityId.slice(0, 8)}…)` : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {log.metadata ? (
                      <code className="text-[11px]">{JSON.stringify(log.metadata)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
