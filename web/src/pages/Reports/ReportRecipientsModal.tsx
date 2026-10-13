import { useEffect, useState } from "react";
import Papa from "papaparse";
import clsx from "clsx";
import { campaignsApi } from "../../lib/campaignsApi";
import { contactsApi, tagsApi } from "../../lib/contactsApi";
import { ContactFormModal } from "../Contacts/ContactFormModal";
import type { Contact, RecipientCategoryCounts, RecipientLogEntry, Tag } from "../../types";

export type RecipientCategory =
  | "ALL"
  | "SENT"
  | "FAILED"
  | "BOUNCED"
  | "OPENED"
  | "CLICKED"
  | "UNSUBSCRIBED";

interface ReportRecipientsModalProps {
  open: boolean;
  campaignId: string | null;
  campaignName: string;
  channel: string;
  initialCategory?: RecipientCategory;
  onClose: () => void;
}

const TABS: { id: RecipientCategory; label: string; countKey: keyof RecipientCategoryCounts }[] = [
  { id: "ALL", label: "All Recipients", countKey: "recipients" },
  { id: "SENT", label: "Sent", countKey: "sent" },
  { id: "FAILED", label: "Failed", countKey: "failed" },
  { id: "BOUNCED", label: "Bounced", countKey: "bounced" },
  { id: "OPENED", label: "Opened", countKey: "opened" },
  { id: "CLICKED", label: "Clicked", countKey: "clicked" },
  { id: "UNSUBSCRIBED", label: "Unsubscribed", countKey: "unsubscribed" },
];

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  VIBER: "Viber",
};

