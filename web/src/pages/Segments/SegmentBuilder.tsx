import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { segmentsApi } from "../../lib/segmentsApi";
import { tagsApi } from "../../lib/contactsApi";
import { ApiError } from "../../lib/api";
import { ConditionRow } from "./ConditionRow";
import type { Contact, SegmentCondition, SegmentGroup, Tag } from "../../types";

const EMPTY_CONDITION: SegmentCondition = { field: "leadStatus", operator: "equals", value: "" };

function emptyGroup(): SegmentGroup {
  return { conditions: [{ ...EMPTY_CONDITION }] };
}

export function SegmentBuilder() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groups, setGroups] = useState<SegmentGroup[]>([emptyGroup()]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<Contact[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    tagsApi.list().then((r) => setTags(r.tags));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    segmentsApi
      .get(id!)
      .then((r) => {
        setName(r.segment.name);
        setDescription(r.segment.description ?? "");
        setGroups(r.segment.rulesJson.groups.length > 0 ? r.segment.rulesJson.groups : [emptyGroup()]);
      })
      .catch(() => setError("Could not load this segment."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const hasValidRules = useMemo(
    () => groups.every((g) => g.conditions.every((c) => c.value.trim() !== "")),
    [groups],
  );

  useEffect(() => {
    if (!hasValidRules) {
      setPreviewCount(null);
      setPreviewSample([]);
      return;
    }
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await segmentsApi.previewRules({ groups }, 1, 10);
        setPreviewCount(result.total);
        setPreviewSample(result.contacts);
      } catch {
        setPreviewCount(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [groups, hasValidRules]);

  function updateGroup(groupIndex: number, next: SegmentGroup) {
    setGroups((prev) => prev.map((g, i) => (i === groupIndex ? next : g)));
  }

  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }

  function removeGroup(groupIndex: number) {
    setGroups((prev) => prev.filter((_, i) => i !== groupIndex));
  }

  function addCondition(groupIndex: number) {
    updateGroup(groupIndex, {
      conditions: [...groups[groupIndex].conditions, { ...EMPTY_CONDITION }],
    });
  }

  function updateCondition(groupIndex: number, conditionIndex: number, next: SegmentCondition) {
    const group = groups[groupIndex];
    updateGroup(groupIndex, {
      conditions: group.conditions.map((c, i) => (i === conditionIndex ? next : c)),
    });
  }

  function removeCondition(groupIndex: number, conditionIndex: number) {
    const group = groups[groupIndex];
    if (group.conditions.length === 1) {
      removeGroup(groupIndex);
      return;
    }
    updateGroup(groupIndex, {
      conditions: group.conditions.filter((_, i) => i !== conditionIndex),
    });
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Give this segment a name.");
      return;
    }
    if (!hasValidRules) {
      setError("Every condition needs a value before saving.");
      return;
    }
    setSaving(true);
    try {
      const input = { name, description: description || undefined, rules: { groups } };
      if (isEdit) {
        await segmentsApi.update(id!, input);
      } else {
        await segmentsApi.create(input);
      }
      navigate("/segments");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this segment.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {isEdit ? "Edit segment" : "New segment"}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/segments")}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save segment"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Segment name *</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Description</span>
          <input
            className="input mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500">
          Match contacts in <strong>any</strong> of these groups (OR). Within a group, every
          condition must match (AND).
        </p>

        <div className="mt-3 space-y-4">
          {groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {groupIndex > 0 && (
                <div className="my-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  OR
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="space-y-2">
                  {group.conditions.map((condition, conditionIndex) => (
                    <ConditionRow
                      key={conditionIndex}
                      condition={condition}
                      tags={tags}
                      onChange={(next) => updateCondition(groupIndex, conditionIndex, next)}
                      onRemove={() => removeCondition(groupIndex, conditionIndex)}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => addCondition(groupIndex)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    + Add condition (AND)
                  </button>
                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGroup(groupIndex)}
                      className="text-xs font-medium text-slate-400 hover:text-red-600"
                    >
                      Remove group
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addGroup}
          className="mt-4 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Add group (OR)
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Live preview</p>
          {previewLoading && <span className="text-xs text-slate-400">Updating…</span>}
        </div>
        {!hasValidRules && (
          <p className="mt-1 text-sm text-slate-400">Fill in every condition to see a preview.</p>
        )}
        {hasValidRules && previewCount !== null && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              <strong>{previewCount}</strong> matching contact{previewCount === 1 ? "" : "s"}
            </p>
            {previewSample.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {previewSample.map((c) => (
                  <li key={c.id} className="py-1.5 text-slate-600">
                    {c.firstName} {c.lastName}
                    {c.email && <span className="ml-2 text-xs text-slate-400">{c.email}</span>}
                  </li>
                ))}
              </ul>
            )}
            {previewCount > previewSample.length && (
              <p className="mt-1 text-xs text-slate-400">
                Showing first {previewSample.length} of {previewCount}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
