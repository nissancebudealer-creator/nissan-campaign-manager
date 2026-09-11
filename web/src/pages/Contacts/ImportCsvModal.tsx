import { useState } from "react";
import Papa from "papaparse";
import clsx from "clsx";
import { contactsApi } from "../../lib/contactsApi";
import { ApiError } from "../../lib/api";
import { CONTACT_CSV_HEADERS, applyMapping, guessColumnMapping, type ContactField } from "./csvMapping";
import type { ImportRowResult } from "../../types";

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const FIELD_LABELS: Record<ContactField, string> = {
  firstName: "First name *",
  lastName: "Last name *",
  company: "Company",
  email: "Email",
  mobileNumber: "Mobile number",
  whatsappNumber: "WhatsApp number",
  viberNumber: "Viber number",
  customerType: "Customer type",
  productInterest: "Product interest",
  location: "Location",
  leadSource: "Lead source",
  leadStatus: "Lead status",
  notes: "Notes",
};

type Step = "upload" | "map" | "preview" | "done";

export function ImportCsvModal({ open, onClose, onImported }: ImportCsvModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<ContactField, string>>(
    Object.fromEntries(CONTACT_CSV_HEADERS.map((f) => [f, ""])) as Record<ContactField, string>,
  );
  const [previewResults, setPreviewResults] = useState<ImportRowResult[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    total: number;
    valid: number;
    duplicate: number;
    invalid: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committedCount, setCommittedCount] = useState(0);

  if (!open) return null;

  function reset() {
    setStep("upload");
    setCsvHeaders([]);
    setRawRows([]);
    setPreviewResults([]);
    setPreviewSummary(null);
    setError(null);
    setCommittedCount(0);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        if (headers.length === 0 || results.data.length === 0) {
          setError("Couldn't find any rows in that file. Check it has a header row and at least one data row.");
          return;
        }
        setCsvHeaders(headers);
        setRawRows(results.data);
        setMapping(guessColumnMapping(headers));
        setStep("map");
      },
      error: (err) => setError(err.message),
    });
  }

  async function handlePreview() {
    if (!mapping.firstName || !mapping.lastName) {
      setError("Map at least First name and Last name before continuing.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const mappedRows = applyMapping(rawRows, mapping);
      const response = await contactsApi.importPreview(mappedRows);
      setPreviewResults(response.results);
      setPreviewSummary(response.summary);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not validate this file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    setError(null);
    try {
      const mappedRows = applyMapping(rawRows, mapping);
      const result = await contactsApi.importCommit(mappedRows);
      setCommittedCount(result.created);
      setStep("done");
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-8">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Import contacts from CSV</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {step === "upload" && (
            <div>
              <p className="text-sm text-slate-600">
                Upload a CSV with a header row. You'll map columns to contact fields next, then
                preview validation results before anything is saved — no invalid contacts get in
                silently.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="mt-4 block w-full text-sm"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}

          {step === "map" && (
            <div>
              <p className="text-sm text-slate-600">
                Map each contact field to a column from your CSV ({csvHeaders.length} columns
                detected). First and last name are required.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {CONTACT_CSV_HEADERS.map((field) => (
                  <label key={field} className="block">
                    <span className="text-xs font-medium text-slate-500">{FIELD_LABELS[field]}</span>
                    <select
                      className="input mt-1"
                      value={mapping[field]}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                    >
                      <option value="">— Not mapped —</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setStep("upload")}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePreview}
                  disabled={busy}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? "Validating…" : `Preview ${rawRows.length} rows`}
                </button>
              </div>
            </div>
          )}

          {step === "preview" && previewSummary && (
            <div>
              <div className="flex gap-4 text-sm">
                <span className="text-slate-600">{previewSummary.total} rows</span>
                <span className="font-medium text-emerald-600">{previewSummary.valid} valid</span>
                <span className="font-medium text-amber-600">
                  {previewSummary.duplicate} duplicate
                </span>
                <span className="font-medium text-red-600">{previewSummary.invalid} invalid</span>
              </div>

              <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResults.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-500">{r.rowNumber}</td>
                        <td className="px-3 py-1.5">
                          {r.data.firstName} {r.data.lastName}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{r.data.email || "—"}</td>
                        <td className="px-3 py-1.5">
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              r.status === "valid" && "bg-emerald-100 text-emerald-700",
                              r.status === "duplicate" && "bg-amber-100 text-amber-700",
                              r.status === "invalid" && "bg-red-100 text-red-700",
                            )}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{r.errors?.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setStep("map")}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  onClick={handleCommit}
                  disabled={busy || previewSummary.valid === 0}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? "Importing…" : `Import ${previewSummary.valid} valid contacts`}
                </button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div>
              <p className="text-sm text-slate-700">
                Imported <strong>{committedCount}</strong> new contacts.
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleClose}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
