/* ======================================================================
   BLUEPRINT VIEWER 2.0 — catalog-pdf.js
   ----------------------------------------------------------------------
   PUB-06 V2 · Catalogo Comercial de Captacion (Plano 03, Documento 06 V2
   "Rediseño del renderer PDF sin reconstruir el sistema"). Genera en el
   navegador, sin backend, un PDF de captacion comercial: selector por
   necesidad, identidad de 3 componentes por kit fijo (bateria, inversor,
   paneles, con foto real), trazabilidad de la operacion, personalizacion
   por vendedor y CTA final con QR — 10 a 12 paginas con el dataset actual.

   Este archivo SUSTITUYE la experiencia visual/narrativa de la V1 (Doc 06
   v1.1) pero conserva su arquitectura de datos completa: mismos JSON
   publicados, mismo motor de dibujo (DocWriter/pdfgen.js), mismas reglas
   duras de "nunca precios" (ver mas abajo). No crea un catalogo paralelo.

   Reglas duras de este modulo (Documento 06 V2, secciones 0, 5, 16, 25):
   - JAMAS precios, EXW/FOB/CIF, costo aterrizado, flete, costo de
     contenedor, margen, comision, contingencia, gasto financiero, ROI,
     utilidad o participacion de inversionista. 06_PARAMETROS,
     05_COSTOS_INTERNACIONALES y 07_COTIZADOR son fuente PRIVADA de
     validacion upstream — PUB-06 nunca la lee ni la expone.
   - JAMAS "Cuba" (ni ningun mercado) como identidad exclusiva de Blueprint.
   - JAMAS mencionar Grupo TPG, ni coyuntura politica (Trump/EE.UU./
     sanciones) como narrativa comercial.
   - JAMAS Kit_ID ni seller_id hardcodeado: todo sale de kits.json/
     catalogs.json/kit_components.json/content_blocks.json/config.json/
     sellers.json via core.js.
   - JAMAS repetir cableado/MC4/estructura/combiner por kit: se explican
     UNA SOLA VEZ en la pagina de selector (seccion 4 del documento).
   - El CTA de cada kit conserva su Kit_ID para que un flujo de cotizacion
     futuro (07_COTIZADOR) resuelva el precio vigente sin que PUB-06 lo
     calcule ni lo replique.
   - `seller` (parametro de URL, seccion 10) SOLO se acepta si resuelve
     contra una fila activa real de sellers.json — nunca se confia a
     ciegas ni se escribe HTML sin sanitizar (seccion 10.5).
   - Es ADITIVO: no reemplaza ni toca la ficha comercial por-kit existente
     (pdfgen.js/pdfcontent.js) ni la experiencia visual del sitio.

   Reutiliza el mismo motor de dibujo (DocWriter, constantes de layout,
   helpers de imagen) que ya usa pdfgen.js para la ficha por-kit — nunca
   se duplica la logica de paginacion/dibujo (regla de arquitectura del
   proyecto: "nunca duplicar informacion/logica").
   ====================================================================== */

import {
  loadAll, buildIndices, clean, firstOf, whatsappLink,
  catalogFor, buildKitViewModel, sellerFor, hashQuery,
} from "./core.js";
import {
  DocWriter, newDoc, drawFooters, ensureJsPDF, resizedDataURL,
  PAGE_W, PAGE_H, MARGIN, CONTENT_W, INK, MUTED, LINE, PANEL, ACCENT,
} from "./pdfgen.js";

/* ----------------------------------------------------------------------
   0. COPY fijo — Documento 06 V2. Texto palabra por palabra tal como esta
      en el documento fuente (secciones 3, 4 y 9). El resto del copy
      editorial (encabezados de bloque, disclaimers) vive en
      CONTENT_BLOCKS (grupo CATALOGO_V2) via resolveCatalogBlock() mas
      abajo, con este objeto como ultima red de respaldo si el bloque
      todavia no existe en el Excel.
   -------------------------------------------------------------------- */
const COPY = {
  coverTitle: "Soluciones Energéticas Inteligentes",
  coverSubtitle: "Equipos, asesoría y acompañamiento para tomar una mejor decisión energética.",
  coverClosing: "Tu energía. Tu independencia.",

  valueHeadline: "Comprar energía no debería significar comprar incertidumbre.",
  valueEmphasis: "No se trata solo de saber qué comprar. Se trata de saber qué está pasando con tu operación.",
  blackboxMessage: "Tu compra no debería convertirse en una caja negra después del pago.",

  traceHeadline: "Más visibilidad en cada etapa",
  traceIntro: "Durante la operación puedes recibir, según el alcance contratado:",

  selectorHeadline: "¿Qué necesitas mantener funcionando?",
  selectorIntro: "No tienes que elegir solo por potencia. Podemos ayudarte a configurar la solución según tus cargas, consumo y nivel de respaldo esperado.",
  commonBandHeadline: "Además de los equipos principales, cada sistema se configura con los elementos de integración, protección y montaje que correspondan.",
  commonBandPrecision: "Las cantidades, capacidades y elementos específicos de integración pueden variar según la configuración seleccionada y se confirman en la cotización correspondiente.",

  autonomyNote: "Autonomía orientativa. El resultado real depende de consumo, simultaneidad de cargas, estado de batería, generación disponible y condiciones de uso.",

  criticalHeadline: "Cuando la red falla, tu negocio debe poder continuar.",
  criticalBody: "Diseñada para comercios, MIPYMES y operaciones donde la continuidad eléctrica es fundamental para proteger productividad, servicio e ingresos.",
  criticalFeed: "Cargas críticas y equipos prioritarios del negocio, según evaluación.",
  criticalVariantsNote: "Las marcas y configuraciones se seleccionan según disponibilidad, compatibilidad, alcance y presupuesto de la operación.",

  portableHeadline: "Energía donde la necesitas",
  portableIntro: "Soluciones portátiles listas para usar, sin instalación fija, pensadas para respaldo, movilidad, emergencias y pequeños negocios.",
  portableBenefits: "Sin instalación fija · Fácil transporte · Recarga por red o solar según modelo · Respaldo para movilidad y emergencias",

  supplyHeadline: "Una solución coordinada de principio a fin",
  supplyIntro: "Evaluamos alternativas con proveedores y fabricantes disponibles en distintos mercados de suministro según configuración, disponibilidad, costo y ruta logística.",
  supplyExample: "Suministro internacional · Suministro regional · Comparación de alternativas",

  trustHeadline: "Una operación clara empieza por saber con quién estás trabajando",

  ctaFinalHeadline: "Tu solución comienza con una buena evaluación.",
  ctaFinalQuestions: [
    "¿Qué necesitas mantener funcionando?",
    "¿Durante cuánto tiempo?",
    "¿Es para hogar, negocio o una operación crítica?",
  ],
  ctaFinalButton: "Solicitar evaluación",
  ctaFinalSupport: "Configuración personalizada · Cotización según alcance · Sin precios desactualizados",
  priceAux: "El valor final se confirma para cada operación según configuración, disponibilidad, volumen, origen de suministro, logística vigente y servicios contratados.",
  legalShort: "La información de este catálogo es comercial y orientativa. La configuración final, disponibilidad, marcas, modelos, garantías, autonomía estimada, condiciones logísticas, tiempos y alcance de servicios se confirman en la cotización y documentación de cada operación.",

  kitCtaText: "Solicita una configuración para tu necesidad",
};

/* Bloques 2x2 de "por que acompañado" (Doc 06 V2, seccion 4, PAGINA 2).
   Copy corto y fijo — no vive en Excel porque son 4 frases estructurales,
   no contenido editorial que cambie por Linea o mercado. */
const WHY_BLOCKS = [
  ["Compra con criterio", "Validamos configuración, componentes y condiciones antes de avanzar."],
  ["Negociación directa", "Coordinamos cotizaciones y condiciones con proveedores y fabricantes disponibles."],
  ["Visibilidad logística", "Damos seguimiento a los principales hitos, documentos y actores de la operación dentro del alcance contratado."],
  ["Un solo punto de coordinación", "Reducimos la necesidad de gestionar por separado proveedor, documentación, logística y seguimiento."],
];

