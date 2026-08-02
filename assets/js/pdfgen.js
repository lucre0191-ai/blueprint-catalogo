/* ======================================================================
   BLUEPRINT VIEWER 2.0 — pdfgen.js
   ----------------------------------------------------------------------
   Motor de composicion de PDF con la API nativa de dibujo de jsPDF
   (texto, rectangulos, imagenes) — NO es una captura de pantalla.
   Cada documento se arma en el momento a partir de los datos que
   entrega pdfcontent.js, asi que cualquier cambio futuro en el Excel
   / los JSON se refleja automaticamente sin tocar este archivo.

   Expone:
     generateCommercialPDF(idx, data, kitId, market) -> descarga el PDF
     generateTechnicalPDF(idx, data, kitId, market)  -> descarga el PDF
     shareCommercialPDF(idx, data, kitId, market, config) -> comparte el PDF
   ====================================================================== */

import { slug, whatsappLink } from "./core.js";
import { commercialContent, technicalContent, fechaGeneracion } from "./pdfcontent.js";
import { downloadBlob, shareFile } from "./exporters.js";

const PAGE_W = 595.28; // A4 en puntos
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = [26, 30, 36];
const MUTED = [110, 118, 128];
const LINE = [223, 227, 232];
const PANEL = [246, 247, 245];
const ACCENT = [245, 166, 35]; // amber de marca
const BADGE_WARR_BG = [222, 242, 234];
const BADGE_WARR_FG = [21, 122, 74];
const BADGE_QTY_BG = [253, 240, 219];
const BADGE_QTY_FG = [158, 98, 15];

/** Envoltura sobre jsPDF con helpers de layout con salto de pagina
 *  automatico — asi el generador no depende de cuantos componentes
 *  tenga un kit hoy ni de cuantos tenga en el futuro. */
