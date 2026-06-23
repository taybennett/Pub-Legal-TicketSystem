import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// Vite needs `?url` so the worker file is emitted as a static asset; the URL
// points at the built file so the worker can spin up in a separate thread.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fileProxyUrl } from '../api/client';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  url:        string;
  filename?:  string;
  title?:     string;
  subtitle?:  string;
  onClose:    () => void;
}

/**
 * Drive-style full-screen PDF viewer that renders with pdf.js, so we don't
 * depend on the browser's built-in PDF plugin (which can be disabled via
 * "Always download PDFs" or blocked in cross-origin iframes).
 *
 * Pages stack vertically and the user scrolls; the toolbar has page jump
 * controls and zoom. Cookies travel with the fetch so the backend file
 * proxy can authenticate the request.
 */
export function PdfViewerModal({ url, filename, title, subtitle, onClose }: Props) {
  const [numPages, setNumPages]   = useState<number | null>(null);
  const [currentPage, setCurrent] = useState<number>(1);
  const [scale, setScale]         = useState<number>(1.1);
  const [loadErr, setLoadErr]     = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent page scroll behind the modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Stable `file` prop so react-pdf doesn't re-fetch on every render.
  const file = useMemo(
    () => ({ url: fileProxyUrl(url), withCredentials: true }),
    [url],
  );

  const heading = title ?? filename ?? 'Document';
  const sub     = subtitle ?? (title && filename && title !== filename ? filename : undefined);

  function zoomIn()  { setScale(s => Math.min(s + 0.2, 3)); }
  function zoomOut() { setScale(s => Math.max(s - 0.2, 0.4)); }
  function resetZoom() { setScale(1.1); }

  function gotoPage(n: number) {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(numPages, n));
    setCurrent(clamped);
    const el = document.getElementById(`pdf-page-${clamped}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

        <div className="pdf-viewer-toolbar">
          {numPages != null && (
            <div className="pdf-viewer-pager">
              <button type="button" className="pdf-viewer-iconbtn" onClick={() => gotoPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page">‹</button>
              <span className="pdf-viewer-page-readout">
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={currentPage}
                  onChange={e => gotoPage(parseInt(e.target.value, 10) || 1)}
                  className="pdf-viewer-page-input"
                />
                <span className="muted-light"> / {numPages}</span>
              </span>
              <button type="button" className="pdf-viewer-iconbtn" onClick={() => gotoPage(currentPage + 1)} disabled={currentPage >= numPages} title="Next page">›</button>
            </div>
          )}

          <div className="pdf-viewer-zoom">
            <button type="button" className="pdf-viewer-iconbtn" onClick={zoomOut} title="Zoom out">−</button>
            <button type="button" className="pdf-viewer-iconbtn pdf-viewer-zoom-readout" onClick={resetZoom} title="Reset zoom">{Math.round(scale * 100)}%</button>
            <button type="button" className="pdf-viewer-iconbtn" onClick={zoomIn} title="Zoom in">+</button>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="pdf-viewer-iconbtn"
            title="Open in new browser tab"
          >↗<span className="pdf-viewer-btn-label">New tab</span></a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="pdf-viewer-iconbtn"
            download={filename ?? true}
            title="Download PDF"
          >⬇<span className="pdf-viewer-btn-label">Download</span></a>
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
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => { setNumPages(n); setCurrent(1); }}
          onLoadError={(err: Error) => setLoadErr(err.message || 'Failed to load PDF')}
          loading={<div className="pdf-viewer-loading">Loading PDF…</div>}
          error={
            <div className="pdf-viewer-error">
              <p>Couldn't load this PDF in the viewer.</p>
              {loadErr && <p className="muted">{loadErr}</p>}
              <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">Open in new tab</a>
            </div>
          }
          options={pdfOptions}
        >
          {numPages != null && Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
            <div key={n} id={`pdf-page-${n}`} className="pdf-viewer-page-wrap">
              <Page
                pageNumber={n}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
              <div className="pdf-viewer-page-label">Page {n} of {numPages}</div>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

// Stable reference for the options object so react-pdf doesn't refetch.
const pdfOptions = {
  // Tell pdf.js where to find character maps and standard fonts. Empty strings
  // are fine for most PDFs — they'll be loaded lazily from pdfjs-dist on demand.
  cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/cmaps/',
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/',
};
