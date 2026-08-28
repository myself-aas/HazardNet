import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

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

/**
 * High-resolution Client-Side PDF Exporter for Official Disaster Management Bulletins & Advisories.
 * Respects all HazardNet print-media CSS directives:
 * - SOD 2019 Government Emergency Headers
 * - Vector QR Codes for live field telemetry mobile scanning
 * - 'Last Updated' BST timestamps and currency validity tags
 * - Multi-page pagination with clean ink-friendly contrast
 */
export async function exportElementToPdf(options: PdfExportOptions = {}): Promise<void> {
  const {
    filename = `HazardNet_Emergency_Directive_${new Date().toISOString().slice(0, 10)}.pdf`,
    elementId,
    customElement,
    orientation = 'portrait',
    onStart,
    onProgress,
    onComplete,
    onError,
  } = options;

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

    // 2. Add temporary PDF export class to ensure print-only elements (QR code, emergency headers, tables) are visible
    document.body.classList.add('pdf-exporting');
    targetElement.classList.add('pdf-capture-mode');

    // Small delay to allow any layout recalculations & SVG QR rendering
    await new Promise((resolve) => setTimeout(resolve, 200));

    onProgress?.(45, 'Rendering high-resolution document canvas...');

    // 3. Render canvas with html2canvas-pro with scale 2 for razor-sharp text & QR code readability
    const canvas = await html2canvas(targetElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
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
        // 1. Ensure all print-only sections are displayed and screen-only elements hidden
        clonedElement.querySelectorAll('.print-only').forEach((el) => {
          (el as HTMLElement).style.setProperty('display', 'block', 'important');
        });
        clonedElement.querySelectorAll('.print-qr-code-box').forEach((el) => {
          (el as HTMLElement).style.setProperty('display', 'flex', 'important');
        });
        clonedElement.querySelectorAll('.screen-only, .no-print').forEach((el) => {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
        });

        // 2. Expand all details/accordions in clone
        clonedElement.querySelectorAll('details').forEach((details) => {
          details.setAttribute('open', 'true');
        });

        // 3. Sanitize any style tags with oklch colors for maximum backward compatibility
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((tag) => {
          try {
            if (tag.textContent && tag.textContent.includes('oklch')) {
              tag.textContent = tag.textContent.replace(/oklch\([^)]+\)/g, '#334155');
            }
          } catch {
            // Ignore sanitization error
          }
        });

        // 4. Inject light color scheme override
        const safeColorStyle = clonedDoc.createElement('style');
        safeColorStyle.innerHTML = `
          *, ::before, ::after {
            color-scheme: light !important;
          }
        `;
        clonedDoc.head.appendChild(safeColorStyle);
      },
    });

    onProgress?.(70, 'Building multi-page A4 PDF layout...');

    // 4. Calculate A4 page dimensions in millimeters
    const pdf = new jsPDF({
      orientation: orientation === 'portrait' ? 'p' : 'l',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = orientation === 'portrait' ? 210 : 297;
    const pageHeight = orientation === 'portrait' ? 297 : 210;
    const marginX = 8;
    const marginY = 10;
    const contentWidth = pageWidth - marginX * 2;
    const contentHeight = pageHeight - marginY * 2;

    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = marginY;
    let pageNumber = 1;

    // Convert full canvas to high quality JPEG/PNG
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // 5. Add First Page
    pdf.addImage(imgData, 'JPEG', marginX, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= contentHeight;

    // 6. Handle Multi-Page Slicing if content exceeds single A4 page
    while (heightLeft > 0) {
      position = marginY - pageNumber * contentHeight;
      pdf.addPage('a4', orientation === 'portrait' ? 'p' : 'l');
      pageNumber++;
      pdf.addImage(imgData, 'JPEG', marginX, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= contentHeight;
    }

    onProgress?.(90, 'Finalizing and saving PDF file...');

    // 7. Save generated PDF
    pdf.save(filename);

    onProgress?.(100, 'PDF export complete!');
    onComplete?.();
  } catch (err: any) {
    console.error('PDF export failed:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    // Cleanup temporary classes
    document.body.classList.remove('pdf-exporting');
    const allCaptures = document.querySelectorAll('.pdf-capture-mode');
    allCaptures.forEach((el) => el.classList.remove('pdf-capture-mode'));
  }
}
