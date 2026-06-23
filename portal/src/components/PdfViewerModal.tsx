import { useEffect } from 'react';
import { fileProxyUrl } from '../api/client';

interface Props {
  url:        string;
  filename?:  string;
  title?:     string;
  /** Optional secondary line (e.g. parent record name, doc type). Renders smaller below the title. */
  subtitle?:  string;
  onClose:    () => void;
}

/**
 * Full-screen, dark-themed PDF viewer modal. Inspired by Google Drive's
 * file preview — covers the viewport, sleek top bar with filename and
 * Download / New-tab / Close icon buttons, native PDF reader inside.
 *
 * Renders via an iframe pointing at our backend file proxy. The proxy
 * rewrites Airtable's `Content-Disposition: attachment` to `inline` so
 * the browser actually renders the PDF instead of downloading it.
 */
export function PdfViewerModal({ url, filename, title, subtitle, onClose }: Props) {
  // Escape-to-close for accessibility.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const heading  = title ?? filename ?? 'Document';
  const sub      = subtitle ?? (title && filename && title !== filename ? filename : undefined);
  const inlineUrl = fileProxyUrl(url);

  return (
    <div className="pdf-viewer-overlay" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="pdf-viewer-header">
        <div className="pdf-viewer-title-block">
          <span className="pdf-viewer-icon" aria-hidden>PDF</span>
          <div className="pdf-viewer-title-text">
            <div className="pdf-viewer-title" title={heading}>{heading}</div>
            {sub && <div className="pdf-viewer-subtitle" title={sub}>{sub}</div>}
          </div>
        </div>
        <div className="pdf-viewer-actions">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="pdf-viewer-iconbtn"
            title="Open in new browser tab"
          >
            ↗ <span className="pdf-viewer-btn-label">New tab</span>
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="pdf-viewer-iconbtn"
            download={filename ?? true}
            title="Download PDF"
          >
            ⬇ <span className="pdf-viewer-btn-label">Download</span>
          </a>
          <button
            type="button"
            className="pdf-viewer-iconbtn pdf-viewer-iconbtn--close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >×</button>
        </div>
      </div>
      <div className="pdf-viewer-body">
        <iframe
          src={inlineUrl}
          title={heading}
          className="pdf-viewer-frame"
        />
      </div>
    </div>
  );
}
