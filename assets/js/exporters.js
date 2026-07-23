/* ======================================================================
   BLUEPRINT VIEWER 2.0 — exporters.js
   ----------------------------------------------------------------------
   Utilidades genericas de descarga / compartir de archivos (blobs).
   Ya no depende de html2canvas: los documentos que se comparten o
   descargan ahora son PDFs reales generados por pdfgen.js, no capturas
   de pantalla. Este modulo solo sabe entregar un blob al usuario.
   ====================================================================== */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Comparte un archivo via Web Share API (con el blob adjunto si el
 * navegador lo soporta). Si no hay soporte, cae a un enlace de
 * WhatsApp con el texto — igual que en la version 1.
 */
export async function shareFile(blob, filename, mime, shareText, shareTitle) {
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title: shareTitle, text: shareText });
      return true;
    }
  } catch (err) {
    if (err.name === "AbortError") return true;
    console.warn("Share nativo fallo, uso respaldo:", err);
  }
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, "_blank");
  return false;
}