/* Timeline de trazabilidad (Doc 06 V2, seccion 4, PAGINA 3). */
const TRACE_STEPS = [
  "COTIZACIÓN", "VALIDACIÓN DE CONFIGURACIÓN", "ORDEN / COMPRA", "PREPARACIÓN",
  "EMBARQUE", "TRANSPORTISTA", "SEGUIMIENTO", "ARRIBO / ALCANCE CONTRATADO",
];
const TRACE_BULLETS = [
  "Confirmación de configuración",
  "Documentación comercial disponible",
  "Información disponible del embarque",
  "Identificación de actores logísticos relevantes",
  "Hitos de seguimiento disponibles",
  "Acompañamiento ante incidencias comerciales, documentales o logísticas",
];
const TRACE_ADDITIONAL = "Nacionalización · Despacho · Transporte en destino · Levantamiento técnico · Instalación · Puesta en marcha · Posventa";

/* Matriz de seleccion por necesidad (Doc 06 V2, seccion 4, PAGINA 4).
   Etiquetas editoriales por Linea -- no son el Nombre_Comercial de un
   kit puntual, son la categoria completa (igual que FAMILY_PROBLEM en la
   V1). Se filtra dinamicamente a las Lineas que de verdad tengan kits
   activos (seccion 18: "no depender de nombres exactos de kit"). */
const NEED_MATRIX = {
  Respaldo: ["Mantener lo esencial", "Respaldo 3K", "Nevera, iluminación, conectividad y equipos esenciales"],
  Continuidad: ["Mayor continuidad", "Continuidad 5K", "Hogar o pequeño negocio con respaldo ampliado"],
  Autonomia: ["Menor dependencia de la red", "Autonomía 5K", "Producción + almacenamiento diario"],
  "Operacion Critica": ["Procesos críticos de negocio", "Operación Crítica 10K", "Cargas prioritarias, productividad y continuidad"],
  Portatil: ["Energía sin instalación fija", "Portátiles", "Emergencias, movilidad y negocio móvil"],
};

const FAMILY_ORDER = ["Respaldo", "Continuidad", "Autonomia", "Operacion Critica", "Portatil"];

/* Fallback comercial por Linea (idem V1, Doc 06 seccion 13) — ultima red
   de seguridad cuando ni el catalogo del kit ni LINEAS_COMERCIALES traen
   descripcion/beneficios todavia. */
const FALLBACK_BY_LINEA = {
  Respaldo: {
    description: "Mantén lo esencial funcionando cuando la red falla: refrigeración, iluminación y conectividad, sin complicarte.",
  },
  Continuidad: {
    description: "Combina generación solar, almacenamiento y respaldo para aprovechar mejor la energía disponible y reducir interrupciones.",
  },
  Autonomia: {
    description: "Genera y almacena tu propia energía para reducir la dependencia de una red inestable.",
  },
  "Operacion Critica": {
    description: "Diseñado para negocios que necesitan continuar operando cuando la red falla.",
  },
  Portatil: {
    description: "Energía lista para usar, sin instalación fija y fácil de mover según la necesidad.",
  },
};

/* Categorias de componente que forman "identidad de 3 protagonistas" en
   kits fijos (Doc 06 V2, seccion 5A) y en portatiles (seccion 6). */
const CAT_BATERIA = "Bateria";
const CAT_INVERSOR = "Inversor";
const CAT_PANEL = "Panel Solar";
const CAT_EV = "Cargador EV";
const CAT_ESTACION = "Estacion Portatil";
const CAT_PANEL_PLEGABLE = "Cargador Solar Plegable";
/* Componentes comunes de conformacion (Doc 06 V2, seccion 5A/12.2-B) —
   se muestran UNA SOLA VEZ en la pagina de selector, nunca por kit. */
const COMMON_CATEGORIES = ["Estructura", "Caja Combinadora", "Cable", "Conector"];
const COMMON_LABELS = {
  Estructura: "Estructura de montaje",
  "Caja Combinadora": "Protecciones · Combiner Box",
  Cable: "Cableado solar",
  Conector: "Conectores MC4",
};

/* Reemplazos obligatorios de copy (Doc 06 V2, seccion 11.1): frases que
   NUNCA deben imprimirse tal cual, aunque vengan de texto editorial en
   Excel (LINEAS_COMERCIALES / catalogs.json), porque son promesas
   absolutas o lenguaje ya corregido por el documento. Se aplican como
   ultima capa de saneamiento, nunca como fuente de contenido nuevo. */
const COPY_REPLACEMENTS = [
  [/carga completa de(l)? negocio/gi, "cargas críticas y equipos prioritarios del negocio, según evaluación"],
  [/nunca te quedar[aá]s sin energ[ií]a/gi, "mayor continuidad energética"],
  [/garantizado/gi, "según condiciones del fabricante"],
  [/seguimiento en tiempo real/gi, "seguimiento de hitos disponibles"],
  [/(posibilidad|capacidad) de vender excedentes?\s*(de energ[ií]a)?\s*a la red/gi,
    "capacidad de operación híbrida y gestión de excedentes cuando la regulación y la configuración de la instalación lo permitan"],
  [/venta de excedentes?\s*(de energ[ií]a)?\s*a la red/gi,
    "gestión de excedentes cuando la regulación y la configuración de la instalación lo permitan"],
];
function sanitizeCommercialText(text) {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of COPY_REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function fechaISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function slugFile(text) {
  return (text || "")
    .toString().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/(^_|_$)/g, "");
}

/* ----------------------------------------------------------------------
   1. DATA — carga y resolucion
   -------------------------------------------------------------------- */

export async function loadCatalogData() {
  const data = await loadAll();
  const idx = buildIndices(data);
  return { idx, data };
}

/** Kits activos agrupados por Linea, mismo gate de publicacion que V1
 *  (soft-gate futuro Estado_Publicacion/Pricing_Validado, Doc 06 v1.1
 *  seccion 5.1 — se mantiene por compatibilidad con el Pricing Engine
 *  privado, aunque V2 no lee esos campos directamente). */
export function resolveActiveKits(idx) {
  const active = (idx.kits || []).filter((k) => {
    if (k.Estado !== "Activo") return false;
    if (k.Estado_Publicacion !== undefined && k.Estado_Publicacion !== null) {
      if (!["Listo", "Publicado"].includes(k.Estado_Publicacion)) return false;
    }
    if (k.Pricing_Validado !== undefined && k.Pricing_Validado !== null) {
      if (!(k.Pricing_Validado === true || k.Pricing_Validado === "Sí" || k.Pricing_Validado === "Si")) return false;
    }
    return true;
  });
  const byLinea = new Map();
  for (const k of active) {
    const key = k.Linea || "Otras";
    if (!byLinea.has(key)) byLinea.set(key, []);
    byLinea.get(key).push(k);
  }
  const order = [...FAMILY_ORDER, ...[...byLinea.keys()].filter((l) => !FAMILY_ORDER.includes(l))];
  return order
    .filter((linea) => byLinea.has(linea))
    .map((linea) => ({
      linea,
      kits: byLinea.get(linea).sort((a, b) =>
        (a.Potencia_Inversor_kW || 0) - (b.Potencia_Inversor_kW || 0) ||
        (a.Precio_Sugerido_Reventa_USD || 0) - (b.Precio_Sugerido_Reventa_USD || 0)
      ),
    }));
}
function familiesToMap(families) {
  return new Map(families.map((f) => [f.linea, f.kits]));
}

/** Texto de un bloque CATALOGO_V2 (content_blocks.json) por su Block_ID
 *  exacto, con el COPY fijo de arriba como red de respaldo si el Excel
 *  todavia no trae ese bloque (mismo patron que resolveServiceText en
 *  V1, generalizado a cualquier ID). */
function resolveCatalogBlock(idx, blockId, fallback) {
  const rows = (idx.contentBlocks || []).filter((b) => b.Block_ID === blockId);
  if (!rows.length) return fallback;
  const es = rows.find((r) => r.Idioma === "Español" || r.Idioma === "Espanol");
  return clean((es || rows[0]).Texto) || fallback;
}

export function resolveCatalogRecord(idx, kitId, market) {
  return catalogFor(idx, kitId, market);
}

/** Copy comercial de un kit, saneado contra las frases prohibidas de la
 *  seccion 11.1 — misma fuente que el resto del sitio (buildKitViewModel),
 *  nunca una segunda fuente de datos. */