export function ReportRecipientsModal({
  open,
  campaignId,
  campaignName,
  channel,
  initialCategory = "ALL",
  onClose,
}: ReportRecipientsModalProps) {
  const [activeCategory, setActiveCategory] = useState<RecipientCategory>(initialCategory);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [recipients, setRecipients] = useState<RecipientLogEntry[]>([]);
  const [counts, setCounts] = useState<RecipientCategoryCounts>({
    recipients: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    opened: 0,
    clicked: 0,
    unsubscribed: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Edit contact states
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editFormKey, setEditFormKey] = useState(0);
  const [loadingContactId, setLoadingContactId] = useState<string | null>(null);

  // Synchronize initial category when opened or changed
  useEffect(() => {
    if (open) {
      setActiveCategory(initialCategory || "ALL");
      setPage(1);
      setSearch("");
      setSearchInput("");
    }
  }, [open, initialCategory, campaignId]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadRecipients = async () => {
    if (!campaignId || !open) return;
    setLoading(true);
    try {
      const res = await campaignsApi.recipientLog(campaignId, {
        status: activeCategory,
        search,
        page,
        pageSize,
      });
      setRecipients(res.recipients);
      if (res.counts) setCounts(res.counts);
      setTotal(res.total ?? res.recipients.length);
    } catch {
      showToast("Failed to load recipient details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecipients();
  }, [campaignId, open, activeCategory, search, page]);

  if (!open || !campaignId) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleCopy(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  }

  async function handleOpenEdit(contactId: string) {
    try {
      setLoadingContactId(contactId);
      const [contactRes, tagsRes] = await Promise.all([
        contactsApi.get(contactId),
        tagsApi.list(),
      ]);
      setEditingContact(contactRes.contact);
      setTags(tagsRes.tags);
      setEditFormKey((k) => k + 1);
      setEditFormOpen(true);
    } catch {
      showToast("Unable to load contact details for editing.");
    } finally {
      setLoadingContactId(null);
    }
  }

  function handleContactSaved() {
    setEditFormOpen(false);
    setEditingContact(null);
    showToast("Contact information successfully updated!");
    loadRecipients();
  }

  async function handleExportCsv() {
    if (!campaignId) return;
    setExporting(true);
    try {
      // Fetch up to 2,000 records for the active category to produce the complete CSV
      const res = await campaignsApi.recipientLog(campaignId, {
        status: activeCategory,
        search,
        page: 1,
        pageSize: 2000,
      });

      const rows = res.recipients.map((r) => ({
        "Recipient Name": r.contact.name || `${r.contact.firstName || ""} ${r.contact.lastName || ""}`.trim(),
        "Email": r.contact.email || "",
        "Mobile Number": r.contact.mobileNumber || "",
        "WhatsApp Number": r.contact.whatsappNumber || "",
        "Viber Number": r.contact.viberNumber || "",
        "Company": r.contact.company || "",
        "Location": r.contact.location || "",
        "Customer Type": r.contact.customerType || "",
        "Lead Status": r.contact.leadStatus || "",
        "Lead Source": r.contact.leadSource || "",
        "Delivery Status": r.status,
        "Error / Diagnostic Message": r.errorMessage || "",
        "Sent At": r.sentAt ? new Date(r.sentAt).toLocaleString() : "",
        "Opened At": r.openedAt ? new Date(r.openedAt).toLocaleString() : "",
        "Clicked At": r.clickedAt ? new Date(r.clickedAt).toLocaleString() : "",
        "Is Unsubscribed": r.isUnsubscribed ? "Yes" : "No",
        "Unsubscribe Reason": r.unsubscribeReason || "",
        "Notes": r.contact.notes || "",
      }));

      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanCampName = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.href = url;
      link.download = `${cleanCampName}-${activeCategory.toLowerCase()}-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("CSV export downloaded.");
    } catch {
      showToast("Failed to export recipient CSV.");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6 backdrop-blur-xs">
        <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4.5 bg-slate-50/75 rounded-t-2xl">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900">{campaignName}</h2>
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {CHANNEL_LABELS[channel] || channel}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Click any contact to view contact info, follow up directly, or make instant corrections.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting || recipients.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
              >
                <span>📥</span>
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Toast alert */}
          {toast && (
            <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-lg animate-fade-in">
              {toast}
            </div>
          )}

          {/* Category Tabs & Search Bar */}
          <div className="border-b border-slate-200 bg-white px-6 pt-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Category tabs */}
              <div className="flex flex-wrap gap-1.5">
                {TABS.map((tab) => {
                  const count = counts[tab.countKey] ?? 0;
                  const isActive = activeCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveCategory(tab.id);
                        setPage(1);
                      }}
                      className={clsx(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={clsx(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                          isActive
                            ? "bg-slate-700 text-white"
                            : "bg-white text-slate-700 border border-slate-200"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email, phone, company…"
                  className="w-full rounded-lg border border-slate-300 py-1.5 pr-8 pl-3 text-xs placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute inset-y-0 right-2 flex items-center text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table / Contact List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                <p className="text-xs">Loading recipient contacts…</p>
              </div>
            ) : recipients.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <span className="text-3xl">📭</span>
                <p className="text-sm font-semibold text-slate-700">No recipients found</p>
                <p className="text-xs text-slate-500">
                  {search
                    ? `No contacts match "${search}" under ${activeCategory.toLowerCase()}.`
                    : `No contacts recorded under ${activeCategory.toLowerCase()} for this campaign.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[840px] text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Direct Contact Details</th>
                      <th className="px-4 py-3">Company & Info</th>
                      <th className="px-4 py-3">Campaign Status & Interaction</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recipients.map((r) => {
                      const c = r.contact;
                      const hasPhone = Boolean(c.mobileNumber || c.whatsappNumber || c.viberNumber);
                      const isFailed = r.status === "FAILED";
                      const isBounced = r.status === "BOUNCED";
                      const isUnsub = r.isUnsubscribed;

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Contact Name & Lead Status */}
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-slate-900 text-sm">
                              {c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unnamed Contact"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.customerType && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {c.customerType}
                                </span>
                              )}
                              {c.leadStatus && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                  {c.leadStatus}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Email & Phone Details with Copy & Direct Link */}
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1.5">
                              {c.email ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-400">✉️</span>
                                  <a
                                    href={`mailto:${c.email}`}
                                    className="font-medium text-blue-600 hover:underline"
                                    title="Send email"
                                  >
                                    {c.email}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(c.email!, "email")}
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    title="Copy email address"
                                  >
                                    📋
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">No email</span>
                              )}

                              {c.mobileNumber ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-400">📱</span>
                                  <a
                                    href={`tel:${c.mobileNumber}`}
                                    className="font-medium text-slate-700 hover:underline"
                                    title="Call contact"
                                  >
                                    {c.mobileNumber}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(c.mobileNumber!, "mobile number")}
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    title="Copy mobile number"
                                  >
                                    📋
                                  </button>
                                </div>
                              ) : hasPhone ? null : (
                                <span className="text-slate-400 text-[11px] block">No phone number</span>
                              )}

                              {c.whatsappNumber && c.whatsappNumber !== c.mobileNumber && (
                                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                                  <span>WhatsApp:</span>
                                  <a
                                    href={`https://wa.me/${c.whatsappNumber.replace(/[^0-9]/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline font-mono"
                                  >
                                    {c.whatsappNumber}
                                  </a>
                                </div>
                              )}

                              {c.viberNumber && c.viberNumber !== c.mobileNumber && (
                                <div className="flex items-center gap-1.5 text-[11px] text-purple-700">
                                  <span>Viber:</span>
                                  <span className="font-mono">{c.viberNumber}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Company, Location & Notes */}
                          <td className="px-4 py-3 align-top text-slate-600">
                            <div>
                              {c.company ? (
                                <div className="font-medium text-slate-800">{c.company}</div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                              {c.location && (
                                <div className="text-[11px] text-slate-500">📍 {c.location}</div>
                              )}
                              {c.notes && (
                                <div className="mt-1 line-clamp-2 text-[10px] text-slate-500 italic bg-slate-50 p-1 rounded">
                                  "{c.notes}"
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Delivery Status & Detailed Diagnostics */}
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={clsx(
                                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    r.status === "SENT" && "bg-sky-100 text-sky-800",
                                    r.status === "OPENED" && "bg-emerald-100 text-emerald-800",
                                    r.status === "CLICKED" && "bg-blue-100 text-blue-800",
                                    r.status === "FAILED" && "bg-red-100 text-red-800",
                                    r.status === "BOUNCED" && "bg-amber-100 text-amber-800",
                                    r.status === "PENDING" && "bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {r.status}
                                </span>

                                {isUnsub && (
                                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                                    Unsubscribed
                                  </span>
                                )}
                              </div>

                              {/* Error or Bounce message */}
                              {isFailed && r.errorMessage && (
                                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] font-medium text-red-800">
                                  ⚠️ <strong className="font-semibold">Reason:</strong> {r.errorMessage}
                                </div>
                              )}

                              {isBounced && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] font-medium text-amber-800">
                                  ⚠️ <strong className="font-semibold">Bounced:</strong>{" "}
                                  {r.errorMessage || "Inbox rejected address as unreachable"}
                                </div>
                              )}

                              {/* Interaction dates */}
                              <div className="text-[10px] text-slate-500 space-y-0.5 pt-0.5">
                                {r.sentAt && (
                                  <div>Sent: {new Date(r.sentAt).toLocaleString()}</div>
                                )}
                                {r.openedAt && (
                                  <div className="text-emerald-700 font-medium">
                                    Opened: {new Date(r.openedAt).toLocaleString()}
                                  </div>
                                )}
                                {r.clickedAt && (
                                  <div className="text-blue-700 font-medium">
                                    Clicked: {new Date(r.clickedAt).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Action Button: Edit Contact directly */}
                          <td className="px-4 py-3 align-top text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(c.id)}
                              disabled={loadingContactId === c.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50"
                              title="Edit contact info, correction, or notes"
                            >
                              <span>✏️</span>
                              {loadingContactId === c.id ? "Loading…" : "Edit contact"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer & Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-3.5 bg-slate-50/75 rounded-b-2xl">
            <div className="text-xs text-slate-500">
              {total > 0 ? (
                <>
                  Showing <strong className="text-slate-800">{startIdx}</strong> to{" "}
                  <strong className="text-slate-800">{endIdx}</strong> of{" "}
                  <strong className="text-slate-800">{total}</strong> recipients
                </>
              ) : (
                "0 recipients"
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-medium text-slate-600">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* In-place Contact Form Modal */}
      {editFormOpen && editingContact && (
        <ContactFormModal
          key={editFormKey}
          open={editFormOpen}
          contact={editingContact}
          tags={tags}
          onClose={() => {
            setEditFormOpen(false);
            setEditingContact(null);
          }}
          onSaved={handleContactSaved}
        />
      )}
    </>
  );
}
