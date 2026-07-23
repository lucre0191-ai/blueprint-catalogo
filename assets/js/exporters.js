/* ======================================================================
   BLUEPRINT VIEWER 2.0 — exporters.js
   Descargar como imagen / PDF y compartir nativo. Usa html2canvas +
   jsPDF via CDN (cargados como <script defer> en index.html, sin
   instalar nada — se mantiene igual que en la version 1). Funciona
   sobre cualquier tarjeta o ficha, no solo sobre kit-card.
   ====================================================================== */

export async function captureElement(el, bgVar = "--bg-surface") {
  if (typeof window.html2canvas === "undefined") {
    throw new Error("html2canvas no cargo (revisa conexion / CDN bloqueado)");
  }
  const actionBar = el.querySelector("[data-export-hide]");
  const prevDisplay = actionBar ? actionBar.style.display : null;
  if (actionBar) actionBar.style.display = "none";
  try {
    return await window.html2canvas(el, {
      backgroundColor: getComputedStyle(document.body).getPropertyValue(bgVar) || "#0a0f1c",
      scale: 2,
      useCORS: true,
    });
  } finally {
    if (actionBar) actionBar.style.display = prevDisplay;
  }
}

export function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function downloadAsImage(el, filename) {
  try {
    const canvas = await captureElement(el);
    downloadCanvas(canvas, filename);
  } catch (err) {
    alert("No se pudo generar la imagen: " + err.message);
  }
}

export async function downloadAsPDF(el, filename) {
  try {
    if (!window.jspdf) throw new Error("jsPDF no cargo (revisa conexion / CDN bloqueado)");
    const canvas = await captureElement(el);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const ratio = canvas.height / canvas.width;
    const w = pageW - 60;
    const h = w * ratio;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 30, 30, w, h);
    pdf.save(filename);
  } catch (err) {
    alert("No se pudo generar el PDF: " + err.message);
  }
}

export async function shareElement(el, filename, shareText, shareTitle) {
  try {
    const canvas = await captureElement(el);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], filename, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: shareTitle, text: shareText });
      return;
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    console.warn("Share nativo fallo, uso respaldo:", err);
  }
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, "_blank");
}