export function resolveCommercialCopy(idx, kitId, market) {
  const vm = buildKitViewModel(idx, kitId, { market });
  if (!vm) return null;
  const fb = FALLBACK_BY_LINEA[vm.linea] || null;
  const description = sanitizeCommercialText(firstOf(vm.description, fb && fb.description));
  const beneficiosText = sanitizeCommercialText(vm.beneficios);
  const benefits = beneficiosText
    ? beneficiosText.split(".").map((s) => s.trim()).filter(Boolean)
    : [];
  const feed = (vm.feed || []).map(sanitizeCommercialText);
  const autonomia = sanitizeCommercialText(vm.autonomia);
  return { vm, description, benefits, feed, autonomia };
}

/** Los 3 (o 4, con EV) componentes protagonistas de un kit fijo (Doc 06 V2
 *  seccion 5A). Nunca elige por coincidencia aproximada: agrupa por
 *  Categoria real de kit_components.json. Paneles se agregan (cantidad y
 *  potencia total), porque son varias unidades del mismo modelo. */
function resolveThreeComponents(idx, kitId) {
  const comps = (idx.kitComponents && idx.kitComponents[kitId]) || [];
  const battery = comps.find((c) => c.Categoria === CAT_BATERIA);
  const inverter = comps.find((c) => c.Categoria === CAT_INVERSOR);
  const panels = comps.filter((c) => c.Categoria === CAT_PANEL);
  const ev = comps.find((c) => c.Categoria === CAT_EV);

  const items = [];
  if (battery) {
    items.push({
      label: typeof battery.Capacidad_kWh === "number" ? `${battery.Capacidad_kWh} kWh` : "Batería",
      sublabel: [battery.Marca, battery.Modelo].filter(Boolean).join(" · ") || battery.Descripcion,
      meta: "Batería",
      image: battery.Imagen,
    });
  }
  if (inverter) {
    const kw = typeof inverter.Potencia_W === "number" ? `${(inverter.Potencia_W / 1000).toFixed(inverter.Potencia_W % 1000 ? 1 : 0)} kW` : "Inversor";
    items.push({
      label: kw,
      sublabel: [inverter.Marca, inverter.Modelo].filter(Boolean).join(" · ") || inverter.Descripcion,
      meta: "Inversor",
      image: inverter.Imagen,
    });
  }
  if (panels.length) {
    const count = panels.reduce((n, p) => n + (p.Cantidad || 0), 0);
    const unitW = panels[0].Potencia_W || 0;
    const totalKw = panels.reduce((n, p) => n + (p.Cantidad || 0) * (p.Potencia_W || 0), 0) / 1000;
    items.push({
      label: `${count} × ${unitW} W`,
      sublabel: `${totalKw.toFixed(2)} kWp FV · ${panels[0].Marca || ""}`.trim(),
      meta: "Paneles",
      image: panels[0].Imagen,
    });
  }
  const evItem = ev ? {
    label: typeof ev.Potencia_W === "number" ? `${(ev.Potencia_W / 1000).toFixed(0)} kW` : "Cargador EV",
    sublabel: ev.Descripcion || [ev.Marca, ev.Modelo].filter(Boolean).join(" · "),
    meta: "Cargador EV",
    image: ev.Imagen,
  } : null;

  return { items, evItem };
}

/** Imagen representativa (una sola, real) por categoria comun de
 *  conformacion (Doc 06 V2 seccion 4, banda visual unica) — se recorre
 *  el primer grupo de familias con kits para encontrar la primera imagen
 *  valida de cada categoria. Nunca se repite por kit despues de esto. */
function resolveCommonComponentImages(idx, families) {
  const found = {};
  for (const group of families) {
    for (const kit of group.kits) {
      const comps = (idx.kitComponents && idx.kitComponents[kit.Kit_ID]) || [];
      for (const cat of COMMON_CATEGORIES) {
        if (found[cat]) continue;
        const c = comps.find((x) => x.Categoria === cat && x.Imagen);
        if (c) found[cat] = c.Imagen;
      }
    }
  }
  return found;
}

/** Agrupa los kits de una Linea por "tier" real (Potencia_Inversor_kW) —
 *  base de datos, no de nombre de kit (seccion 18: "no depender de
 *  nombres exactos"). Cada grupo trae su representante (el mas barato,
 *  ya viene ordenado asi por resolveActiveKits) y el resto como variantes
 *  del mismo tier. */
function tierGroups(kits) {
  const byTier = new Map();
  for (const k of kits) {
    const tier = typeof k.Potencia_Inversor_kW === "number" ? k.Potencia_Inversor_kW : 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(k);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, list]) => ({ tier, representative: list[0], siblings: list.slice(1) }));
}

/* ----------------------------------------------------------------------
   2. LAYOUT — helpers propios de PUB-06 V2
   -------------------------------------------------------------------- */

function h1(w, text) {
  w.ensure(34);
  w.doc.setFont("helvetica", "bold");
  w.doc.setFontSize(19);
  w.doc.setTextColor(...INK);
  const lines = w.doc.splitTextToSize(text, CONTENT_W);
  w.doc.text(lines, MARGIN, w.y);
  w.y += lines.length * 23 + 10;
}

/** Grilla 2x2 de bloques grandes con icono minimalista (circulo + texto) —
 *  PAGINA 2 (Doc 06 V2, seccion 4). */
