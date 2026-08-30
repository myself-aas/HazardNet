import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import {
  formatFilenameWithPlaceholders,
  PdfFilenameContext,
  AVAILABLE_FILENAME_PLACEHOLDERS,
  FILENAME_PRESET_TEMPLATES,
} from './pdfFilenameUtils';

export * from './pdfFilenameUtils';

// A4 dimensions in millimeters (ISO 216 standard)
const A4_DIMENSIONS = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
};

// Canvas pixel limits for mobile / Safari memory safety (keep below 16Mpx)
const MAX_CAPTURE_PIXELS = 14000000;

export interface PdfExportOptions {
  filename?: string;
  filenameTemplate?: string;
  filenameContext?: PdfFilenameContext;
  title?: string;
  documentType?: string;
  elementId?: string;
  customElement?: HTMLElement;
  orientation?: 'portrait' | 'landscape';
  inkSaver?: boolean;
  onStart?: () => void;
  onProgress?: (percent: number, stage: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface SlicePlan {
  top: number;
  height: number;
}

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};

/**
 * High-Fidelity PDF Exporter for HazardNet Bangladesh
 * Generates official SOD 2019 compliant disaster directives, situation reports,
 * and agromet advisory handouts with vector headers, footers, QR telemetry, and ink-friendly contrast.
 */
export async function exportElementToPdf(options: PdfExportOptions = {}): Promise<void> {
  const {
    filename = 'HazardNet_{docType}_{region}_{date}.pdf',
    filenameTemplate,
    filenameContext = {},
    title = 'HazardNet Emergency Directive',
    documentType = 'Emergency Advisory Bulletin',
    elementId,
    customElement,
    orientation = 'portrait',
    inkSaver = false,
    onStart,
    onProgress,
    onComplete,
    onError,
  } = options;

  // Resolve template placeholders if template or context is provided
  const mergedContext: PdfFilenameContext = {
    documentType,
    docType: documentType,
    ...filenameContext,
  };

  let resolvedFilename = filenameTemplate
    ? formatFilenameWithPlaceholders(filenameTemplate, mergedContext)
    : formatFilenameWithPlaceholders(filename, mergedContext);

  if (!resolvedFilename.toLowerCase().endsWith('.pdf')) {
    resolvedFilename += '.pdf';
  }

  const page = A4_DIMENSIONS[orientation];
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
      targetElement = (document.querySelector('.max-w-[840px]') ||
        document.querySelector('.max-w-7xl') ||
        document.body) as HTMLElement;
    }

    if (!targetElement) {
      throw new Error(`Target element "${elementId || 'default'}" for PDF export could not be located in document.`);
    }

    onProgress?.(25, 'Applying official print styling & QR telemetry tags...');

    // 2. Ensure web fonts are fully loaded
    try {
      if (document.fonts) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
    } catch {
      // Best-effort font readiness
    }

    // 3. Adaptive resolution scaling for crisp A4 output
    const rect = targetElement.getBoundingClientRect();
    const effectiveWidth = rect.width > 0 ? rect.width : (orientation === 'landscape' ? 1120 : 800);
    const effectiveHeight = rect.height > 0 ? rect.height : 1200;
    const requestedScale = 2;
    const estimatedPixels = effectiveWidth * effectiveHeight * requestedScale * requestedScale;
    const scale =
      estimatedPixels > MAX_CAPTURE_PIXELS
        ? Math.max(1.2, Math.sqrt(MAX_CAPTURE_PIXELS / Math.max(1, effectiveWidth * effectiveHeight)))
        : requestedScale;

