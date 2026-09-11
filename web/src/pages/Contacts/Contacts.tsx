import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import clsx from "clsx";
import { contactsApi, tagsApi } from "../../lib/contactsApi";
import { automationApi } from "../../lib/automationApi";
import { ApiError } from "../../lib/api";
import { CUSTOMER_TYPES, LEAD_STATUSES } from "../../lib/constants";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ContactFormModal } from "./ContactFormModal";
import { ImportCsvModal } from "./ImportCsvModal";
import { CHANNEL_LABELS, latestConsent } from "./consentUtils";
import type { AutomationRule, Contact, ConsentChannel, Tag } from "../../types";

const PAGE_SIZE = 25;
const CHANNELS: ConsentChannel[] = ["EMAIL", "WHATSAPP", "VIBER"];

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Bumped every time the modal opens so it always remounts with fresh state instead of
  // carrying over stale field values from whatever contact (or blank "add") was open before.
  const [formKey, setFormKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [viberLinkNotice, setViberLinkNotice] = useState<string | null>(null);
  const [activeRules, setActiveRules] = useState<AutomationRule[]>([]);
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);

  useEffect(() => {
    automationApi.list().then((r) => setActiveRules(r.rules.filter((rule) => rule.isActive)));
  }, []);

  async function handleEnroll(contact: Contact, automationRuleId: string) {
    if (!automationRuleId) return;
    try {
      await automationApi.enroll(automationRuleId, contact.id);
      const rule = activeRules.find((r) => r.id === automationRuleId);
      setEnrollNotice(`${contact.firstName} enrolled in "${rule?.name ?? "automation"}".`);
    } catch (err) {
      setEnrollNotice(err instanceof ApiError ? err.message : "Could not enroll this contact.");
    }
    setTimeout(() => setEnrollNotice(null), 4000);
  }

  async function handleCopyViberLink(contact: Contact) {
    try {
      const { link } = await contactsApi.viberInviteLink(contact.id);
      await navigator.clipboard.writeText(link);
      setViberLinkNotice(`Viber invite link for ${contact.firstName} copied to clipboard.`);
    } catch (err) {
      setViberLinkNotice(
        err instanceof Error && err.message
          ? err.message
          : "Could not generate a Viber invite link.",
      );
    }
    setTimeout(() => setViberLinkNotice(null), 4000);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filters = useMemo(
    () => ({ search, customerType, leadStatus, tagId: tagFilter, page, pageSize: PAGE_SIZE }),
    [search, customerType, leadStatus, tagFilter, page],
  );

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      const result = await contactsApi.list(filters);
      setContacts(result.contacts);
      setTotal(result.total);
    } catch {
      setError("Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTags() {
    const result = await tagsApi.list();
    setTags(result.tags);
  }

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, customerType, leadStatus, tagFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === contacts.length ? [] : contacts.map((c) => c.id)));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await contactsApi.remove(deleteTarget.id);
    setDeleteTarget(null);
    setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
    loadContacts();
  }

  async function handleBulkTag(tagId: string) {
    if (selectedIds.length === 0) return;
    await contactsApi.bulkUpdate({ contactIds: selectedIds, addTagIds: [tagId] });
    setSelectedIds([]);
    loadContacts();
  }

  async function handleBulkLeadStatus(status: string) {
    if (selectedIds.length === 0 || !status) return;
    await contactsApi.bulkUpdate({ contactIds: selectedIds, leadStatus: status });
    setSelectedIds([]);
    loadContacts();
  }

  async function handleExport() {
    const { contacts: allContacts } = await contactsApi.export({
      search,
      customerType,
      leadStatus,
      tagId: tagFilter,
    });
    const rows = allContacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company ?? "",
      email: c.email ?? "",
      mobileNumber: c.mobileNumber ?? "",
      whatsappNumber: c.whatsappNumber ?? "",
      viberNumber: c.viberNumber ?? "",
      customerType: c.customerType ?? "",
      productInterest: c.productInterest ?? "",
      location: c.location ?? "",
      leadSource: c.leadSource ?? "",
      leadStatus: c.leadStatus ?? "",
      notes: c.notes ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-600">{total} total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Import CSV
          </button>
          <button
            onClick={() => {
              setEditingContact(null);
              setFormKey((k) => k + 1);
              setFormOpen(true);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add contact
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, email, company, mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-44" value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
          <option value="">All customer types</option>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input w-36" value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)}>
          <option value="">All lead statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input w-40" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">{selectedIds.length} selected</span>
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkLeadStatus(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Set lead status…
            </option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkTag(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Add tag…
            </option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button onClick={() => setSelectedIds([])} className="ml-auto text-slate-500 hover:text-slate-700">
            Clear
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {viberLinkNotice && <p className="mt-3 text-sm text-slate-600">{viberLinkNotice}</p>}
      {enrollNotice && <p className="mt-3 text-sm text-slate-600">{enrollNotice}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selectedIds.length === contacts.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Email / Mobile</th>
              <th className="px-3 py-2">Type / Status</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">Consent</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No contacts match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(contact.id)}
                      onChange={() => toggleSelected(contact.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {contact.firstName} {contact.lastName}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{contact.company || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{contact.email || "—"}</div>
                    <div className="text-xs text-slate-400">{contact.mobileNumber || ""}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{contact.customerType || "—"}</div>
                    <div className="text-xs text-slate-400">{contact.leadStatus || ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.map(({ tag }) => (
                        <span
                          key={tag.id}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {CHANNELS.map((channel) => {
                        const consent = latestConsent(contact.consents, channel);
                        const suppressed = contact.suppressions.some((s) => s.channel === channel);
                        const viberStatus =
                          channel === "VIBER"
                            ? contact.viberUserId
                              ? " — subscribed on Viber"
                              : " — not yet subscribed on Viber"
                            : "";
                        return (
                          <span
                            key={channel}
                            title={`${CHANNEL_LABELS[channel]}: ${
                              suppressed ? "suppressed" : consent ? (consent.optIn ? "opted in" : "opted out") : "no record"
                            }${viberStatus}`}
                            className={clsx(
                              "flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold",
                              suppressed
                                ? "bg-red-100 text-red-600"
                                : consent?.optIn
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-slate-100 text-slate-400",
                            )}
                          >
                            {channel[0]}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {activeRules.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => handleEnroll(contact, e.target.value)}
                        className="mr-2 rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600"
                        title="Enroll this contact in an automation"
                      >
                        <option value="">Enroll…</option>
                        {activeRules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {!contact.viberUserId && (
                      <button
                        onClick={() => handleCopyViberLink(contact)}
                        className="mr-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                        title="Copy a personal Viber invite link for this contact"
                      >
                        Viber link
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingContact(contact);
                        setFormKey((k) => k + 1);
                        setFormOpen(true);
                      }}
                      className="mr-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(contact)}
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

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Previous
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

      <ContactFormModal
        key={formKey}
        open={formOpen}
        contact={editingContact}
        tags={tags}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          loadContacts();
        }}
      />

      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadContacts}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this contact?"
        description={
          deleteTarget
            ? `${deleteTarget.firstName} ${deleteTarget.lastName} will be permanently removed, including consent and tag history. This can't be undone.`
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