function bigBlockGrid(w, pairs) {
  const { doc } = w;
  const gap = 14;
  const cols = 2;
  const colW = (CONTENT_W - gap) / cols;
  const lineH = 12;

  function cellHeight(desc) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    const lines = doc.splitTextToSize(desc, colW - 28);
    return 46 + lines.length * lineH;
  }
  for (let i = 0; i < pairs.length; i += cols) {
    const rowPairs = pairs.slice(i, i + cols);
    const rowH = Math.max(...rowPairs.map(([, d]) => cellHeight(d)));
    w.ensure(rowH + gap);
    rowPairs.forEach(([title, desc], ci) => {
      const x = MARGIN + ci * (colW + gap);
      doc.setDrawColor(...LINE);
      doc.setFillColor(...PANEL);
      doc.roundedRect(x, w.y, colW, rowH, 8, 8, "FD");
      doc.setFillColor(...ACCENT);
      doc.circle(x + 18, w.y + 20, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(title, x + 30, w.y + 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(...MUTED);
      const lines = doc.splitTextToSize(desc, colW - 28);
      doc.text(lines, x + 14, w.y + 40);
    });
    w.y += rowH + gap;
  }
}

/** Timeline horizontal elegante (nunca texto monoespaciado con flechas) —
 *  PAGINA 3 (Doc 06 V2, seccion 4). Envuelve a 2 filas si no caben los 8
 *  pasos en una sola linea legible. */
function timeline(w, steps) {
  const { doc } = w;
  const perRow = 4;
  const gap = 8;
  const rows = [];
  for (let i = 0; i < steps.length; i += perRow) rows.push(steps.slice(i, i + perRow));
  rows.forEach((row) => {
    const cellW = (CONTENT_W - gap * (row.length - 1)) / row.length;
    w.ensure(46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    row.forEach((step, i) => {
      const x = MARGIN + i * (cellW + gap);
      doc.setFillColor(...INK);
      doc.roundedRect(x, w.y, cellW, 30, 5, 5, "F");
      doc.setTextColor(255, 255, 255);
      const lines = doc.splitTextToSize(step, cellW - 10);
      doc.text(lines, x + cellW / 2, w.y + (lines.length > 1 ? 12 : 18), { align: "center" });
      if (i < row.length - 1) {
        doc.setTextColor(...ACCENT);
        doc.setFontSize(11);
        doc.text("›", x + cellW + gap / 2 - 2, w.y + 19, { align: "center" });
        doc.setFontSize(7.6);
      }
    });
    w.y += 30 + 10;
  });
}

/** Matriz de seleccion por necesidad — tabla de 3 columnas con fondo
 *  alterno, sin bordes pesados (Doc 06 V2 seccion 4, PAGINA 4). */
function needMatrix(w, rows) {
  const { doc } = w;
  const colW = [CONTENT_W * 0.34, CONTENT_W * 0.22, CONTENT_W * 0.44];
  const headers = ["NECESIDAD", "LÍNEA RECOMENDADA", "REFERENCIA FUNCIONAL"];
  w.ensure(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...MUTED);
  let x = MARGIN;
  headers.forEach((hd, i) => { doc.text(hd, x, w.y); x += colW[i]; });
  w.y += 12;
  rows.forEach((row, ri) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    const lines2 = doc.splitTextToSize(row[2], colW[2] - 8);
    const rowH = Math.max(22, lines2.length * 11 + 10);
    w.ensure(rowH);
    if (ri % 2 === 1) {
      doc.setFillColor(...PANEL);
      doc.rect(MARGIN, w.y - 4, CONTENT_W, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(...INK);
    doc.text(row[0], MARGIN + 4, w.y + 8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ACCENT);
    doc.text(row[1], MARGIN + colW[0] + 4, w.y + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(lines2, MARGIN + colW[0] + colW[1] + 4, w.y + 8);
    w.y += rowH;
  });
  w.y += 6;
}

/** Fila de "identidad de 3 (o 4) protagonistas" con imagen real, valor
 *  principal y marca/modelo — Doc 06 V2 seccion 5A. Secuencial (no
 *  paralelo) para no desordenar this.y ni saturar la carga de imagenes. */
async function identityRow(w, items) {
  if (!items.length) return;
  const { doc } = w;
  const n = items.length;
  const gap = 10;
  const colW = (CONTENT_W - gap * (n - 1)) / n;
  const thumb = Math.min(66, colW - 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const maxLabelLines = Math.max(1, ...items.map((it) => doc.splitTextToSize(it.label || "", colW).slice(0, 2).length));
  const rowH = thumb + 22 + maxLabelLines * 11 + 14;
  w.ensure(rowH + 6);
  const startY = w.y;
  for (let i = 0; i < n; i++) {
    const it = items[i];
    const x = MARGIN + i * (colW + gap);
    let drew = false;
    if (it.image) {
      try {
        const { dataUrl } = await resizedDataURL(it.image, thumb * 3, thumb * 3, { cover: true, quality: 0.8 });
        doc.addImage(dataUrl, "JPEG", x, startY, thumb, thumb);
        drew = true;
      } catch (err) {
        console.warn("No se pudo incrustar imagen del componente:", it.image, err);
      }
    }
    if (!drew) {
      doc.setDrawColor(...LINE);
      doc.setFillColor(...PANEL);
      doc.roundedRect(x, startY, thumb, thumb, 4, 4, "FD");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...ACCENT);
    doc.text((it.meta || "").toUpperCase(), x, startY + thumb + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const labelLines = doc.splitTextToSize(it.label || "", colW).slice(0, 2);
    doc.text(labelLines, x, startY + thumb + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...MUTED);
    const subLines = doc.splitTextToSize(it.sublabel || "", colW);
    doc.text(subLines.slice(0, 1), x, startY + thumb + 22 + labelLines.length * 11);
  }
  w.y = startY + rowH;
}

/** Chips compactos que envuelven en varias filas — usado para variantes
 *  de un mismo tier y para servicios adicionales (Doc 06 V2, secciones
 *  5/7: "no repetir cuatro fichas completas"). */
function chipList(w, texts, opts = {}) {
  if (!texts.length) return;
  const { doc } = w;
  const chipH = 20;
  const gap = 6;
  const padX = 8;
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(8.3);
  w.ensure(chipH + 4);
  let x = MARGIN;
  texts.forEach((text) => {
    const tw = doc.getTextWidth(text) + padX * 2;
    if (x + tw > PAGE_W - MARGIN) {
      x = MARGIN;
      w.y += chipH + gap;
      w.ensure(chipH + gap);
    }
    doc.setDrawColor(...LINE);
    doc.setFillColor(...(opts.fill || PANEL));
    doc.roundedRect(x, w.y, tw, chipH, 10, 10, "FD");
    doc.setTextColor(...(opts.color || INK));
    doc.text(text, x + padX, w.y + 13.5);
    x += tw + gap;
  });
  w.y += chipH + 10;
}

/** Dos columnas con vinetas (reutilizado en la pagina de alcance). */
function twoColumnBullets(w, leftTitle, leftItems, rightTitle, rightItems) {
  const { doc } = w;
  const gap = 20;
  const colW = (CONTENT_W - gap) / 2;
  const lineH = 12.5;
  function measure(items, width) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    let hh = 0;
    items.forEach((it) => { hh += doc.splitTextToSize(it, width - 14).length * lineH + 3; });
    return hh;
  }
  const leftH = measure(leftItems, colW);
  const rightH = measure(rightItems, colW);
  const blockH = Math.max(leftH, rightH) + 26;
  w.ensure(blockH);
  const startY = w.y;
  function drawCol(x, title, items) {
    let y = startY;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(title, x, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    items.forEach((it) => {
      const lines = doc.splitTextToSize(it, colW - 14);
      doc.setFillColor(...ACCENT);
      doc.circle(x + 3, y - 3.2, 1.4, "F");
      doc.setTextColor(...INK);
      doc.text(lines, x + 11, y);
      y += lines.length * lineH + 3;
    });
  }
  drawCol(MARGIN, leftTitle, leftItems);
  drawCol(MARGIN + colW + gap, rightTitle, rightItems);
  w.y = startY + blockH;
}

/** Estima (sin dibujar) cuanto ocupa una tarjeta de identidad de kit fijo,
 *  para poder reservar el espacio ENTERO de una vez (Doc 06 V2, seccion
 *  13.1/13.2 — regla KEEP_TOGETHER: nunca empezar un kit si no cabe
 *  completo). No es pixel-perfecto, pero usa el mismo splitTextToSize
 *  que despues dibuja el contenido real, asi que el margen de error es
 *  minimo. */
function estimateFixedKitCardHeight(doc, { hasEv, description, feed }) {
  let hh = 20 + 16; // titulo + linea de configuracion
  hh += 66 + 36 + 10; // identityRow (bateria/inversor/panel [+EV])
  if (description) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.3);
    hh += doc.splitTextToSize(description, CONTENT_W).length * 13 + 8;
  }
  if (feed && feed.length) {
    hh += 14 + Math.min(feed.length, 4) * 13 + 4;
  }
  hh += 24; // nota de autonomia
  hh += 30 + 10; // CTA
  return hh;
}

/** Tarjeta de kit fijo con identidad de 3 (o 4) protagonistas — Doc 06 V2
 *  seccion 5A. `width` permite renderizarla en columna completa o en la
 *  mitad de una pagina comparativa (Paginas 5/6). Nunca dibuja precio
 *  (seccion 16) — el CTA usa el texto de reemplazo fijo. */
async function buildFixedKitCard(w, idx, kit, market, config, { siblingNote } = {}) {
  const { doc } = w;
  const copy = resolveCommercialCopy(idx, kit.Kit_ID, market);
  if (!copy) return;
  const { vm, description, feed, autonomia } = copy;
  const { items, evItem } = resolveThreeComponents(idx, kit.Kit_ID);
  const allItems = evItem ? [...items, evItem] : items;

  // KEEP_TOGETHER: reserva el bloque completo antes de dibujar nada.
  w.ensure(estimateFixedKitCardHeight(doc, { hasEv: !!evItem, description, feed }));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(vm.name, MARGIN, w.y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(vm.id, PAGE_W - MARGIN, w.y, { align: "right" });
  w.y += 15;

  const configParts = [
    vm.bateriaKwh > 0 ? `Batería ${vm.bateriaKwh} kWh` : null,
    vm.tipoSistema ? `Inversor ${vm.tipoSistema === "Hibrido" ? "híbrido" : vm.tipoSistema === "Off-Grid" ? "off-grid" : vm.tipoSistema} ${vm.potenciaInversorKw || ""} kW` : null,
    vm.potenciaPanelKw > 0 ? `${vm.potenciaPanelKw} kWp FV` : null,
  ].filter(Boolean);
  if (configParts.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(...ACCENT);
    doc.text(configParts.join("  ·  "), MARGIN, w.y);
    w.y += 14;
  }

  await identityRow(w, allItems);

  if (description) w.p(description, { size: 9.3, color: INK, gap: 8 });

  if (feed && feed.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("QUÉ PUEDE ALIMENTAR", MARGIN, w.y);
    w.y += 12;
    w.bullets(feed.slice(0, 4));
  }

  if (autonomia) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    const autoLines = doc.splitTextToSize(`Autonomía aproximada: ${autonomia}`, CONTENT_W);
    doc.text(autoLines, MARGIN, w.y);
    w.y += autoLines.length * 11;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const noteLines = doc.splitTextToSize(COPY.autonomyNote, CONTENT_W);
  doc.text(noteLines, MARGIN, w.y);
  w.y += noteLines.length * 9 + 6;

  if (siblingNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.6);
    doc.setTextColor(...MUTED);
    const sLines = doc.splitTextToSize(siblingNote, CONTENT_W);
    doc.text(sLines, MARGIN, w.y);
    w.y += sLines.length * 10 + 4;
  }

  // CTA — nunca precio, siempre el texto de reemplazo fijo (seccion 16).
  w.ensure(20);
  doc.setFillColor(...INK);
  doc.roundedRect(MARGIN, w.y, CONTENT_W, 22, 4, 4, "F");
  const whatsapp = firstOf(config && config.WhatsApp_Ventas);
  const ctaMsg = `Hola, quiero cotizar el kit ${vm.id} — ${vm.name}.`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  if (whatsapp) {
    doc.textWithLink(COPY.kitCtaText, MARGIN + 10, w.y + 14, { url: whatsappLink(whatsapp, ctaMsg) });
  } else {
    doc.text(COPY.kitCtaText, MARGIN + 10, w.y + 14);
  }
  w.y += 30;
  w.rule();
}

/** Version compacta de la tarjeta para paginas comparativas de 2
 *  columnas (Paginas 5 y 6) — dibuja dentro de un ancho de columna, no
 *  del CONTENT_W completo. Reutiliza buildFixedKitCard con un DocWriter
 *  "acotado" temporalmente via override de CONTENT_W no es posible (es
 *  const), asi que en su lugar se dibuja con un offset X y ancho propio
 *  pasado por parametro a las funciones de dibujo de esta seccion. */
function drawQRCode(doc, text, x, y, sizePt) {
  try {
    if (typeof window === "undefined" || !window.qrcode) return false;
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 2;
    const total = count + quiet * 2;
    const cell = sizePt / total;
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, sizePt, sizePt, "F");
    doc.setFillColor(20, 20, 20);
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.35, cell + 0.35, "F");
        }
      }
    }
    return true;
  } catch (err) {
    console.warn("No se pudo generar el codigo QR:", err);
    return false;
  }
}

