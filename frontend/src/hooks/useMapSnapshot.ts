import { useState, useCallback } from 'react';
import html2canvas from 'html2canvas-pro';
import toast from 'react-hot-toast';
import L from 'leaflet';
import { iconMarkup } from '../lib/iconMarkup';

export interface UseMapSnapshotOptions {
  exportScale?: number;
  exportFormat?: 'png' | 'jpeg';
  includeWatermarkHeader?: boolean;
  includeOverlayLegend?: boolean;
  customReportTitle?: string;
  baseMapName?: string;
  selectedInfo?: string;
  activeOverlayNames?: string;
}

export function useMapSnapshot(
  mapContainerRef: React.RefObject<HTMLDivElement | null>,
  mapInstanceRef?: React.RefObject<L.Map | null>,
  defaultOptions: UseMapSnapshotOptions = {}
) {
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState<boolean>(false);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  const generateMapSnapshot = useCallback(
    async (optionsOverride?: Partial<UseMapSnapshotOptions> & { overrideScale?: number }) => {
      if (!mapContainerRef.current) return;

      const opts = { ...defaultOptions, ...optionsOverride };
      const targetScale = optionsOverride?.overrideScale !== undefined ? optionsOverride.overrideScale : opts.exportScale ?? 3;
      const exportFormat = opts.exportFormat || 'png';
      const includeWatermarkHeader = opts.includeWatermarkHeader !== false;
      const includeOverlayLegend = opts.includeOverlayLegend !== false;
      const customReportTitle = opts.customReportTitle || 'Bangladesh Multi-Hazard Geospatial Intelligence Report';
      const baseMapName = opts.baseMapName || 'Satellite HD';
      const selectedInfo = opts.selectedInfo || 'Bangladesh National Overview';
      const activeOverlayNames = opts.activeOverlayNames || 'Baseline Vector Boundaries';

      setIsGeneratingSnapshot(true);
      setIsExportingMap(true);

      try {
        if (mapInstanceRef?.current) {
          mapInstanceRef.current.invalidateSize();
        }

        await new Promise((resolve) => setTimeout(resolve, 350));

        const captureTarget = mapContainerRef.current;
        const timestampStr = new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        const executeHtml2Canvas = async (scaleToUse: number): Promise<HTMLCanvasElement> => {
          return await html2canvas(captureTarget, {
            useCORS: true,
            allowTaint: false,
            scale: scaleToUse,
            backgroundColor: '#1d1d1f',
            logging: false,
            imageTimeout: 12000,
            ignoreElements: (element) => {
              return element.classList.contains('no-export-snapshot');
            },
            onclone: (clonedDoc) => {
              // Note: html2canvas-pro parses modern color functions (oklch,
              // oklab, color()) natively — no CSS color sanitization needed.

              // Set crossOrigin = 'anonymous' on all tile images in clonedDoc
              const clonedImgs = clonedDoc.querySelectorAll('img');
              clonedImgs.forEach((img) => {
                img.crossOrigin = 'anonymous';
              });

              // 3. Inject safe fallback styles
              const oklchFixStyle = clonedDoc.createElement('style');
              oklchFixStyle.innerHTML = `
                *, ::before, ::after {
                  color-scheme: light;
                }
                :root {
                  --background: #ffffff;
                  --foreground: #1d1d1f;
                  --card: #ffffff;
                  --card-foreground: #1d1d1f;
                  --primary: #1d1d1f;
                  --primary-foreground: #fafafc;
                  --secondary: #f5f5f7;
                  --secondary-foreground: #1d1d1f;
                  --muted: #f5f5f7;
                  --muted-foreground: #6e6e73;
                  --border: #e0e0e0;
                  --input: #e0e0e0;
                }
              `;
              clonedDoc.head.appendChild(oklchFixStyle);

              const clonedContainer = clonedDoc.querySelector('.leaflet-container') as HTMLElement | null;
              if (clonedContainer) {
                clonedContainer.style.position = 'relative';

                // Render Official Report Header Watermark
                if (includeWatermarkHeader) {
                  const headerDiv = clonedDoc.createElement('div');
                  headerDiv.style.cssText = `
                    position: absolute;
                    top: 16px;
                    left: 16px;
                    right: 16px;
                    z-index: 999999;
                    background: rgba(15, 23, 42, 0.95);
                    color: #ffffff;
                    border: 2px solid #333333;
                    border-radius: 20px;
                    padding: 16px 20px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    box-shadow: 0 25px 30px -5px rgba(0,0,0,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                  `;

                  const escapeHtml = (str: string) =>
                    String(str || '')
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');

                  const escapedTitle = escapeHtml(customReportTitle);
                  const escapedLocation = escapeHtml(selectedInfo);
                  const escapedBaseMap = escapeHtml(baseMapName);
                  const escapedTimestamp = escapeHtml(timestampStr);
                  const escapedOverlays = escapeHtml(activeOverlayNames);

                  headerDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <div style="width: 48px; height: 48px; border-radius: 14px; background: #c01f1f; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 24px; color: #1d1d1f; border: 2px solid #ffffff; flex-shrink: 0;">
                        ${iconMarkup('Shield', { size: 24 })}
                      </div>
                      <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="background: #c01f1f; color: #1d1d1f; font-weight: 900; font-size: 12px; padding: 2px 9px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                            HAZARDNET AI GEOSPATIAL REPORT
                          </span>
                          <span style="font-size: 12px; color: #a1a1a6; font-family: monospace;">
                            VERIFIED SNAPSHOT
                          </span>
                        </div>
                        <h2 style="font-size: 18px; font-weight: 900; color: #ffffff; margin: 4px 0 0 0; letter-spacing: -0.02em;">
                          ${escapedTitle}
                        </h2>
                        <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px; font-size: 12px; color: #d2d2d7;">
                          <span style="display: inline-flex; align-items: center; gap: 4px;">${iconMarkup('MapPin', { size: 14 })}<strong>Location Focus:</strong> ${escapedLocation}</span>
                          <span>•</span>
                          <span style="display: inline-flex; align-items: center; gap: 4px;">${iconMarkup('Radio', { size: 14 })}<strong>Tile Engine:</strong> ${escapedBaseMap}</span>
                        </div>
                      </div>
                    </div>

                    <div style="text-align: right; border-left: 1px solid #333333; padding-left: 16px; font-size: 12px; color: #a1a1a6;">
                      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; font-family: monospace; font-size: 12px; color: #0066cc; font-weight: 700;">
                        ${iconMarkup('Clock', { size: 14 })}${escapedTimestamp}
                      </div>
                      <div style="margin-top: 4px; font-size: 12px; color: #d2d2d7; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        Active Layers: ${escapedOverlays}
                      </div>
                    </div>
                  `;

                  clonedContainer.appendChild(headerDiv);
                }

                // Render High-Resolution Bottom-Left Legend Overlay
                if (includeOverlayLegend) {
                  const legendDiv = clonedDoc.createElement('div');
                  legendDiv.style.cssText = `
                    position: absolute;
                    bottom: 20px;
                    left: 20px;
                    z-index: 999999;
                    background: rgba(15, 23, 42, 0.95);
                    color: #ffffff;
                    border: 1.5px solid #333333;
                    border-radius: 16px;
                    padding: 12px 16px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.6);
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                  `;

                  legendDiv.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333333; padding-bottom: 6px;">
                      <strong style="color: #c01f1f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Multi-Hazard Severity Key</strong>
                      <span style="color: #a1a1a6; font-size: 12px; font-family: monospace;">HazardNet v2.4</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #c01f1f; box-shadow: 0 0 6px #c01f1f;"></span>
                        <span style="font-weight: 700; color: #ff6b60;">High Risk (≥80%)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #8a5a00; box-shadow: 0 0 6px #8a5a00;"></span>
                        <span style="font-weight: 700; color: #f5b73d;">Moderate (50-79%)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #1d7a3e; box-shadow: 0 0 6px #1d7a3e;"></span>
                        <span style="font-weight: 700; color: #4ad66d;">Low Risk (<50%)</span>
                      </div>
                    </div>
                  `;

                  clonedContainer.appendChild(legendDiv);
                }
              }
            },
          });
        };

        let canvas: HTMLCanvasElement;
        try {
          canvas = await executeHtml2Canvas(targetScale);
        } catch (scaleErr) {
          console.warn(`html2canvas failed at scale ${targetScale}, retrying with fallback scale 1.5:`, scaleErr);
          canvas = await executeHtml2Canvas(1.5);
        }

        const mimeType = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        setCapturedPreviewUrl(dataUrl);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              setCapturedBlob(blob);
            }
          },
          mimeType,
          0.95
        );

        setExportSuccessMsg('High-resolution map snapshot ready!');
        return dataUrl;
      } catch (err) {
        console.error('Failed to capture map snapshot:', err);
        toast.error('Failed to capture map image. Please try again.');
        throw err;
      } finally {
        setIsGeneratingSnapshot(false);
        setIsExportingMap(false);
      }
    },
    [defaultOptions, mapContainerRef, mapInstanceRef]
  );

  const handleDownloadImage = useCallback(
    (customFilename?: string) => {
      if (!capturedPreviewUrl) return;
      const exportFormat = defaultOptions.exportFormat || 'png';
      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = customFilename || `HazardNet_MapReport_${dateStr}.${exportFormat}`;

      const downloadLink = document.createElement('a');
      downloadLink.href = capturedPreviewUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      toast.success(`High-resolution report saved as ${filename}`);
    },
    [capturedPreviewUrl, defaultOptions.exportFormat]
  );

  const handleCopyImageToClipboard = useCallback(async () => {
    if (!capturedBlob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ [capturedBlob.type || 'image/png']: capturedBlob });
        await navigator.clipboard.write([item]);
        setCopySuccessMsg('High-resolution map image copied to clipboard!');
        toast.success('Copied map image to clipboard! Ready to paste into reports or messages.');
        setTimeout(() => setCopySuccessMsg(null), 4000);
      } else {
        toast.error('Browser clipboard copy not supported. Please use Download.');
      }
    } catch (err) {
      console.error('Clipboard copy error:', err);
      toast.error('Could not copy image to clipboard. Try downloading instead.');
    }
  }, [capturedBlob]);

  const handleShareReport = useCallback(async () => {
    if (!capturedBlob) return;
    const exportFormat = defaultOptions.exportFormat || 'png';
    const customReportTitle = defaultOptions.customReportTitle || 'HazardNet Report';
    const selectedInfo = defaultOptions.selectedInfo || 'All Districts';

    try {
      const filename = `HazardNet_Report_${Date.now()}.${exportFormat}`;
      const file = new File([capturedBlob], filename, { type: capturedBlob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: customReportTitle,
          text: `HazardNet High-Resolution Geospatial Hazard Report for Bangladesh. Active Location: ${selectedInfo}.`,
          files: [file],
        });
        toast.success('Hazard report shared successfully!');
      } else {
        handleDownloadImage();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
        toast.error('Sharing failed or was cancelled.');
      }
    }
  }, [capturedBlob, defaultOptions, handleDownloadImage]);

  const clearSnapshot = useCallback(() => {
    setCapturedPreviewUrl(null);
    setCapturedBlob(null);
    setExportSuccessMsg(null);
    setCopySuccessMsg(null);
  }, []);

  return {
    generateMapSnapshot,
    handleDownloadImage,
    handleCopyImageToClipboard,
    handleShareReport,
    clearSnapshot,
    capturedPreviewUrl,
    capturedBlob,
    isGeneratingSnapshot,
    isExportingMap,
    exportSuccessMsg,
    copySuccessMsg,
    setExportSuccessMsg,
    setCopySuccessMsg,
  };
}
