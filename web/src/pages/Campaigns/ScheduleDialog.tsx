import { useState } from "react";

interface ScheduleDialogProps {
  open: boolean;
  initialValue?: string | null;
  onConfirm: (isoDateTime: string) => void;
  onCancel: () => void;
  error?: string | null;
}

function toLocalInputValue(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function ScheduleDialog({ open, initialValue, onConfirm, onCancel, error }: ScheduleDialogProps) {
  const [value, setValue] = useState(() => toLocalInputValue(initialValue));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-900">Schedule this campaign</h2>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-500">Send at</span>
          <input
            type="datetime-local"
            className="input mt-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(new Date(value).toISOString())}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