/* ----------------------------------------------------------------------
   3. PAGINAS
   -------------------------------------------------------------------- */

function pickCoverImage(idx, market, families) {
  for (const group of families) {
    for (const kit of group.kits) {
      const catalog = resolveCatalogRecord(idx, kit.Kit_ID, market);
      const scene = catalog && clean(catalog.Imagen_Hero_Scene);
      if (scene) return scene;
    }
  }
  for (const group of families) {
    for (const kit of group.kits) {
      const catalog = resolveCatalogRecord(idx, kit.Kit_ID, market);
      const img = catalog && clean(catalog.Imagen_Principal);
      if (img) return img;
    }
  }
  return "assets/img/scene-industrial.jpg";
}

async function buildCoverPage(w, idx, market, families, generatedAt, brandName) {
  const { doc } = w;
  doc.setFillColor(...ACCENT);
  doc.circle(MARGIN + 6, MARGIN - 2, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(brandName, MARGIN + 18, MARGIN + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("CATÁLOGO COMERCIAL", PAGE_W - MARGIN, MARGIN - 4, { align: "right" });
  w.y = MARGIN + 44;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  const titleLines = doc.splitTextToSize(COPY.coverTitle, CONTENT_W);
  doc.text(titleLines, MARGIN, w.y);
  w.y += titleLines.length * 33 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...MUTED);
  const subLines = doc.splitTextToSize(COPY.coverSubtitle, CONTENT_W - 40);
  doc.text(subLines, MARGIN, w.y);
  w.y += subLines.length * 17 + 20;

  const coverImg = pickCoverImage(idx, market, families);
  await w.image(coverImg, CONTENT_W, 320);

  w.gap(8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ACCENT);
  doc.text(COPY.coverClosing, MARGIN, w.y);
  w.y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Catálogo comercial · Información actualizada al ${fechaLarga(generatedAt)}`, MARGIN, w.y);
}

function buildWhyPage(w, idx) {
  h1(w, resolveCatalogBlock(idx, "CATV2-VALUE-HEAD-ES", COPY.valueHeadline));
  w.ensure(46);
  const { doc } = w;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(2.4);
  doc.line(MARGIN, w.y, MARGIN, w.y + 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(COPY.valueEmphasis, CONTENT_W - 24);
  doc.text(lines, MARGIN + 16, w.y + 14);
  w.y += Math.max(40, lines.length * 17 + 14);
  w.gap(10);

  bigBlockGrid(w, WHY_BLOCKS);

  w.gap(6);
  w.ensure(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  const closeLines = doc.splitTextToSize(resolveCatalogBlock(idx, "CATV2-BLACKBOX-ES", COPY.blackboxMessage), CONTENT_W);
  doc.text(closeLines, MARGIN, w.y);
  w.y += closeLines.length * 15 + 6;
}

function buildTracePage(w, idx) {
  h1(w, COPY.traceHeadline);
  timeline(w, TRACE_STEPS);
  w.gap(6);
  w.p(resolveCatalogBlock(idx, "CATV2-TRACE-INTRO-ES", COPY.traceIntro), { size: 10.5, bold: true, color: INK, gap: 8 });
  w.bullets(TRACE_BULLETS);
  w.gap(4);
  const { doc } = w;
  w.ensure(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("SERVICIOS ADICIONALES DISPONIBLES SEGÚN OPERACIÓN", MARGIN, w.y);
  w.y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(...INK);
  const addLines = doc.splitTextToSize(TRACE_ADDITIONAL, CONTENT_W);
  doc.text(addLines, MARGIN, w.y);
  w.y += addLines.length * 12 + 6;
}

function buildSelectorPage(w, idx, families, commonImages) {
  h1(w, COPY.selectorHeadline);
  const rows = FAMILY_ORDER
    .filter((linea) => familiesToMap(families).has(linea) && NEED_MATRIX[linea])
    .map((linea) => NEED_MATRIX[linea]);
  needMatrix(w, rows);
  w.p(resolveCatalogBlock(idx, "CATV2-SELECTOR-INTRO-ES", COPY.selectorIntro), { size: 9.3, bold: true, color: ACCENT, gap: 14 });

  w.gap(4);
  w.rule();
  h1WithoutGapReset(w, "Qué conforma un sistema fijo Blueprint");
  w.p(COPY.commonBandHeadline, { size: 9.5, color: INK, gap: 12 });

  const commonItems = COMMON_CATEGORIES
    .filter((cat) => commonImages[cat])
    .map((cat) => ({ label: COMMON_LABELS[cat], sublabel: "", meta: cat, image: commonImages[cat] }));
  // No es async-await-able desde una funcion sync; se resuelve en el
  // orquestador (ver buildCommercialCatalog) llamando a identityRow()
  // directamente ahi. Este helper solo prepara los datos.
  w.__pendingCommonItems = commonItems;

  w.p(COPY.commonBandPrecision, { size: 7.6, color: MUTED, gap: 4 });
}
function h1WithoutGapReset(w, text) {
  w.ensure(24);
  w.doc.setFont("helvetica", "bold");
  w.doc.setFontSize(13);
  w.doc.setTextColor(...INK);
  w.doc.text(text, MARGIN, w.y);
  w.y += 18;
}

/** Pagina de linea fija generica (Respaldo o Continuidad+Autonomia
 *  combinadas) — 2 columnas comparativas, cada una con el representante
 *  de un tier real y, si existen hermanos de tier, una nota compacta en
 *  vez de repetir la ficha completa (Doc 06 V2 seccion 18). */
async function buildComparativePage(w, idx, market, config, headline, columns) {
  h1(w, headline);
  const { doc } = w;
  const gap = 20;
  const colW = (CONTENT_W - gap) / 2;
  // Cada columna se dibuja completa antes de pasar a la siguiente (no en
  // paralelo dentro de la misma fila de pagina) para que this.y avance
  // de forma predecible; se resetea w.y al mayor de las dos al terminar.
  const startY = w.y;
  let maxY = startY;
  for (let ci = 0; ci < columns.length; ci++) {
    w.y = startY;
    await drawColumnCard(w, idx, market, config, columns[ci], ci === 0 ? MARGIN : MARGIN + colW + gap, colW);
    maxY = Math.max(maxY, w.y);
  }
  w.y = maxY;
}

async function drawColumnCard(w, idx, market, config, column, xOffset, colWidth) {
  // Truco: DocWriter dibuja siempre en MARGIN..PAGE_W-MARGIN. Para una
  // columna angosta reutilizamos buildFixedKitCard completo mas abajo en
  // la version de ancho completo (Operacion Critica); aca, para mantener
  // el mismo motor sin duplicar logica de dibujo, dibujamos la tarjeta a
  // ancho completo en su propia franja vertical y la offseteamos via
  // clip logico: como jsPDF no tiene "columnas" nativas, se dibuja con
  // una traslacion manual de coordenadas X en cada llamada de texto/
  // imagen -- por eso este bloque reimplementa (compacto) el cuerpo de
  // la tarjeta en vez de llamar a buildFixedKitCard con CONTENT_W fijo.
  const { doc } = w;
  const { kit, idea, siblingNote } = column;
  const copy = resolveCommercialCopy(idx, kit.Kit_ID, market);
  if (!copy) return;
  const { vm, description, autonomia } = copy;
  const { items, evItem } = resolveThreeComponents(idx, kit.Kit_ID);
  const allItems = (evItem ? [...items, evItem] : items).slice(0, 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  const nameLines = doc.splitTextToSize(vm.name, colWidth);
  doc.text(nameLines, xOffset, w.y);
  w.y += nameLines.length * 15 + 4;

  if (idea) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(...ACCENT);
    const ideaLines = doc.splitTextToSize(idea, colWidth);
    doc.text(ideaLines, xOffset, w.y);
    w.y += ideaLines.length * 11 + 8;
  }

  // Identidad compacta: hasta 3 items en columna (imagen chica + texto),
  // apilados verticalmente para que quepan en el ancho de columna.
  const thumb = 40;
  for (const it of allItems) {
    w.ensure(thumb + 6);
    const rowY = w.y;
    let drew = false;
    if (it.image) {
      try {
        const { dataUrl } = await resizedDataURL(it.image, thumb * 3, thumb * 3, { cover: true, quality: 0.78 });
        doc.addImage(dataUrl, "JPEG", xOffset, rowY, thumb, thumb);
        drew = true;
      } catch (err) { /* fallback abajo */ }
    }
    if (!drew) {
      doc.setDrawColor(...LINE);
      doc.setFillColor(...PANEL);
      doc.roundedRect(xOffset, rowY, thumb, thumb, 3, 3, "FD");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(...ACCENT);
    doc.text((it.meta || "").toUpperCase(), xOffset + thumb + 8, rowY + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.3);
    doc.setTextColor(...INK);
    doc.text(it.label, xOffset + thumb + 8, rowY + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const subLines = doc.splitTextToSize(it.sublabel || "", colWidth - thumb - 8);
    doc.text(subLines.slice(0, 1), xOffset + thumb + 8, rowY + 34);
    w.y = rowY + thumb + 8;
  }

  if (description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    doc.setTextColor(...INK);
    const dLines = doc.splitTextToSize(description, colWidth);
    w.ensure(dLines.length * 11 + 6);
    doc.text(dLines, xOffset, w.y);
    w.y += dLines.length * 11 + 8;
  }

  if (autonomia) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...INK);
    const autoLines = doc.splitTextToSize(`Autonomía: ${autonomia}`, colWidth);
    w.ensure(autoLines.length * 10 + 4);
    doc.text(autoLines, xOffset, w.y);
    w.y += autoLines.length * 10 + 4;
  }

  if (siblingNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const sLines = doc.splitTextToSize(siblingNote, colWidth);
    w.ensure(sLines.length * 9 + 4);
    doc.text(sLines, xOffset, w.y);
    w.y += sLines.length * 9 + 4;
  }

  w.ensure(18);
  const whatsapp = firstOf(config && config.WhatsApp_Ventas);
  const ctaMsg = `Hola, quiero cotizar el kit ${vm.id} — ${vm.name}.`;
  doc.setFillColor(...INK);
  doc.roundedRect(xOffset, w.y, colWidth, 20, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);
  if (whatsapp) {
    doc.textWithLink(COPY.kitCtaText, xOffset + 8, w.y + 13, { url: whatsappLink(whatsapp, ctaMsg) });
  } else {
    doc.text(COPY.kitCtaText, xOffset + 8, w.y + 13);
  }
  w.y += 30;
}

async function buildCriticalPage(w, idx, market, config, kits) {
  const { doc } = w;
  h1(w, COPY.criticalHeadline);
  w.p(COPY.criticalBody, { size: 10, color: INK, gap: 10 });

  const groups = tierGroups(kits);
  const refGroup = groups[0];
  if (!refGroup) return;

  await buildFixedKitCard(w, idx, refGroup.representative, market, config, {});

  w.ensure(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text("Configuraciones disponibles según necesidad y disponibilidad", MARGIN, w.y);
  w.y += 16;

  const chipTexts = kits.map((k) => {
    const { items } = resolveThreeComponents(idx, k.Kit_ID);
    const bat = items.find((i) => i.meta === "Batería");
    const inv = items.find((i) => i.meta === "Inversor");
    const invLabel = inv ? (inv.sublabel || "").split(" · ")[0] : "";
    return [invLabel, bat ? bat.label : ""].filter(Boolean).join(" · ") || k.Nombre_Comercial;
  });
  chipList(w, chipTexts);
  w.p(COPY.criticalVariantsNote, { size: 7.8, color: MUTED, gap: 6 });
}

function buildPortableIntroBlock(w, idx) {
  h1(w, COPY.portableHeadline);
  w.p(COPY.portableIntro, { size: 10, color: INK, gap: 10 });
  w.ensure(24);
  const { doc } = w;
  doc.setFillColor(...PANEL);
  doc.roundedRect(MARGIN, w.y, CONTENT_W, 26, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...MUTED);
  doc.text("BENEFICIOS DE LA LÍNEA PORTÁTIL", MARGIN + 10, w.y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(COPY.portableBenefits, MARGIN + 10, w.y + 21);
  w.y += 36;
}

/** Mide TODO lo que va a dibujar una tarjeta portatil (misma fuente que
 *  el dibujo real, para que el alto reservado por w.ensure() nunca quede
 *  corto — el bug que este comentario reemplaza: una estimacion de altura
 *  separada de este calculo se desincronizaba de lo que en verdad se
 *  dibujaba y las tarjetas se pisaban entre filas). */
function measurePortableCard(doc, kit, estacion, panelPlegable, usos, colW) {
  const imgH = 70;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  const nameLines = doc.splitTextToSize(kit.Nombre_Comercial || kit.Kit_ID, colW).slice(0, 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  const usosLines = usos ? doc.splitTextToSize(usos, colW) : [];

  let h = imgH + 14; // imagen + gap
  h += nameLines.length * 11 + 4;
  if (estacion && estacion.Potencia_W) h += 11;
  if (panelPlegable) h += 11;
  if (usosLines.length) h += usosLines.length * 9 + 4;
  h += 4 + 17; // gap + boton CTA
  return { imgH, nameLines, usosLines, height: h };
}

async function buildPortableCard(w, idx, kit, market, config, x, colW) {
  const { doc } = w;
  const copy = resolveCommercialCopy(idx, kit.Kit_ID, market);
  const comps = (idx.kitComponents && idx.kitComponents[kit.Kit_ID]) || [];
  const estacion = comps.find((c) => c.Categoria === CAT_ESTACION);
  const panelPlegable = comps.find((c) => c.Categoria === CAT_PANEL_PLEGABLE);
  const usos = (copy && copy.feed && copy.feed.length ? copy.feed : []).slice(0, 3).join(" · ");

  const { imgH, nameLines, usosLines, height } = measurePortableCard(doc, kit, estacion, panelPlegable, usos, colW);
  w.ensure(height);
  const startY = w.y;

  let drew = false;
  const img = estacion && estacion.Imagen;
  if (img) {
    try {
      const { dataUrl } = await resizedDataURL(img, colW * 2, imgH * 2, { cover: true, quality: 0.8 });
      doc.addImage(dataUrl, "JPEG", x, startY, colW, imgH);
      drew = true;
    } catch (err) { /* fallback abajo */ }
  }
  if (!drew) {
    doc.setDrawColor(...LINE);
    doc.setFillColor(...PANEL);
    doc.roundedRect(x, startY, colW, imgH, 4, 4, "FD");
  }
  let y = startY + imgH + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.setTextColor(...INK);
  doc.text(nameLines, x, y);
  y += nameLines.length * 11 + 4;

  const potenciaW = estacion ? estacion.Potencia_W : null;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  if (potenciaW) { doc.text(`${potenciaW} W`, x, y); y += 11; }

  if (panelPlegable) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Panel plegable ${panelPlegable.Potencia_W || ""}W incluido`, x, y);
    y += 11;
  }

  if (usosLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.text(usosLines, x, y);
    y += usosLines.length * 9 + 4;
  }

  y += 4;
  const whatsapp = firstOf(config && config.WhatsApp_Ventas);
  const ctaMsg = `Hola, quiero cotizar el kit ${kit.Kit_ID} — ${kit.Nombre_Comercial}.`;
  doc.setFillColor(...INK);
  doc.roundedRect(x, y, colW, 17, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  if (whatsapp) {
    doc.textWithLink("Cotizar", x + 8, y + 11.5, { url: whatsappLink(whatsapp, ctaMsg) });
  } else {
    doc.text("Cotizar", x + 8, y + 11.5);
  }
  w.y = startY + height;
}

