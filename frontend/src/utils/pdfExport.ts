import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { computeSliceBounds, snapToQuietRow, isValidSlicePlan, SlicePlan } from './pdfPagination';

export interface PdfExportOptions {
  filename?: string;
  title?: string;
  documentType?: string;
  elementId?: string;
  customElement?: HTMLElement;
  orientation?: 'portrait' | 'landscape';
  onStart?: () => void;
  onProgress?: (progress: number, stage: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/** Hard cap on captured canvas pixels — keeps exports inside mobile
 * (iOS Safari ≈16.7MP) canvas limits with headroom for the A4 page buffers. */
const MAX_CAPTURE_PIXELS = 16_000_000;

const A4 = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
} as const;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * High-resolution Client-Side PDF Exporter for Official Disaster Management Bulletins & Advisories.
 * Respects all HazardNet print-media CSS directives:
 * - SOD 2019 Government Emergency Headers
 * - Vector QR Codes for live field telemetry mobile scanning
 * - 'Last Updated' BST timestamps and currency validity tags
 * - Multi-page pagination that snaps page breaks to blank rows (no cut text)
 *
 * Capture notes:
 * - html2canvas-pro parses modern color functions (oklch/oklab/color()) natively,
 *   so no CSS color sanitization is needed or performed.
 * - All print/preview class toggling happens inside the cloned document — the
 *   live page never flashes or reflows during export.
 */
export async function exportElementToPdf(options: PdfExportOptions = {}): Promise<void> {
  const {
    filename = `HazardNet_Emergency_Directive_${new Date().toISOString().slice(0, 10)}.pdf`,
    title = 'HazardNet Emergency Directive',
    documentType = 'Emergency Advisory Bulletin',
    elementId,
    customElement,
    orientation = 'portrait',
    onStart,
    onProgress,
    onComplete,
    onError,
  } = options;

  const page = A4[orientation];
  const marginX = 8; // mm
  const marginY = 10; // mm
  const contentWidthMm = page.width - marginX * 2;
  const contentHeightMm = page.height - marginY * 2;

  try {
    onStart?.();
    onProgress?.(10, 'Preparing document for PDF export...');

    // 1. Resolve target container element
    let targetElement: HTMLElement | null = null;
    if (customElement) {
      targetElement = customElement;
    } else if (elementId) {
      targetElement = document.getElementById(elementId);
    } else {
      // Default to main page container or max-w-7xl
      targetElement = (document.querySelector('main') || document.querySelector('.max-w-7xl') || document.body) as HTMLElement;
    }

    if (!targetElement) {
      throw new Error('Target element for PDF export could not be located in document.');
    }

    onProgress?.(25, 'Applying official print styling & QR telemetry tags...');

    // 2. Ensure web fonts (incl. self-hosted variable fonts) are fully loaded,
    //    otherwise the capture rasterizes fallback typefaces.
    try {
      await Promise.race([
        document.fonts?.ready,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Font readiness is best-effort; proceed with whatever is available.
    }

    // 3. Adaptive scale: sharp enough for A4, small enough for mobile canvas limits.
    const rect = targetElement.getBoundingClientRect();
    const requestedScale = 2;
    const estimatedPixels = rect.width * rect.height * requestedScale * requestedScale;
    const scale =
      estimatedPixels > MAX_CAPTURE_PIXELS
        ? Math.max(1, Math.sqrt(MAX_CAPTURE_PIXELS / Math.max(1, rect.width * rect.height)))
        : requestedScale;

    const renderCanvas = (captureScale: number): Promise<HTMLCanvasElement> =>
      html2canvas(targetElement as HTMLElement, {
        scale: captureScale,
        useCORS: true,
        // Never allow a tainted canvas: `toDataURL` would throw SecurityError
        // and abort the export. Non-CORS images are skipped instead.
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        windowWidth: 1200, // Standard desktop/A4 preview width
        ignoreElements: (element) => {
          // Exclude interactive screen-only elements, toasts, chat widgets, navigation buttons
          const classList = element.classList;
          return (
            classList.contains('no-print') ||
            classList.contains('screen-only') ||
            classList.contains('chat-widget') ||
            classList.contains('toaster') ||
            classList.contains('toast') ||
            classList.contains('floating-action-button')
          );
        },
        onclone: (clonedDoc, clonedElement) => {
          // Toggle print/preview classes on the CLONED document only, so the
          // live page never flashes print-only elements during capture.
          clonedDoc.body.classList.add('pdf-exporting');
          clonedElement.classList.add('pdf-capture-mode');

          // Force-show print-only sections (QR code, emergency headers, tables)
          clonedElement.querySelectorAll('.print-only').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'block', 'important');
          });
          clonedElement.querySelectorAll('.print-qr-code-box').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'flex', 'important');
          });
          clonedElement.querySelectorAll('.screen-only, .no-print').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'none', 'important');
          });

          // Expand all details/accordions in clone
          clonedElement.querySelectorAll('details').forEach((details) => {
            details.setAttribute('open', 'true');
          });

          // Deterministic light color scheme for the capture.
          const safeColorStyle = clonedDoc.createElement('style');
          safeColorStyle.textContent = `*, ::before, ::after { color-scheme: light !important; }`;
          clonedDoc.head.appendChild(safeColorStyle);
        },
      });

    onProgress?.(45, 'Rendering high-resolution document canvas...');

    let canvas: HTMLCanvasElement;
    try {
      canvas = await renderCanvas(scale);
    } catch (captureErr) {
      // Meaningful reduction (not just the same size) so area-related
      // failures and transient ones are both covered.
      const retryScale = Math.max(1, scale / 1.6);
      console.warn(`PDF capture failed at scale ${scale.toFixed(2)}, retrying at ${retryScale.toFixed(2)}:`, captureErr);
      canvas = await renderCanvas(retryScale);
    }

    onProgress?.(70, 'Building multi-page A4 PDF layout...');

    // 4. Plan page slices. Boundaries are snapped to quiet (blank) rows so
    //    text lines are never cut across pages. The ±1.5% snap window keeps
    //    worst-case overflow inside the bottom margin, clear of the footer.
    const contentHeightPx = Math.round((contentHeightMm / contentWidthMm) * canvas.width);
    const sliceGap = Math.round(contentHeightPx * 0.015); // page-break search window
    const slices: SlicePlan[] = [];
    {
      const base = computeSliceBounds(canvas.height, contentHeightPx);
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < base.length; i++) {
        let slice = base[i];
        const isBoundary = i > 0; // only snap cut points between pages
        if (isBoundary && ctx && slice.height > sliceGap * 2) {
          try {
            const searchTop = Math.max(0, slice.top - sliceGap);
            const stripHeight = Math.min(sliceGap * 2 + 1, canvas.height - searchTop);
            const strip = ctx.getImageData(0, searchTop, canvas.width, stripHeight);
            const snapped = snapToQuietRow(strip.data, canvas.width, {
              stripTop: searchTop,
              desiredY: slice.top,
              radius: sliceGap,
            });
            if (snapped > slice.top && snapped < slice.top + slice.height - 1) {
              const prev = slices[slices.length - 1];
              slice = { top: snapped, height: base[i].top + base[i].height - snapped };
              if (prev) prev.height = snapped - prev.top;
            }
          } catch (snapErr) {
            console.warn('Page-break quiet-row detection skipped:', snapErr);
          }
        }
        slices.push({ ...slice });
      }
    }

    // Defensive: fall back to plain slicing if snapping broke invariants.
    const plan = isValidSlicePlan(slices, canvas.height)
      ? slices
      : computeSliceBounds(canvas.height, contentHeightPx);

    // 5. Rasterize each page from the source canvas with real margins
    //    (content never touches the page edge, including on pages 2+).
    const pdf = new jsPDF({
      orientation: orientation === 'portrait' ? 'p' : 'l',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageCanvasWidth = canvas.width;
    const pageCanvasHeight = Math.round((page.height / contentWidthMm) * canvas.width);
    const marginTopPx = Math.round((marginY / page.height) * pageCanvasHeight);
    const footerOffsetMm = 4.5; // footer baseline inside the bottom margin

    const rasterizeSlice = (slice: SlicePlan): string => {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = pageCanvasWidth;
      pageCanvas.height = pageCanvasHeight;
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) throw new Error('Unable to allocate A4 page buffer for PDF export.');
      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvasWidth, pageCanvasHeight);
      pageCtx.drawImage(canvas, 0, slice.top, canvas.width, slice.height, 0, marginTopPx, canvas.width, slice.height);
      return pageCanvas.toDataURL('image/jpeg', 0.92);
    };

    plan.forEach((slice, index) => {
      if (index > 0) pdf.addPage('a4', orientation === 'portrait' ? 'p' : 'l');
      const pageData = rasterizeSlice(slice);
      pdf.addImage(pageData, 'JPEG', 0, 0, page.width, page.height, undefined, 'FAST');

      // Vector footer: page numbering & provenance stamp on every page.
      const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text('HAZARDNET BANGLADESH', marginX, page.height - footerOffsetMm);
      pdf.text(`${documentType.toUpperCase()} • ${generated}`, page.width / 2, page.height - footerOffsetMm, { align: 'center' });
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Page ${index + 1} of ${plan.length}`, page.width - marginX, page.height - footerOffsetMm, { align: 'right' });
    });

    onProgress?.(90, 'Finalizing and saving PDF file...');

    // 6. Save generated PDF
    pdf.save(filename);

    onProgress?.(100, 'PDF export complete!');
    onComplete?.();
  } catch (err: unknown) {
    console.error('PDF export failed:', err);
    const message = errorMessage(err);
    const friendly =
      message.includes('SecurityError') || message.toLowerCase().includes('tainted')
        ? 'PDF export was blocked by browser security (cross-origin content). Try again or use Print to PDF.'
        : `PDF export failed: ${message}`;
    onError?.(err instanceof Error ? err : new Error(friendly));
    throw err instanceof Error ? err : new Error(friendly);
  }
}