    const renderCanvas = (captureScale: number): Promise<HTMLCanvasElement> =>
      html2canvas(targetElement as HTMLElement, {
        scale: captureScale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        windowWidth: orientation === 'landscape' ? 1280 : 880,
        ignoreElements: (element) => {
          const classList = element.classList;
          return (
            classList.contains('no-print') ||
            classList.contains('screen-only') ||
            classList.contains('chat-widget') ||
            classList.contains('toaster') ||
            classList.contains('toast') ||
            classList.contains('lucide-maximize-2') ||
            classList.contains('lucide-minimize-2') ||
            classList.contains('floating-action-button') ||
            classList.contains('leaflet-control-container') ||
            classList.contains('leaflet-top') ||
            classList.contains('leaflet-bottom')
          );
        },
        onclone: (clonedDoc, clonedElement) => {
          // A. Unwrap all scroll constraints and fixed max-heights on the clone and all parent ancestors
          let curr: HTMLElement | null = clonedElement;
          while (curr && curr !== clonedDoc.body) {
            curr.style.setProperty('max-height', 'none', 'important');
            curr.style.setProperty('height', 'auto', 'important');
            curr.style.setProperty('overflow', 'visible', 'important');
            curr.style.setProperty('position', 'static', 'important');
            curr.style.setProperty('transform', 'none', 'important');
            curr = curr.parentElement;
          }

          // B. Configure standardized print width on clonedElement
          const standardPrintWidth = orientation === 'landscape' ? '1120px' : '820px';
          clonedElement.style.setProperty('width', standardPrintWidth, 'important');
          clonedElement.style.setProperty('max-width', '100%', 'important');
          clonedElement.style.setProperty('box-sizing', 'border-box', 'important');
          clonedElement.style.setProperty('background', '#ffffff', 'important');
          clonedElement.style.setProperty('color', '#0f172a', 'important');
          clonedElement.style.setProperty('padding', '24px', 'important');
          clonedElement.style.setProperty('margin', '0 auto', 'important');

          // C. Force-show print-only sections (QR code, emergency headers, tables)
          clonedDoc.body.classList.add('pdf-exporting');
          clonedElement.classList.add('pdf-capture-mode');

          clonedElement.querySelectorAll('.print-only').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'block', 'important');
          });
          clonedElement.querySelectorAll('.print-qr-code-box').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'flex', 'important');
          });
          clonedElement.querySelectorAll('.screen-only, .no-print, button:not(.print-keep)').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'none', 'important');
          });

          // D. Uncollapse all details, accordions, and hidden sections
          clonedElement.querySelectorAll('details').forEach((details) => {
            details.setAttribute('open', 'true');
          });
          clonedElement.querySelectorAll('[hidden]').forEach((hiddenEl) => {
            hiddenEl.removeAttribute('hidden');
          });

          // E. Ensure all SVG elements and icons render crisply with explicit stroke/fill
          clonedElement.querySelectorAll('svg').forEach((svg) => {
            svg.style.setProperty('overflow', 'visible', 'important');
            svg.style.setProperty('display', 'inline-block', 'important');
            svg.style.setProperty('shape-rendering', 'geometricPrecision', 'important');
          });

          // Set crossOrigin = 'anonymous' on all images in clonedDoc
          clonedDoc.querySelectorAll('img').forEach((img) => {
            img.crossOrigin = 'anonymous';
          });

          // F. Inject deterministic print-mode CSS overrides
          const printStyleSheet = clonedDoc.createElement('style');
          printStyleSheet.textContent = `
            *, ::before, ::after {
              color-scheme: light !important;
              text-shadow: none !important;
              box-shadow: none !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box !important;
            }
            :root {
              --background: #ffffff;
              --foreground: #0f172a;
              --card: #ffffff;
              --card-foreground: #0f172a;
              --primary: #0f172a;
              --primary-foreground: #f8fafc;
              --secondary: #f1f5f9;
              --secondary-foreground: #0f172a;
              --muted: #f1f5f9;
              --muted-foreground: #64748b;
              --border: #e2e8f0;
              --input: #e2e8f0;
            }
            body {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: "Times New Roman", Times, serif !important;
              font-size: 12pt !important;
              line-height: 1.5 !important;
            }
            .pdf-capture-mode {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: "Times New Roman", Times, serif !important;
              font-size: 12pt !important;
              line-height: 1.5 !important;
            }
            .bg-white, .bg-slate-50, .bg-slate-100, .bg-slate-900, .bg-slate-950, [class*="bg-slate-"] {
              background-color: ${inkSaver ? '#ffffff' : '#ffffff'} !important;
              color: #0f172a !important;
              border-color: #cbd5e1 !important;
            }
            h1, h2, h3, h4, h5, h6 {
              color: #0f172a !important;
              font-weight: 800 !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            h1 { font-size: 18pt !important; font-weight: bold !important; line-height: 1.3 !important; margin: 0 0 10pt 0 !important; }
            h2 { font-size: 16pt !important; font-weight: bold !important; line-height: 1.35 !important; margin: 15pt 0 8pt 0 !important; }
            h3 { font-size: 14pt !important; font-weight: bold !important; line-height: 1.4 !important; margin: 12pt 0 6pt 0 !important; }
            h4 { font-size: 12pt !important; font-weight: bold !important; line-height: 1.45 !important; margin: 8pt 0 4pt 0 !important; }
            p, span, li, td, th {
              font-size: 12pt !important;
              line-height: 1.5 !important;
              color: #1e293b !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              border: 1.5px solid #0f172a !important;
            }
            th, td {
              border: 1px solid #cbd5e1 !important;
              padding: 6px 8px !important;
              color: #0f172a !important;
            }
            thead,
            .print-table-emergency-header,
            thead tr.print-table-emergency-header {
              display: table-header-group !important;
            }
            .print-table-emergency-header th,
            th.emergency-protocol-title {
              background-color: #0f172a !important;
              color: #ffffff !important;
              font-family: 'JetBrains Mono', monospace, ui-monospace, sans-serif !important;
              font-size: 8pt !important;
              font-weight: 900 !important;
              text-transform: uppercase !important;
              letter-spacing: 0.06em !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .chart-card, .upazila-card {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }
            .phased-step-card, .sop-step, .emergency-contact-card, .chart-card, .upazila-card, .metric-card, .impact-metric-pill, .pagination-protected, #sec-telemetry .chart-card, #sec-hazard-trend .chart-card {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              break-inside: avoid-page !important;
            }
            .upazila-grid {
              display: grid !important;
              grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
              gap: 1rem !important;
            }
            .upazila-card {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              break-inside: avoid-page !important;
              padding: 10pt 12pt !important;
              margin-bottom: 0 !important;
              box-sizing: border-box !important;
            }
            .chart-card,
            .recharts-responsive-container,
            .recharts-wrapper,
            .recharts-surface,
            #sec-telemetry .chart-card,
            #sec-hazard-trend .chart-card {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
              transform: scale(0.9) !important;
              transform-origin: top left !important;
              width: 111.11% !important;
              overflow: hidden !important;
            }
          `;
          clonedDoc.head.appendChild(printStyleSheet);
        },
      });

    onProgress?.(50, 'Rendering high-resolution document canvas...');

    let canvas: HTMLCanvasElement;
    try {
      canvas = await renderCanvas(scale);
    } catch (captureErr) {
      const retryScale = Math.max(1.1, scale / 1.5);
      console.warn(`PDF capture failed at scale ${scale.toFixed(2)}, retrying at ${retryScale.toFixed(2)}:`, captureErr);
      canvas = await renderCanvas(retryScale);
    }

    onProgress?.(72, 'Assembling multi-page A4 PDF layout...');

    // 4. Plan page slices with quiet row snapping (prevents cutting text lines)
    const contentHeightPx = Math.round((contentHeightMm / contentWidthMm) * canvas.width);
    const sliceGap = Math.round(contentHeightPx * 0.025); // 2.5% search window for quiet rows

    const slices: SlicePlan[] = [];
    {
      const base = computeSliceBounds(canvas.height, contentHeightPx);
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < base.length; i++) {
        let slice = base[i];
        const isBoundary = i > 0;
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

            if (snapped > slice.top - sliceGap && snapped < slice.top + slice.height - 1) {
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

    // Fallback if snapping breached invariants
    const plan = isValidSlicePlan(slices, canvas.height)
      ? slices
      : computeSliceBounds(canvas.height, contentHeightPx);

    // 5. Build jsPDF document with real margins and crisp vector headers/footers
    const pdf = new jsPDF({
      orientation: orientation === 'portrait' ? 'p' : 'l',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageCanvasWidth = canvas.width;
    const pageCanvasHeight = Math.round((page.height / contentWidthMm) * canvas.width);
    const marginTopPx = Math.round((marginY / page.height) * pageCanvasHeight);
    const footerOffsetMm = 5.0; // mm from page bottom

    const rasterizeSlice = (slice: SlicePlan): string => {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = pageCanvasWidth;
      pageCanvas.height = pageCanvasHeight;
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) throw new Error('Unable to allocate A4 page canvas buffer for PDF export.');

      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvasWidth, pageCanvasHeight);
      pageCtx.drawImage(
        canvas,
        0,
        slice.top,
        canvas.width,
        slice.height,
        0,
        marginTopPx,
        canvas.width,
        slice.height
      );
      return pageCanvas.toDataURL('image/jpeg', 0.94);
    };

    const dispatchRef = `HN-BD-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const generatedDateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const generatedTimeStr = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    plan.forEach((slice, index) => {
      if (index > 0) {
        pdf.addPage('a4', orientation === 'portrait' ? 'p' : 'l');
      }

      // Draw high-resolution rasterized slice
      const pageData = rasterizeSlice(slice);
      pdf.addImage(pageData, 'JPEG', 0, 0, page.width, page.height, undefined, 'FAST');

      // Top subtle running header for pages 2+
      if (index > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(71, 85, 105); // slate-600
        pdf.text('HAZARDNET BANGLADESH • SOD 2019 DISASTER DIRECTIVE', marginX, 6.5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`REF: ${dispatchRef}`, page.width - marginX, 6.5, { align: 'right' });
      }

      // Bottom Vector Footer: Reference, SOD 2019 Compliance Stamp, BST Time, Page Numbering
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text('HAZARDNET BANGLADESH', marginX, page.height - footerOffsetMm);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(
        `${documentType.toUpperCase()} • DISPATCH ${dispatchRef} • ${generatedDateStr} ${generatedTimeStr} BST`,
        page.width / 2,
        page.height - footerOffsetMm,
        { align: 'center' }
      );

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`Page ${index + 1} of ${plan.length}`, page.width - marginX, page.height - footerOffsetMm, {
        align: 'right',
      });
    });

    onProgress?.(92, 'Finalizing and saving PDF file...');

    // 6. Save generated PDF
    pdf.save(resolvedFilename);
    onProgress?.(100, 'PDF export complete!');
    onComplete?.();
  } catch (err: unknown) {
    console.error('PDF export failed:', err);
    const message = errorMessage(err);
    const friendly =
      message.includes('SecurityError') || message.toLowerCase().includes('tainted')
        ? 'PDF export was blocked by browser security (cross-origin content). Use direct Print to PDF.'
        : `PDF export failed: ${message}`;
    onError?.(err instanceof Error ? err : new Error(friendly));
    throw err instanceof Error ? err : new Error(friendly);
  }
}

/**
 * Fallback baseline slice calculation (strict mathematical cuts).
 */
function computeSliceBounds(totalHeightPx: number, maxSliceHeightPx: number): SlicePlan[] {
  const slices: SlicePlan[] = [];
  let currentTop = 0;
  while (currentTop < totalHeightPx) {
    const height = Math.min(maxSliceHeightPx, totalHeightPx - currentTop);
    slices.push({ top: currentTop, height });
    currentTop += height;
  }
  return slices;
}

/**
 * Verify that a slice plan covers the exact full height with no gaps or overlaps.
 */
function isValidSlicePlan(slices: SlicePlan[], totalHeightPx: number): boolean {
  if (slices.length === 0) return totalHeightPx === 0;
  if (slices[0].top !== 0) return false;
  let expectedTop = 0;
  for (const s of slices) {
    if (s.top !== expectedTop) return false;
    if (s.height <= 0) return false;
    expectedTop += s.height;
  }
  return expectedTop === totalHeightPx;
}

/**
 * Find the most "quiet" (empty or whitespace) horizontal row of pixels to snap a page break cleanly.
 */
function snapToQuietRow(
  imageData: Uint8ClampedArray,
  width: number,
  options: { stripTop: number; desiredY: number; radius: number }
): number {
  const { stripTop, desiredY, radius } = options;
  const height = imageData.length / (width * 4);
  let bestY = desiredY;
  let minNoise = Infinity;

  for (let y = 0; y < height; y++) {
    let rowNoise = 0;
    const offset = y * width * 4;
    // Scan every 3rd pixel in the row for fast detection
    for (let x = 0; x < width; x += 3) {
      const idx = offset + x * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const a = imageData[idx + 3];
      // A pixel is considered noisy if it is darker than subtle paper gray
      if (a > 15 && (r < 245 || g < 245 || b < 245)) {
        rowNoise++;
      }
    }

    const absoluteY = stripTop + y;
    // Weight earlier rows slightly so we prefer cutting above a heading rather than below it
    const biasToPrevious = (desiredY - absoluteY) * 0.05;
    const score = rowNoise + Math.abs(absoluteY - desiredY) * 0.08 + (absoluteY > desiredY ? 5 : biasToPrevious);

    if (score < minNoise) {
      minNoise = score;
      bestY = absoluteY;
    }

    if (minNoise === 0 && absoluteY <= desiredY) {
      break; // Found a perfectly quiet whitespace row above the cut line
    }
  }

  return Math.min(Math.max(bestY, desiredY - radius), desiredY + radius);
}