/** Rejilla compacta de portatiles, 2 por fila (Doc 06 V2 seccion 6 —
 *  "3-4 productos por pagina", 2 por fila da tarjetas mas legibles con
 *  imagen real que 3-4 en una sola linea con el ancho A4). Cada tarjeta
 *  se reserva completa antes de dibujar (nunca se corta entre paginas,
 *  seccion 13.3). */
async function buildPortableGrid(w, idx, market, config, kits) {
  const { doc } = w;
  const cols = 2;
  const gap = 16;
  const colW = (CONTENT_W - gap) / cols;
  for (let i = 0; i < kits.length; i += cols) {
    const row = kits.slice(i, i + cols);
    const heights = row.map((k) => {
      const copy = resolveCommercialCopy(idx, k.Kit_ID, market);
      const usos = (copy && copy.feed && copy.feed.length ? copy.feed : []).slice(0, 3).join(" · ");
      const comps = (idx.kitComponents && idx.kitComponents[k.Kit_ID]) || [];
      const estacion = comps.find((c) => c.Categoria === CAT_ESTACION);
      const panelPlegable = comps.find((c) => c.Categoria === CAT_PANEL_PLEGABLE);
      return measurePortableCard(doc, k, estacion, panelPlegable, usos, colW).height;
    });
    const rowH = Math.max(...heights);
    w.ensure(rowH + gap);
    const startY = w.y;
    for (let ci = 0; ci < row.length; ci++) {
      w.y = startY;
      await buildPortableCard(w, idx, row[ci], market, config, MARGIN + ci * (colW + gap), colW);
    }
    w.y = startY + rowH + gap;
  }
}

