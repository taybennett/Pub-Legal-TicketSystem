import { useRef, useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../api/client';

interface Props {
  /** Backend path, e.g. `/locations/${locationId}/leases/${leaseId}/attach` */
  uploadPath: string;
  /** Button label, e.g. "Attach Lease PDF". The 📎 icon is added automatically. */
  label?:     string;
  onAttached: () => void;
}

/**
 * Inline file picker that uploads a PDF to a given backend endpoint and
 * fires onAttached on success. Used on Lease slots that have a record
 * but no file yet (e.g. metadata-imported rows waiting on the actual PDF).
 */
export function AttachPdfButton({ uploadPath, label = 'Attach PDF', onAttached }: Props) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload(uploadPath, fd);
      onAttached();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset the input so the same file can be picked again if the user retries
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <span className="attach-pdf-wrap">
      <label className="btn-secondary btn-sm attach-pdf-btn" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
        {uploading ? '⏳ Attaching…' : `📎 ${label}`}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          disabled={uploading}
          onChange={handleChange}
        />
      </label>
      {err && <span className="attach-pdf-err">{err}</span>}
    </span>
  );
}
