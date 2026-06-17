import { useState, type ReactNode } from 'react';

interface Props {
  title:        string;
  message:      ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm:    () => Promise<void> | void;
  onClose:      () => void;
}

/** Reusable confirmation modal. Use for destructive actions like delete. */
export function ConfirmDialog({ title, message, confirmLabel, destructive, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Operation failed');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal modal--confirm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
        </div>
        <div className="confirm-body">
          <div className="confirm-message">{message}</div>
          {err && <div className="confirm-error">{err}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className={destructive ? 'btn-destructive' : 'btn-primary'}
              onClick={handleConfirm}
              disabled={busy}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