function buildSupplyPage(w, idx, config) {
  h1(w, COPY.supplyHeadline);
  const { doc } = w;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  w.ensure(16);
  doc.text("Red de suministro internacional y regional", MARGIN, w.y);
  w.y += 16;
  w.p(resolveCatalogBlock(idx, "CATV2-SUPPLY-INTRO-ES", COPY.supplyIntro), { size: 9.3, color: MUTED, gap: 10 });
  chipList(w, COPY.supplyExample.split(" · "));

  w.gap(4);
  twoColumnBullets(w,
    "Podemos acompañarte en:",
    ["Diagnóstico inicial", "Selección y configuración", "Comparación de alternativas de suministro",
      "Negociación comercial", "Validación de componentes y cantidades", "Coordinación documental",
      "Coordinación logística internacional", "Seguimiento de hitos disponibles",
      "Acompañamiento ante incidencias dentro del alcance contratado"],
    "Pueden cotizarse por separado:",
    ["Nacionalización", "Despacho aduanal", "Transporte en destino", "Levantamiento técnico presencial",
      "Instalación", "Puesta en marcha", "Mantenimiento o posventa cuando corresponda"]
  );
}

function buildTrustAndCtaPage(w, idx, config, seller) {
  const { doc } = w;
  doc.addPage(); w.y = MARGIN;

  h1(w, COPY.trustHeadline);
  const brandName = firstOf(config.Brand_Name, "Blueprint OS");
  const companyName = firstOf(config.Company_Display_Name);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  w.ensure(16);
  doc.text(brandName, MARGIN, w.y);
  w.y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Sistema comercial de soluciones energéticas", MARGIN, w.y);
  w.y += 16;
  if (companyName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    w.ensure(14);
    doc.text(`Gestión comercial a través de ${companyName}`, MARGIN, w.y);
    w.y += 16;
  }
  const identityLines = [
    firstOf(config.Company_Country),
    firstOf(config.Company_Website),
    firstOf(config.Company_Email),
  ].filter(Boolean);
  if (identityLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    w.ensure(identityLines.length * 12);
    identityLines.forEach((line) => { doc.text(line, MARGIN, w.y); w.y += 12; });
  }
  if (config.Show_Tax_ID === "Si" || config.Show_Tax_ID === "Sí") {
    const taxId = firstOf(config.Company_Tax_ID);
    if (taxId) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      w.ensure(12);
      doc.text(`RNC: ${taxId}`, MARGIN, w.y);
      w.y += 12;
    }
  }
  w.y += 6;
  w.rule();

  h1(w, COPY.ctaFinalHeadline);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  COPY.ctaFinalQuestions.forEach((q) => {
    w.ensure(18);
    doc.text(q, MARGIN, w.y);
    w.y += 18;
  });
  w.gap(6);

  const contactName = seller ? seller.nombre : firstOf(config.Contacto_Nombre);
  const whatsapp = seller ? seller.whatsapp : firstOf(config.WhatsApp_Ventas);
  const waMsg = "Hola. Vi el catálogo comercial y quiero evaluar una solución energética para mi necesidad.";

  w.ensure(44);
  doc.setFillColor(...ACCENT);
  doc.roundedRect(MARGIN, w.y, 200, 32, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(5, 46, 18);
  if (whatsapp) {
    doc.textWithLink(COPY.ctaFinalButton, MARGIN + 16, w.y + 20, { url: whatsappLink(whatsapp, waMsg) });
  } else {
    doc.text(COPY.ctaFinalButton, MARGIN + 16, w.y + 20);
  }

  // QR — apunta al WhatsApp del vendedor si es valido, si no al
  // corporativo (Doc 06 V2 seccion 10.4/19).
  const qrSize = 74;
  const qrX = PAGE_W - MARGIN - qrSize;
  const qrY = w.y - 6;
  let qrDrawn = false;
  if (whatsapp) qrDrawn = drawQRCode(doc, whatsappLink(whatsapp, waMsg), qrX, qrY, qrSize);
  if (qrDrawn) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("Escanea para escribirnos", qrX + qrSize / 2, qrY + qrSize + 9, { align: "center" });
  }
  w.y += 48;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  doc.setTextColor(...MUTED);
  w.ensure(12);
  doc.text(resolveCatalogBlock(idx, "CATV2-FINAL-CTA-ES", COPY.ctaFinalSupport), MARGIN, w.y);
  w.y += 16;

  if (contactName || whatsapp) {
    const bits = [
      seller ? `Asesor: ${contactName}` : (contactName ? `Contacto: ${contactName}` : null),
      whatsapp ? `WhatsApp: ${whatsapp}` : null,
      seller ? `Código: ${seller.seller_id}` : null,
    ].filter(Boolean);
    w.p(bits.join(" · "), { size: 9, color: INK, gap: 10 });
  }

  w.p(COPY.priceAux, { size: 8, color: MUTED, gap: 16 });

  w.rule();
  w.p(resolveCatalogBlock(idx, "CATV2-LEGAL-SHORT-ES", COPY.legalShort), { size: 7.4, color: MUTED, gap: 4 });
}

/* ----------------------------------------------------------------------
   4. ORQUESTACION
   -------------------------------------------------------------------- */

