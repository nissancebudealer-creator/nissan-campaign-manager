import { CONSENT_VALUE_OPTIONS, OPERATORS_BY_KIND, SEGMENT_FIELDS } from "../../lib/constants";
import type { SegmentCondition, Tag } from "../../types";

interface ConditionRowProps {
  condition: SegmentCondition;
  tags: Tag[];
  onChange: (next: SegmentCondition) => void;
  onRemove: () => void;
}

export function ConditionRow({ condition, tags, onChange, onRemove }: ConditionRowProps) {
  const fieldDef = SEGMENT_FIELDS.find((f) => f.key === condition.field) ?? SEGMENT_FIELDS[0];
  const operators = OPERATORS_BY_KIND[fieldDef.kind];

  function handleFieldChange(fieldKey: string) {
    const nextField = SEGMENT_FIELDS.find((f) => f.key === fieldKey)!;
    const nextOperators = OPERATORS_BY_KIND[nextField.kind];
    onChange({ field: fieldKey, operator: nextOperators[0].value, value: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
      <select
        className="input w-auto min-w-[9rem]"
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
      >
        {SEGMENT_FIELDS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="input w-auto min-w-[8rem]"
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {fieldDef.kind === "text" && (
        <input
          className="input w-auto min-w-[10rem] flex-1"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Value"
        />
      )}

      {fieldDef.kind === "select" && (
        <select
          className="input w-auto min-w-[10rem]"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="">— Select —</option>
          {fieldDef.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {fieldDef.kind === "tag" && (
        <select
          className="input w-auto min-w-[10rem]"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="">— Select a tag —</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name}
            </option>
          ))}
        </select>
      )}

      {fieldDef.kind === "consent" && (
        <select
          className="input w-auto min-w-[10rem]"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="">— Select —</option>
          {CONSENT_VALUE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto text-xs font-medium text-slate-400 hover:text-red-600"
      >
        Remove
      </button>
    </div>
  );
}