class DocWriter {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
  }

  ensure(h) {
    // El pie de pagina se dibuja aparte (drawFooters) por debajo del
    // margen inferior, asi que aqui solo se deja un respiro minimo.
    if (this.y + h > PAGE_H - MARGIN - 6) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  gap(h = 10) {
    this.y += h;
  }

  rule() {
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.75);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 16;
  }

  eyebrow(text) {
    this.ensure(16);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...ACCENT);
    this.doc.text(text.toUpperCase(), MARGIN, this.y);
    this.y += 16;
  }

  h1(text) {
    this.ensure(30);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(21);
    this.doc.setTextColor(...INK);
    const lines = this.doc.splitTextToSize(text, CONTENT_W);
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * 25 + 4;
  }

  h2(text) {
    // Un poco de aire antes del titulo si no estamos justo al inicio
    // de la pagina (evita que un bloque anterior -tabla, grilla- lo toque).
    if (this.y > MARGIN + 4) this.y += 8;
    this.ensure(24);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.setTextColor(...INK);
    this.doc.text(text, MARGIN, this.y);
    this.y += 18;
  }

  p(text, opts = {}) {
    if (!text) return;
    const size = opts.size || 10.5;
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.color || MUTED));
    const width = opts.width || CONTENT_W;
    const lines = this.doc.splitTextToSize(text, width);
    const lh = size * 1.38;
    this.ensure(lines.length * lh);
    this.doc.text(lines, opts.x || MARGIN, this.y);
    this.y += lines.length * lh + (opts.gap ?? 4);
  }

  bullets(items, opts = {}) {
    if (!items || !items.length) return;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...MUTED);
    items.forEach((raw) => {
      const it = typeof raw === "string" ? raw : raw.label;
      const lines = this.doc.splitTextToSize(it, CONTENT_W - 16);
      const lh = 14;
      this.ensure(lines.length * lh + 2);
      this.doc.setFillColor(...ACCENT);
      this.doc.circle(MARGIN + 3, this.y - 3.5, 1.6, "F");
      this.doc.setTextColor(...INK);
      this.doc.text(lines, MARGIN + 14, this.y);
      this.y += lines.length * lh + 2;
      if (typeof raw === "object" && raw.meta) {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8.5);
        this.doc.setTextColor(...MUTED);
        const metaLines = this.doc.splitTextToSize(raw.meta, CONTENT_W - 16);
        this.ensure(metaLines.length * 11);
        this.doc.text(metaLines, MARGIN + 14, this.y);
        this.y += metaLines.length * 11 + 2;
        this.doc.setFontSize(10.5);
      }
    });
    this.y += 4;
  }

  /** Tarjetas de especificacion en grilla (2 o 3 columnas). */
  specGrid(pairs, cols = 2) {
    if (!pairs.length) return;
    const gutter = 8;
    const colW = CONTENT_W / cols;
    const rowH = 38;
    const rows = Math.ceil(pairs.length / cols);
    this.ensure(rows * rowH);
    pairs.forEach(([k, v], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MARGIN + col * colW;
      const y = this.y + row * rowH;
      this.doc.setDrawColor(...LINE);
      this.doc.setFillColor(...PANEL);
      this.doc.roundedRect(x, y, colW - gutter, rowH - gutter, 3, 3, "FD");
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(k.toUpperCase(), x + 8, y + 13);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(11);
      this.doc.setTextColor(...INK);
      const vLines = this.doc.splitTextToSize(String(v), colW - gutter - 16);
      this.doc.text(vLines[0], x + 8, y + 27);
    });
    this.y += rows * rowH + 6;
  }

  /** Tabla simple con anchos de columna fijos y repeticion de cabecera
   *  al saltar de pagina. */
  table(headers, colWidths, rows) {
    const rowH = 20;
    const startPage = this.doc.internal.getCurrentPageInfo().pageNumber;
    const startY = this.y;
    const drawHeader = () => {
      this.ensure(rowH + 6);
      this.doc.setFillColor(...INK);
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.doc.setTextColor(255, 255, 255);
      let x = MARGIN + 6;
      headers.forEach((h, i) => {
        this.doc.text(h, x, this.y + 13);
        x += colWidths[i];
      });
      this.y += rowH;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      this.ensure(rowH);
      if (this.y === MARGIN) drawHeader(); // repite cabecera tras salto de pagina
      if (ri % 2 === 1) {
        this.doc.setFillColor(...PANEL);
        this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.3);
      this.doc.setTextColor(...INK);
      let x = MARGIN + 6;
      row.forEach((cell, i) => {
        const txt = this.doc.splitTextToSize(String(cell), colWidths[i] - 8)[0] || "";
        this.doc.text(txt, x, this.y + 13.5);
        x += colWidths[i];
      });
      this.y += rowH;
    });
    // El borde perimetral solo se dibuja si la tabla completa quedo en
    // una sola pagina (si hubo salto, el calculo de altura ya no aplica
    // a una sola caja rectangular — el sombreado alterno de filas sigue
    // marcando la estructura igual de bien).
    const endPage = this.doc.internal.getCurrentPageInfo().pageNumber;
    if (endPage === startPage) {
      this.doc.setDrawColor(...LINE);
      this.doc.rect(MARGIN, startY, CONTENT_W, this.y - startY);
    }
    this.y += 12;
  }

  /** Incrusta una imagen manteniendo proporcion. No lanza si falla:
   *  el documento sigue siendo util aunque una foto no cargue.
   *  Se reescala primero (resizedDataURL) a ~2x el tamano final en el
   *  PDF: las fotos Hero originales pueden pesar 1-2 MB a resolucion
   *  completa, innecesario para un recuadro de unos cientos de puntos.
   *  Sin esto, un PDF con varias fotos termina pesando varios MB — poco
   *  practico para compartir por WhatsApp. */
  async image(url, maxW, maxH) {
    try {
      const dataUrl = await fetchAsDataURL(url);
      const dims = await imageDimensions(dataUrl);
      let w = maxW;
      let h = (maxW * dims.h) / dims.w;
      if (h > maxH) {
        h = maxH;
        w = (maxH * dims.w) / dims.h;
      }
      this.ensure(h + 10);
      const { dataUrl: embedUrl } = await resizedDataURL(url, w * 2, h * 2, { cover: false, quality: 0.82 });
      this.doc.addImage(embedUrl, "JPEG", MARGIN, this.y, w, h);
      this.y += h + 12;
      return true;
    } catch (err) {
      console.warn("No se pudo incrustar imagen en el PDF:", url, err);
      return false;
    }
  }

  /** Fila de componente con foto real (Documento 06 / pedido directo de
   *  la propietaria, modelo de referencia SunEvo): miniatura cuadrada +
   *  nombre/marca-modelo/specs + una insignia de garantia y una de
   *  cantidad, coloreadas. Antes esta lista era solo texto plano
   *  ("6× Panel SunEvo 590W HBD"); ahora cada componente se ve como en
   *  el catalogo de referencia que subio la propietaria. Si la foto no
   *  carga, cae a un recuadro vacio — el documento nunca se rompe por
   *  una imagen faltante. */
  async componentRow(c) {
    const rowH = 50;
    const thumbSize = 40;
    const badgeW = 58;
    const badgeH = 18;
    const badgeGap = 6;
    this.ensure(rowH + 8);
    const startY = this.y;
    const thumbX = MARGIN;

    let drewImage = false;
    if (c.Imagen) {
      try {
        // cover:true = recorta al centro para llenar el cuadrado (misma
        // idea que object-fit:cover en la web); reescalado a ~3x el
        // tamano final en puntos, de sobra para que se vea nitida sin
        // arrastrar la foto de producto completa (a veces >1 MB) a un
        // recuadro de 40x40pt.
        const { dataUrl } = await resizedDataURL(c.Imagen, thumbSize * 3, thumbSize * 3, { cover: true, quality: 0.78 });
        this.doc.addImage(dataUrl, "JPEG", thumbX, startY, thumbSize, thumbSize);
        drewImage = true;
      } catch (err) {
        console.warn("No se pudo incrustar imagen del componente:", c.Imagen, err);
      }
    }
    if (!drewImage) {
      this.doc.setDrawColor(...LINE);
      this.doc.setFillColor(...PANEL);
      this.doc.roundedRect(thumbX, startY, thumbSize, thumbSize, 3, 3, "FD");
    }

    const hasWarranty = typeof c.Garantia_Anios === "number";
    const badgesCount = hasWarranty ? 2 : 1;
    const badgesTotalW = badgesCount * badgeW + (badgesCount - 1) * badgeGap;
    const textX = thumbX + thumbSize + 10;
    const textW = CONTENT_W - thumbSize - 10 - badgesTotalW - 10;

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.setTextColor(...INK);
    const title = c.Descripcion || c.SKU;
    const titleLines = this.doc.splitTextToSize(title, textW);
    this.doc.text(titleLines[0] || "", textX, startY + 15);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.setTextColor(...MUTED);
    const marcaModelo = [c.Marca, c.Modelo].filter(Boolean).join(" ");
    const specParts = [
      c.Potencia_W ? `${c.Potencia_W} W` : (typeof c.Capacidad_kWh === "number" ? `${c.Capacidad_kWh} kWh` : null),
      c.Voltaje && c.Voltaje !== "-" ? c.Voltaje : null,
    ].filter(Boolean);
    const metaLine = [c.Categoria, marcaModelo, ...specParts].filter(Boolean).join(" · ");
    const metaLines = this.doc.splitTextToSize(metaLine, textW);
    this.doc.text(metaLines.slice(0, 2), textX, startY + 28);

    let bx = PAGE_W - MARGIN - badgesTotalW;
    const badgeY = startY + (thumbSize - badgeH) / 2;
    if (hasWarranty) {
      this.doc.setFillColor(...BADGE_WARR_BG);
      this.doc.roundedRect(bx, badgeY, badgeW, badgeH, 9, 9, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...BADGE_WARR_FG);
      this.doc.text(`${c.Garantia_Anios} años`, bx + badgeW / 2, badgeY + 12.5, { align: "center" });
      bx += badgeW + badgeGap;
    }
    this.doc.setFillColor(...BADGE_QTY_BG);
    this.doc.roundedRect(bx, badgeY, badgeW, badgeH, 9, 9, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    this.doc.setTextColor(...BADGE_QTY_FG);
    this.doc.text(`${c.Cantidad || 1}×`, bx + badgeW / 2, badgeY + 12.5, { align: "center" });

    this.y = startY + rowH;
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN, this.y - 6, PAGE_W - MARGIN, this.y - 6);
  }

  /** Lista de componentes con foto — ver componentRow(). Se recorre en
   *  secuencia (no en paralelo) para no saturar de golpe la carga de
   *  imagenes ni desordenar el salto de pagina, que depende de this.y. */
  async componentList(items) {
    if (!items || !items.length) return;
    for (const c of items) {
      await this.componentRow(c);
    }
    this.y += 4;
  }

  /** Grilla de hasta 3 fotos de componentes — el mismo fallback que usa
   *  la web (kitVisual() en core.js) cuando el kit no tiene foto propia:
   *  mejor mostrar sus piezas principales que dejar el documento sin
   *  imagen, pero siempre como una grilla rotulada, nunca como si una
   *  sola de esas fotos fuera "la foto del kit". */
  async imageMosaic(urls, maxW, maxH, caption) {
    const tiles = urls.slice(0, 3);
    if (!tiles.length) return false;
    const gap = 4;
    const tileW = (maxW - gap * (tiles.length - 1)) / tiles.length;
    this.ensure(maxH + 22);
    const startY = this.y;
    let drew = false;
    for (let i = 0; i < tiles.length; i++) {
      const x = MARGIN + i * (tileW + gap);
      try {
        const dataUrl = await fetchAsDataURL(tiles[i]);
        const format = /png/i.test(tiles[i]) ? "PNG" : "JPEG";
        this.doc.addImage(dataUrl, format, x, startY, tileW, maxH);
        drew = true;
      } catch (err) {
        console.warn("No se pudo incrustar imagen del mosaico:", tiles[i], err);
        this.doc.setDrawColor(...LINE);
        this.doc.setFillColor(...PANEL);
        this.doc.rect(x, startY, tileW, maxH, "FD");
      }
    }
    this.y = startY + maxH;
    if (caption) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(caption.toUpperCase(), MARGIN, this.y + 10);
      this.y += 18;
    } else {
      this.y += 8;
    }
    return drew;
  }
}

