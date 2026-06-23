import { useEffect } from 'react';

interface Props {
  url:       string;
  filename?: string;
  title?:    string;
  onClose:   () => void;
}

/**
 * Modal PDF viewer. Renders the PDF inline via an iframe so the user can
 * read it without leaving the app. Falls back to a download link in the
 * header in case the browser refuses to render the PDF inline (e.g. when
 * the source serves Content-Disposition: attachment).
 */
export function PdfViewerModal({ url, filename, title, onClose }: Props) {
  // Close on Escape for accessibility.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const heading = title ?? filename ?? 'Document';

  return (
    <div className="modal-backdrop modal-backdrop--pdf" onClick={onClose}>
      <div className="modal modal--pdf" onClick={e => e.stopPropagation()}>
        <div className="modal-header pdf-modal-header">
          <h2 className="modal-title pdf-modal-title" title={heading}>{heading}</h2>
          <div className="pdf-modal-actions">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
              download={filename ?? true}
            >
              ⬇ Download
            </a>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
              title="Open in new browser tab"
            >
              ↗ New tab
            </a>
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <div className="pdf-modal-body">
          <iframe
            src={url}
            title={heading}
            className="pdf-modal-frame"
          />
        </div>
      </div>
    </div>
  );
}
