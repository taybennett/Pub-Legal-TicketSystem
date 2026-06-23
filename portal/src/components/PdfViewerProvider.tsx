import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { PdfViewerModal } from './PdfViewerModal';

export interface PdfTarget {
  url:       string;
  filename?: string;
  title?:    string;
  subtitle?: string;
}

interface Ctx {
  open:  (t: PdfTarget) => void;
  close: () => void;
}

const PdfViewerCtx = createContext<Ctx | null>(null);

/**
 * Provides a single global PDF viewer modal that any component can open
 * via useOpenPdf(). Wrap once at the app root; render any number of
 * "Open PDF" buttons throughout the app.
 */
export function PdfViewerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PdfTarget | null>(null);

  const open  = useCallback((t: PdfTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  return (
    <PdfViewerCtx.Provider value={{ open, close }}>
      {children}
      {target && (
        <PdfViewerModal
          url={target.url}
          filename={target.filename}
          title={target.title}
          subtitle={target.subtitle}
          onClose={close}
        />
      )}
    </PdfViewerCtx.Provider>
  );
}

/** Get the function used to open the global PDF viewer modal. */
export function useOpenPdf(): (t: PdfTarget) => void {
  const ctx = useContext(PdfViewerCtx);
  if (!ctx) throw new Error('useOpenPdf must be used inside a <PdfViewerProvider>');
  return ctx.open;
}