export async function buildCommercialCatalog({ idx, data, market, seller, language = "Español" } = {}) {
  const config = (data && data.config) || {};
  const resolvedMarket = market || config.Mercado_Default || null;
  const sellerRecord = sellerFor(idx, seller);
  const families = resolveActiveKits(idx);
  const byLinea = familiesToMap(families);
  const generatedAt = new Date();
  const brandName = firstOf(config.Brand_Name, "Blueprint OS");

  const doc = newDoc();
  const w = new DocWriter(doc);

  // 1. Portada
  await buildCoverPage(w, idx, resolvedMarket, families, generatedAt, brandName);

  // 2. Por que acompañado
  doc.addPage(); w.y = MARGIN;
  buildWhyPage(w, idx);

  // 3. Trazabilidad
  doc.addPage(); w.y = MARGIN;
  buildTracePage(w, idx);

  // 4. Selector de necesidad + banda unica de componentes comunes
  doc.addPage(); w.y = MARGIN;
  const commonImages = resolveCommonComponentImages(idx, families);
  buildSelectorPage(w, idx, families, commonImages);
  if (w.__pendingCommonItems && w.__pendingCommonItems.length) {
    await identityRow(w, w.__pendingCommonItems);
    delete w.__pendingCommonItems;
  }

  // 5. Respaldo (comparativa por tier real)
  const respaldoKits = byLinea.get("Respaldo") || [];
  if (respaldoKits.length) {
    doc.addPage(); w.y = MARGIN;
    const groups = tierGroups(respaldoKits);
    const columns = groups.slice(0, 2).map((g) => ({
      kit: g.representative,
      idea: null,
      siblingNote: g.siblings.length
        ? `También disponible en esta potencia: ${g.siblings.map((s) => s.Nombre_Comercial).join(", ")}.`
        : null,
    }));
    await buildComparativePage(w, idx, resolvedMarket, config, "Respaldo esencial", columns);
    if (groups.length > 2) {
      chipList(w, groups.slice(2).map((g) => g.representative.Nombre_Comercial));
    }
  }

  // 6. Continuidad + Autonomia (una Linea por columna)
  const continuidadKits = byLinea.get("Continuidad") || [];
  const autonomiaKits = byLinea.get("Autonomia") || [];
  if (continuidadKits.length || autonomiaKits.length) {
    doc.addPage(); w.y = MARGIN;
    const columns = [];
    if (continuidadKits.length) {
      const groups = tierGroups(continuidadKits);
      columns.push({
        kit: groups[0].representative,
        idea: "Genera y almacena energía con respaldo para reducir interrupciones y aprovechar mejor la energía disponible.",
        siblingNote: groups[0].siblings.length || groups.length > 1
          ? `También disponible: ${[...groups[0].siblings, ...groups.slice(1).map((g) => g.representative)].map((s) => s.Nombre_Comercial).join(", ")}.`
          : null,
      });
    }
    if (autonomiaKits.length) {
      const groups = tierGroups(autonomiaKits);
      columns.push({
        kit: groups[0].representative,
        idea: "Pensada para reducir la dependencia de una red inestable mediante producción y almacenamiento propios.",
        siblingNote: groups[0].siblings.length || groups.length > 1
          ? `También disponible: ${[...groups[0].siblings, ...groups.slice(1).map((g) => g.representative)].map((s) => s.Nombre_Comercial).join(", ")}.`
          : null,
      });
    }
    await buildComparativePage(w, idx, resolvedMarket, config, "Continuidad y autonomía 5K", columns);
  }

  // 7. Operacion Critica 10K
  const criticalKits = byLinea.get("Operacion Critica") || [];
  if (criticalKits.length) {
    doc.addPage(); w.y = MARGIN;
    await buildCriticalPage(w, idx, resolvedMarket, config, criticalKits);
  }

  // 8-9. Portatiles (rejilla compacta, tantas paginas como haga falta)
  const portableKits = byLinea.get("Portatil") || [];
  if (portableKits.length) {
    doc.addPage(); w.y = MARGIN;
    buildPortableIntroBlock(w, idx);
    await buildPortableGrid(w, idx, resolvedMarket, config, portableKits);
  }

  // 10. Red de suministro + alcance
  doc.addPage(); w.y = MARGIN;
  buildSupplyPage(w, idx, config);

  // 11. Confianza/identidad empresarial + CTA final + QR + legal
  buildTrustAndCtaPage(w, idx, config, sellerRecord);

  const label = sellerRecord ? "Asesor" : "Contacto";
  drawFooters(doc, {
    brand: brandName,
    label,
    contactName: sellerRecord ? sellerRecord.nombre : firstOf(config.Contacto_Nombre),
    whatsapp: sellerRecord ? sellerRecord.whatsapp : firstOf(config.WhatsApp_Ventas),
    code: sellerRecord ? sellerRecord.seller_id : null,
  });

  const filename = resolvedMarket
    ? `Blueprint_Catalogo_Comercial_ES_${slugFile(resolvedMarket)}_${fechaISO(generatedAt)}.pdf`
    : `Blueprint_Catalogo_Comercial_ES_${fechaISO(generatedAt)}.pdf`;

  return {
    doc, filename, market: resolvedMarket, seller: sellerRecord,
    kitCount: families.reduce((n, g) => n + g.kits.length, 0),
    pageCount: doc.internal.getNumberOfPages(),
  };
}

/** API publica (Doc 06 V2 seccion 24.2, conservada de la V1): genera y
 *  descarga el catalogo. `seller` es opcional -- si no se pasa, se
 *  resuelve solo desde attachCatalogButton() leyendo la URL. */
export async function generateCommercialCatalog({ market, seller, language = "Español", download = true } = {}) {
  ensureJsPDF();
  const { idx, data } = await loadCatalogData();
  const result = await buildCommercialCatalog({ idx, data, market, seller, language });
  if (download) result.doc.save(result.filename);
  return result;
}

/* ----------------------------------------------------------------------
   5. UI — estados del boton de descarga
   -------------------------------------------------------------------- */

/** Arma las <option> de un selector de vendedor a partir de sellers.json
 *  (solo filas activas). value="" es siempre "uso general" (contacto
 *  corporativo, sin personalizar) -- nunca queda un vendedor
 *  seleccionado por accidente/por defecto. */
export function populateSellerSelect(selectEl, sellers) {
  if (!selectEl) return;
  const active = (sellers || []).filter((s) => s && s.seller_id);
  selectEl.innerHTML =
    `<option value="">Uso general (sin vendedor)</option>` +
    active.map((s) => `<option value="${s.seller_id}">${s.nombre || s.seller_id}</option>`).join("");
  // Si no hay ningun vendedor cargado todavia, no tiene sentido mostrar
  // el selector (evita un dropdown vacio con una sola opcion).
  selectEl.hidden = active.length === 0;
}

export function attachCatalogButton(el, { market, sellerSelect } = {}) {
  if (!el || el.dataset.catalogWired) return;
  el.dataset.catalogWired = "1";
  const normalLabel = el.innerHTML;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    if (el.dataset.busy === "1") return;
    el.dataset.busy = "1";
    el.setAttribute("aria-busy", "true");
    el.textContent = "Preparando catálogo…";
    try {
      const resolvedMarket = typeof market === "function" ? market() : market;
      // Personalizacion por vendedor (Doc 06 V2 seccion 10): se lee al
      // momento del clic, no al pintar el boton, por si el visitante
      // llego con el link generico y despues navega con ?seller=... La
      // eleccion manual del selector (cuando existe y tiene un valor)
      // manda sobre la URL: asi quien administra el sitio puede generar
      // el catalogo de cualquier vendedor sin tener que armar el link.
      const selectValue = sellerSelect ? (sellerSelect.value || "").trim() : "";
      const sellerId = selectValue || (hashQuery().seller || "").trim() || null;
      await generateCommercialCatalog({ market: resolvedMarket, seller: sellerId });
      showCatalogToast("Catálogo listo.");
    } catch (err) {
      console.error("No se pudo generar el catálogo comercial (PUB-06 V2):", err);
      showCatalogToast("No pudimos generar el catálogo en este momento. Inténtalo nuevamente.", true);
    } finally {
      el.innerHTML = normalLabel;
      el.removeAttribute("aria-busy");
      el.dataset.busy = "0";
    }
  });
}

let toastTimer = null;
function showCatalogToast(text, isError = false) {
  let toast = document.getElementById("catalog-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "catalog-toast";
    toast.className = "catalog-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), isError ? 4200 : 2600);
}
