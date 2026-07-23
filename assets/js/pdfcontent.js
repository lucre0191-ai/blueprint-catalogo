/* ======================================================================
   BLUEPRINT VIEWER 2.0 — pdfcontent.js
   ----------------------------------------------------------------------
   Reune, a partir de los JSON reales, todo el contenido que necesitan
   los dos generadores de PDF (ficha comercial y especificacion tecnica).
   No dibuja nada: solo arma un objeto de datos limpio. Separarlo de
   pdfgen.js permite probar esta parte sin un navegador real.
   ====================================================================== */

import {
  clean, firstOf, fmtUSD, catalogFor, includedComponents, optionalComponents,
  kitWarrantyYears, kitVisual,
} from "./core.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaGeneracion(date = new Date()) {
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function contactInfo(config) {
  return {
    brand: firstOf(config.Nombre_Comercial_Sistema) || "Blueprint",
    logo: firstOf(config.Logo_URL),
    whatsapp: firstOf(config.WhatsApp_Ventas),
  };
}

function docsForSkus(idx, skus) {
  const docs = [];
  skus.forEach((sku) => {
    const m = idx.mediaBySku.get(sku);
    const b = idx.bibliotecaBySku.get(sku);
    [["Datasheet", m && m.Datasheet], ["Manual", m && m.Manual], ["Catalogo", m && m.Catalogo],
     ["Certificados", m && m.Certificados], ["Video", m && m.Video],
     ["Datasheet", b && b.Datasheet_URL], ["Manual", b && b.Manual_URL],
     ["Certificados", b && b.Certificados_URL], ["Video", b && b.Video_URL]]
      .forEach(([label, url]) => { const u = clean(url); if (u) docs.push({ label, url: u, sku }); });
  });
  return docs;
}

/** Contenido base compartido por ambas fichas. */
function baseContent(idx, data, kitId, market) {
  const kit = idx.kitsById.get(kitId);
  if (!kit) return null;
  const config = data.config || {};
  const catalog = catalogFor(idx, kitId, market);
  const included = includedComponents(idx, kitId);
  const optional = optionalComponents(idx, kitId);
  const warranty = kitWarrantyYears(idx, kitId);
  const name = firstOf(catalog && catalog.Nombre_Comercial, kit.Nombre_Comercial);
  // Imagen propia del kit, nunca la de un componente en solitario (ver
  // kitVisual() en core.js — misma regla que usan las tarjetas y la
  // ficha del kit). Si no hay foto propia, heroMosaic trae hasta 3
  // fotos de componentes para que pdfgen.js las dibuje como una
  // pequeña grilla rotulada "Componentes principales", nunca como si
  // fuera LA foto del kit. Si tampoco hay eso, ambos quedan vacios y
  // el PDF simplemente omite el bloque de imagen.
  const visual = kitVisual(catalog);
  const heroImage = visual.image;
  const heroMosaic = visual.mosaic;

  return {
    kitId, kit, catalog, included, optional, warranty, name, heroImage, heroMosaic,
    market: market || (catalog && catalog.Mercado) || null,
    contact: contactInfo(config),
    generatedAt: new Date(),
  };
}

/** Ficha comercial: pensada para vender. */
export function commercialContent(idx, data, kitId, market) {
  const base = baseContent(idx, data, kitId, market);
  if (!base) return null;
  const { kit, catalog, included, optional, warranty } = base;

  const tagline = firstOf(catalog && catalog.Subtitulo, catalog && catalog.Descripcion_Corta, kit.Cliente_Objetivo);
  const feedText = firstOf(catalog && catalog.Que_Puede_Alimentar, kit.Aplicaciones);
  const applications = feedText ? feedText.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const benefitsText = catalog && catalog.Beneficios_Comerciales;
  const benefits = benefitsText
    ? benefitsText.split(".").map((s) => s.trim()).filter(Boolean)
    : [];

  const specs = [
    ["Potencia de panel", kit.Potencia_Panel_kW ? `${kit.Potencia_Panel_kW} kW` : null],
    ["Potencia de inversor", kit.Potencia_Inversor_kW ? `${kit.Potencia_Inversor_kW} kW` : null],
    ["Capacidad de bateria", kit.Bateria_kWh ? `${kit.Bateria_kWh} kWh` : null],
    ["Garantia", warranty ? `${warranty} años` : null],
  ].filter(([, v]) => v);

  return {
    ...base,
    docKind: "comercial",
    docLabel: "Ficha comercial",
    tagline,
    applications,
    benefits,
    specs,
    autonomia: kit.Autonomia_Aprox || null,
    price: fmtUSD(kit.Precio_Sugerido_Reventa_USD),
    includedLines: included.map((c) => `${c.Cantidad || 1}× ${c.Descripcion || c.SKU}`),
    optionalLines: optional.map((c) => ({
      label: c.Descripcion || c.SKU,
      meta: [c.Categoria, c.Potencia_W ? `${c.Potencia_W} W` : null].filter(Boolean).join(" · "),
    })),
  };
}

/** Especificacion tecnica: pensada para un ingeniero o cliente tecnico. */
export function technicalContent(idx, data, kitId, market) {
  const base = baseContent(idx, data, kitId, market);
  if (!base) return null;
  const { kit, included, optional, warranty } = base;

  const specs = [
    ["Potencia de panel", kit.Potencia_Panel_kW ? `${kit.Potencia_Panel_kW} kW` : null],
    ["Potencia de inversor", kit.Potencia_Inversor_kW ? `${kit.Potencia_Inversor_kW} kW` : null],
    ["Capacidad de bateria", kit.Bateria_kWh ? `${kit.Bateria_kWh} kWh` : null],
    ["Autonomia estimada", kit.Autonomia_Aprox],
    ["Garantia (max. componente)", warranty ? `${warranty} años` : null],
    ["Tipo de sistema", kit.Tipo_Sistema],
  ].filter(([, v]) => v);

  function componentRow(c) {
    return [
      c.SKU,
      c.Categoria || "—",
      [c.Marca, c.Modelo].filter(Boolean).join(" ") || "—",
      String(c.Cantidad || 1),
      c.Potencia_W ? `${c.Potencia_W} W` : (c.Capacidad_kWh ? `${c.Capacidad_kWh} kWh` : "—"),
      c.Voltaje && c.Voltaje !== "-" ? c.Voltaje : "—",
      c.Garantia_Anios ? `${c.Garantia_Anios} a.` : "—",
    ];
  }

  const componentRows = included.map(componentRow);
  const optionalRows = optional.map(componentRow);
  const docs = docsForSkus(idx, included.map((c) => c.SKU));

  return {
    ...base,
    docKind: "tecnica",
    docLabel: "Especificacion tecnica",
    specs,
    componentHeaders: ["SKU", "Categoria", "Marca / Modelo", "Cant.", "Potencia / Cap.", "Voltaje", "Garantia"],
    componentRows,
    optionalRows,
    docs,
  };
}
