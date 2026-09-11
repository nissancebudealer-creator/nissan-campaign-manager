import { useState, type FormEvent, type ReactNode } from "react";
import clsx from "clsx";
import { contactsApi } from "../../lib/contactsApi";
import { ApiError } from "../../lib/api";
import { CUSTOMER_TYPES, LEAD_SOURCES, LEAD_STATUSES } from "../../lib/constants";
import type { Contact, ConsentChannel, Tag } from "../../types";
import { CHANNEL_LABELS, latestConsent } from "./consentUtils";

interface ContactFormModalProps {
  open: boolean;
  contact: Contact | null; // null = create mode
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
}

type ConsentChoice = "unchanged" | "opt_in" | "opt_out";

const CHANNELS: ConsentChannel[] = ["EMAIL", "WHATSAPP", "VIBER"];

export function ContactFormModal({ open, contact, tags, onClose, onSaved }: ContactFormModalProps) {
  const isEdit = Boolean(contact);

  const [form, setForm] = useState(() => ({
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    company: contact?.company ?? "",
    email: contact?.email ?? "",
    mobileNumber: contact?.mobileNumber ?? "",
    whatsappNumber: contact?.whatsappNumber ?? "",
    viberNumber: contact?.viberNumber ?? "",
    customerType: contact?.customerType ?? "",
    productInterest: contact?.productInterest ?? "",
    location: contact?.location ?? "",
    leadSource: contact?.leadSource ?? "",
    leadStatus: contact?.leadStatus ?? "",
    notes: contact?.notes ?? "",
  }));
  const [tagIds, setTagIds] = useState<string[]>(contact?.tags.map((t) => t.tag.id) ?? []);
  const [consentChoices, setConsentChoices] = useState<Record<ConsentChannel, ConsentChoice>>({
    EMAIL: "unchanged",
    WHATSAPP: "unchanged",
    VIBER: "unchanged",
  });
  const [consentSource, setConsentSource] = useState("Web form");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form, tagIds };
      const contactId = isEdit
        ? (await contactsApi.update(contact!.id, payload)).contact.id
        : (await contactsApi.create(payload)).contact.id;

      const consentWrites = CHANNELS.filter((ch) => consentChoices[ch] !== "unchanged").map((ch) =>
        contactsApi.setConsent(contactId, {
          channel: ch,
          optIn: consentChoices[ch] === "opt_in",
          consentSource,
        }),
      );
      await Promise.all(consentWrites);

      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this contact.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-8">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit contact" : "Add contact"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *">
              <input
                className="input"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Last name *">
              <input
                className="input"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                required
              />
            </Field>
            <Field label="Company">
              <input
                className="input"
                value={form.company}
                onChange={(e) => updateField("company", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </Field>
            <Field label="Mobile number">
              <input
                className="input"
                value={form.mobileNumber}
                onChange={(e) => updateField("mobileNumber", e.target.value)}
              />
            </Field>
            <Field label="WhatsApp number">
              <input
                className="input"
                value={form.whatsappNumber}
                onChange={(e) => updateField("whatsappNumber", e.target.value)}
              />
            </Field>
            <Field label="Viber number">
              <input
                className="input"
                value={form.viberNumber}
                onChange={(e) => updateField("viberNumber", e.target.value)}
              />
            </Field>
            <Field label="Location">
              <input
                className="input"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
            </Field>
            <Field label="Customer type">
              <select
                className="input"
                value={form.customerType}
                onChange={(e) => updateField("customerType", e.target.value)}
              >
                <option value="">—</option>
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lead status">
              <select
                className="input"
                value={form.leadStatus}
                onChange={(e) => updateField("leadStatus", e.target.value)}
              >
                <option value="">—</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lead source">
              <select
                className="input"
                value={form.leadSource}
                onChange={(e) => updateField("leadSource", e.target.value)}
              >
                <option value="">—</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Product interest">
              <input
                className="input"
                value={form.productInterest}
                onChange={(e) => updateField("productInterest", e.target.value)}
                placeholder="e.g. SUV, Sedan, Parts"
              />
            </Field>
          </div>

          <Field label="Notes" className="mt-3">
            <textarea
              className="input min-h-[70px]"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
            />
          </Field>

          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">Tags</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.length === 0 && <p className="text-xs text-slate-400">No tags yet.</p>}
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    tagIds.includes(tag.id)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">
              Consent {isEdit ? "changes" : "at signup"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Leave a channel as "No change" if you don't have explicit consent info to record right now.
            </p>
            <div className="mt-3 space-y-2">
              {CHANNELS.map((channel) => {
                const current = contact ? latestConsent(contact.consents, channel) : null;
                return (
                  <div key={channel} className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-medium text-slate-800">
                        {CHANNEL_LABELS[channel]}
                      </span>
                      {current && (
                        <span className="ml-2 text-xs text-slate-400">
                          currently {current.optIn ? "opted in" : "opted out"}
                        </span>
                      )}
                    </div>
                    <select
                      className="input w-40"
                      value={consentChoices[channel]}
                      onChange={(e) =>
                        setConsentChoices((prev) => ({
                          ...prev,
                          [channel]: e.target.value as ConsentChoice,
                        }))
                      }
                    >
                      <option value="unchanged">No change</option>
                      <option value="opt_in">Opt in</option>
                      <option value="opt_out">Opt out</option>
                    </select>
                  </div>
                );
              })}
            </div>
            <Field label="Consent source" className="mt-3">
              <input
                className="input"
                value={consentSource}
                onChange={(e) => setConsentSource(e.target.value)}
                placeholder="e.g. Web form, In-store, Phone call"
              />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