function fetchAsDataURL(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
}

function imageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function loadImageEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Descarga una imagen y la reescala/recomprime a un tamano de pixeles
 *  razonable (via canvas) antes de que se incruste en el PDF. Las fotos
 *  reales (Hero generado por IA o fotos de producto de fabricante)
 *  suelen pesar cientos de KB o mas de 1 MB a resolucion original —
 *  innecesario cuando van a mostrarse en un recuadro chico del
 *  documento. Sin este paso, un PDF con varias fotos termina pesando
 *  varios MB, poco practico para compartir por WhatsApp.
 *  `cover:true` recorta al centro para llenar el recuadro exacto (como
 *  object-fit:cover, para miniaturas cuadradas); `cover:false` encoge
 *  la imagen completa sin recortar (como object-fit:contain, para la
 *  foto Hero, que no debe perder ningun borde). */
async function resizedDataURL(url, targetW, targetH, { cover = true, quality = 0.78 } = {}) {
  const original = await fetchAsDataURL(url);
  const img = await loadImageEl(original);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext("2d");
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  if (cover) {
    const scale = Math.max(canvas.width / iw, canvas.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  } else {
    const scale = Math.min(canvas.width / iw, canvas.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.fillStyle = "#f6f7f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), w: canvas.width, h: canvas.height };
}

/** Encabezado de marca: logo vectorial (siempre disponible, no depende
 *  de que exista una imagen de logo real) + nombre + tipo de documento. */
function drawLetterhead(w, content) {
  const { doc } = w;
  doc.setFillColor(...ACCENT);
  doc.circle(MARGIN + 6, MARGIN - 2, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(content.contact.brand, MARGIN + 18, MARGIN + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(content.docLabel.toUpperCase(), PAGE_W - MARGIN, MARGIN - 4, { align: "right" });
  doc.text(`Generado: ${fechaGeneracion(content.generatedAt)}`, PAGE_W - MARGIN, MARGIN + 8, { align: "right" });

  w.y = MARGIN + 22;
  w.rule();
}

function drawFooters(doc, contact) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - MARGIN + 6, PAGE_W - MARGIN, PAGE_H - MARGIN + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const contactBits = [
      contact.contactName ? `Contacto: ${contact.contactName}` : null,
      contact.whatsapp ? `WhatsApp: ${contact.whatsapp}` : null,
    ].filter(Boolean);
    const contactLine = contactBits.length ? contactBits.join(" · ") : contact.brand;
    doc.text(contactLine, MARGIN, PAGE_H - MARGIN + 18);
    doc.text(`Pagina ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 18, { align: "right" });
  }
}

function newDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
}

/* ----------------------------------------------------------------------
   Ficha comercial — pensada para vender.
   -------------------------------------------------------------------- */
export async function buildCommercialDoc(idx, data, kitId, market) {
  const content = commercialContent(idx, data, kitId, market);
  if (!content) return null;
  const doc = newDoc();
  const w = new DocWriter(doc);

  drawLetterhead(w, content);

  w.eyebrow(content.market ? `Kit ${content.kit.Linea || ""} · ${content.market}` : content.kit.Linea || "Kit solar");
  w.h1(content.name);
  if (content.tagline) w.p(content.tagline, { size: 12, color: INK, gap: 10 });

  if (content.heroImage) {
    await w.image(content.heroImage, CONTENT_W, 180);
  } else if (content.heroMosaic.length) {
    await w.imageMosaic(content.heroMosaic, CONTENT_W, 140, "Componentes principales");
  }

  if (content.price) {
    w.ensure(40);
    doc.setFillColor(...INK);
    doc.roundedRect(MARGIN, w.y, 220, 34, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(230, 230, 230);
    doc.text("VALOR DEL SISTEMA", MARGIN + 10, w.y + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...ACCENT);
    doc.text(`USD $${content.price}`, MARGIN + 10, w.y + 27);
    w.y += 44;
    // Nota de variacion (pedido directo de la propietaria, solo en el
    // PDF -- el sitio publico muestra el precio limpio, sin esta letra
    // chica; ver conversacion 2026-08-02).
    w.p("Precio referencial, sujeto a confirmacion final por un asesor.", { size: 8, color: MUTED, gap: 2 });
  }

  if (content.applications.length) {
    w.h2("Que puede alimentar");
    w.bullets(content.applications);
  }

  if (content.benefits.length) {
    w.h2("Beneficios");
    w.bullets(content.benefits);
  }

  if (content.specs.length) {
    w.h2("Especificaciones principales");
    w.specGrid(content.specs, 2);
  }

  if (content.included.length) {
    w.h2("Componentes incluidos");
    await w.componentList(content.included);
  }

  if (content.optional.length) {
    w.h2("Accesorios compatibles (ampliaciones opcionales)");
    await w.componentList(content.optional);
  }

  w.ensure(90); // manda el bloque de contacto completo a la siguiente pagina si no cabe entero
  w.rule();
  w.h2("Contacto");
  w.p(content.contact.brand, { bold: true, color: INK, size: 11, gap: 2 });
  if (content.contact.contactName) {
    w.p(`Contacto: ${content.contact.contactName}`, { size: 10, gap: 2 });
  }
  if (content.contact.whatsapp) {
    w.p(`WhatsApp: ${content.contact.whatsapp}`, { size: 10, gap: 2 });
  }

  drawFooters(doc, content.contact);
  return { doc, content };
}

/* ----------------------------------------------------------------------
   Especificacion tecnica — pensada para un ingeniero o cliente tecnico.
   -------------------------------------------------------------------- */
export async function buildTechnicalDoc(idx, data, kitId, market) {
  const content = technicalContent(idx, data, kitId, market);
  if (!content) return null;
  const doc = newDoc();
  const w = new DocWriter(doc);

  drawLetterhead(w, content);

  w.eyebrow(content.market ? `Kit ${content.kit.Linea || ""} · ${content.market}` : content.kit.Linea || "Kit solar");
  w.h1(content.name);
  w.p(`ID de kit: ${content.kitId}`, { size: 9, color: MUTED, gap: 10 });

  if (content.heroImage) {
    await w.image(content.heroImage, 240, 160);
  } else if (content.heroMosaic.length) {
    await w.imageMosaic(content.heroMosaic, 240, 120, "Componentes principales");
  }

  if (content.specs.length) {
    w.h2("Especificaciones del sistema");
    w.specGrid(content.specs, 2);
  }

  if (content.included.length) {
    w.h2("Componentes incluidos (BOM)");
    await w.componentList(content.included);
  }

  if (content.optional.length) {
    w.h2("Accesorios / ampliaciones opcionales");
    await w.componentList(content.optional);
  }

  if (content.docs.length) {
    w.h2("Documentacion tecnica de referencia");
    w.bullets(content.docs.map((d) => `${d.label} — ${d.sku}: ${d.url}`));
  }

  w.ensure(90);
  w.rule();
  w.h2("Contacto tecnico");
  w.p(content.contact.brand, { bold: true, color: INK, size: 11, gap: 2 });
  if (content.contact.contactName) {
    w.p(`Contacto: ${content.contact.contactName}`, { size: 10, gap: 2 });
  }
  if (content.contact.whatsapp) {
    w.p(`WhatsApp: ${content.contact.whatsapp}`, { size: 10, gap: 2 });
  }

  drawFooters(doc, content.contact);
  return { doc, content };
}

function ensureJsPDF() {
  if (!window.jspdf) throw new Error("jsPDF no cargo (revisa conexion / CDN bloqueado)");
}

export async function generateCommercialPDF(idx, data, kitId, market) {
  try {
    ensureJsPDF();
    const result = await buildCommercialDoc(idx, data, kitId, market);
    if (!result) throw new Error("No se encontro el kit");
    result.doc.save(`ficha-comercial-${slug(result.content.name)}.pdf`);
  } catch (err) {
    alert("No se pudo generar la ficha comercial: " + err.message);
  }
}

export async function generateTechnicalPDF(idx, data, kitId, market) {
  try {
    ensureJsPDF();
    const result = await buildTechnicalDoc(idx, data, kitId, market);
    if (!result) throw new Error("No se encontro el kit");
    result.doc.save(`especificacion-tecnica-${slug(result.content.name)}.pdf`);
  } catch (err) {
    alert("No se pudo generar la especificacion tecnica: " + err.message);
  }
}

/** Comparte la ficha comercial como archivo PDF real (no una captura). */
export async function shareCommercialPDF(idx, data, kitId, market) {
  try {
    ensureJsPDF();
    const result = await buildCommercialDoc(idx, data, kitId, market);
    if (!result) throw new Error("No se encontro el kit");
    const blob = result.doc.output("blob");
    const filename = `ficha-comercial-${slug(result.content.name)}.pdf`;
    const text = result.content.contact.whatsapp
      ? `Ficha comercial: ${result.content.name}`
      : result.content.name;
    await shareFile(blob, filename, "application/pdf", text, result.content.name);
  } catch (err) {
    console.warn("No se pudo compartir el PDF, uso enlace de WhatsApp:", err);
  }
}
