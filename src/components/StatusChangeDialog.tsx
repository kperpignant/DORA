import { useState } from "react";

interface StatusChangeDialogProps {
  variant: "done" | "reopen";
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function StatusChangeDialog({
  variant,
  onConfirm,
  onCancel,
}: StatusChangeDialogProps) {
  const [note, setNote] = useState("");

  const title =
    variant === "done" ? "Mark as Done" : "Reopen Issue";
  const label =
    variant === "done"
      ? "What changed?"
      : "Why are you reopening this issue?";
  const placeholder =
    variant === "done"
      ? "Describe what was completed or fixed..."
      : "Explain why this issue needs to be reopened...";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(note.trim());
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal status-change-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-btn" onClick={onCancel}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="status-note">{label}</label>
            <textarea
              id="status-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={placeholder}
              rows={4}
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Confirm
            </button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
