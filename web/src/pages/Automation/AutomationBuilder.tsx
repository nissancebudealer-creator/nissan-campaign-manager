import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { automationApi } from "../../lib/automationApi";
import { templatesApi } from "../../lib/templatesApi";
import { ApiError } from "../../lib/api";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_TRIGGER_TYPES,
  CHANNELS,
  ENROLLMENT_STATUS_STYLES,
  LEAD_STATUSES,
} from "../../lib/constants";
import type { AutomationEnrollment, AutomationStep, AutomationTriggerType, ConsentChannel, Template } from "../../types";

function emptyStep(): AutomationStep {
  return { dayOffset: 0, channel: "EMAIL", templateId: "" };
}

export function AutomationBuilder() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("MANUAL_ONLY");
  const [triggerValue, setTriggerValue] = useState("");
  const [steps, setSteps] = useState<AutomationStep[]>([emptyStep()]);
  const [isActive, setIsActive] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [enrollments, setEnrollments] = useState<AutomationEnrollment[]>([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AutomationEnrollment | null>(null);

  useEffect(() => {
    templatesApi.list().then((r) => setTemplates(r.templates));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    automationApi
      .get(id!)
      .then((r) => {
        setName(r.rule.name);
        setTriggerType(r.rule.triggerType);
        setTriggerValue(r.rule.triggerValue ?? "");
        setSteps(r.rule.stepsJson.length > 0 ? r.rule.stepsJson : [emptyStep()]);
        setIsActive(r.rule.isActive);
      })
      .catch(() => setError("Could not load this automation."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function loadEnrollments() {
    if (!isEdit) return;
    automationApi.listEnrollments(id!).then((r) => setEnrollments(r.enrollments));
  }

  useEffect(() => {
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateStep(index: number, next: Partial<AutomationStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }

  function addStep() {
    const lastOffset = steps.length > 0 ? Math.max(...steps.map((s) => s.dayOffset)) : -1;
    setSteps((prev) => [...prev, { ...emptyStep(), dayOffset: lastOffset + 1 }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this automation a name.";
    if (triggerType === "LEAD_STATUS_CHANGED" && !triggerValue) {
      return "Choose which lead status should trigger this automation.";
    }
    if (steps.length === 0) return "Add at least one step.";
    for (const step of steps) {
      if (!step.templateId) return "Every step needs a template.";
      if (step.channel === "WHATSAPP" && !step.whatsappTemplateName?.trim()) {
        return "WhatsApp steps need an approved template name.";
      }
    }
    const offsets = steps.map((s) => s.dayOffset);
    if (new Set(offsets).size !== offsets.length) return "Steps must have distinct day offsets.";
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const sortedSteps = [...steps].sort((a, b) => a.dayOffset - b.dayOffset);
      const input = {
        name,
        triggerType,
        triggerValue: triggerType === "LEAD_STATUS_CHANGED" ? triggerValue : undefined,
        steps: sortedSteps,
        isActive,
      };
      if (isEdit) {
        await automationApi.update(id!, input);
        setNotice("Saved.");
        setTimeout(() => setNotice(null), 2000);
      } else {
        const result = await automationApi.create(input);
        navigate(`/automation/${result.rule.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this automation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelEnrollment() {
    if (!cancelTarget) return;
    await automationApi.cancelEnrollment(cancelTarget.id);
    setCancelTarget(null);
    loadEnrollments();
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{isEdit ? "Edit automation" : "New automation"}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/automation")}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Name *</span>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Trigger</span>
            <select
              className="input mt-1"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
            >
              {AUTOMATION_TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AUTOMATION_TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          {triggerType === "LEAD_STATUS_CHANGED" && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Target lead status *</span>
              <select className="input mt-1" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)}>
                <option value="">— Select —</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {triggerType === "MANUAL_ONLY" && (
            <p className="text-xs text-slate-500">
              Contacts only enter this automation when a staff member enrolls them from the Contacts page.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Steps</span>
              <button
                type="button"
                onClick={addStep}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                + Add step
              </button>
            </div>
            <div className="mt-2 space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Step {index + 1}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-500">Days after enrollment</span>
                      <input
                        type="number"
                        min={0}
                        className="input mt-1"
                        value={step.dayOffset}
                        onChange={(e) => updateStep(index, { dayOffset: Number(e.target.value) })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-slate-500">Channel</span>
                      <select
                        className="input mt-1"
                        value={step.channel}
                        onChange={(e) => updateStep(index, { channel: e.target.value as ConsentChannel, templateId: "" })}
                      >
                        {CHANNELS.map((c) => (
                          <option key={c} value={c}>
                            {c === "EMAIL" ? "Email" : c === "WHATSAPP" ? "WhatsApp" : "Viber"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-2 block">
                    <span className="text-[11px] font-medium text-slate-500">Template</span>
                    <select
                      className="input mt-1"
                      value={step.templateId}
                      onChange={(e) => updateStep(index, { templateId: e.target.value })}
                    >
                      <option value="">— Select a template —</option>
                      {templates
                        .filter((t) => t.channel === step.channel)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    {templates.filter((t) => t.channel === step.channel).length === 0 && (
                      <span className="mt-1 block text-[11px] text-amber-600">
                        No {step.channel} templates yet — create one under Templates first.
                      </span>
                    )}
                  </label>
                  {step.channel === "WHATSAPP" && (
                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-amber-50 p-2">
                      <label className="block">
                        <span className="text-[11px] font-medium text-amber-700">WhatsApp template name *</span>
                        <input
                          className="input mt-1"
                          value={step.whatsappTemplateName ?? ""}
                          onChange={(e) => updateStep(index, { whatsappTemplateName: e.target.value })}
                          placeholder="e.g. follow_up_1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-amber-700">Language code</span>
                        <input
                          className="input mt-1"
                          value={step.whatsappTemplateLanguage ?? "en"}
                          onChange={(e) => updateStep(index, { whatsappTemplateLanguage: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {isEdit && (
          <div>
            <p className="text-xs font-medium text-slate-500">Enrolled contacts</p>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Next due</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {enrollments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                        No enrollments yet.
                      </td>
                    </tr>
                  )}
                  {enrollments.map((enrollment) => (
                    <tr key={enrollment.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">
                        {enrollment.contact.firstName} {enrollment.contact.lastName}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{enrollment.currentStepIndex + 1}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ENROLLMENT_STATUS_STYLES[enrollment.status]}`}
                        >
                          {enrollment.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {enrollment.nextStepDueAt ? new Date(enrollment.nextStepDueAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {enrollment.status === "ACTIVE" && (
                          <button
                            onClick={() => setCancelTarget(enrollment)}
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this enrollment?"
        description={
          cancelTarget
            ? `${cancelTarget.contact.firstName} ${cancelTarget.contact.lastName} will stop receiving further steps in this automation.`
            : ""
        }
        confirmLabel="Cancel enrollment"
        danger
        onConfirm={handleCancelEnrollment}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
