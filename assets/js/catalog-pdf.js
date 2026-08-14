/* ======================================================================
   BLUEPRINT VIEWER 2.0 — catalog-pdf.js
   ----------------------------------------------------------------------
   PUB-06 · Catalogo Comercial Dinamico sin Precios (Plano 03, Documento
   06 v1.1 — integracion con Pricing & Logistics Engine). Genera en el
   navegador, sin backend, un PDF compartible con las soluciones activas
   del sitio: familias comerciales, beneficios, componentes incluidos y
   la propuesta de acompanamiento de Blueprint.

   Reglas duras de este modulo (Documento 06 secciones 0, 5.1, 21, 31):
   - JAMAS precios, EXW/FOB/CIF, costo aterrizado, flete, costo de
     contenedor, margen, comision, contingencia, gasto financiero, ROI,
     utilidad o participacion de inversionista. El nuevo motor
     financiero/logistico (06_PARAMETROS, 05_COSTOS_INTERNACIONALES,
     07_COTIZADOR) es una fuente PRIVADA de validacion upstream — PUB-06
     nunca la lee ni la expone, solo se beneficia de que ya valido el
     kit antes de llegar a CATALOGO_MASTER.
   - JAMAS hardcodear una capacidad de contenedor por kit: eso vive en
     el simulador/Excel financiero, no en este modulo.
   - JAMAS "Cuba" como identidad exclusiva de Blueprint.
   - JAMAS mencionar Grupo TPG.
   - JAMAS Kit_ID hardcodeado: todo sale de kits.json/catalogs.json/
     kit_components.json/content_blocks.json/config.json via core.js.
   - El CTA de cada kit conserva su Kit_ID (seccion 32, Arquitectura)
     para que un flujo de cotizacion futuro pueda resolver el precio
     vigente en 07_COTIZADOR sin que PUB-06 lo calcule ni lo replique.
   - Es ADITIVO: no reemplaza ni toca la ficha comercial por-kit
     existente (pdfgen.js/pdfcontent.js), ni la experiencia visual del
     sitio. Modulo separado, no vive dentro de app.js.

   Reutiliza el mismo motor de dibujo (DocWriter, constantes de layout,
   helpers de imagen) que ya usa pdfgen.js para la ficha por-kit — nunca
   se duplica la logica de paginacion/dibujo (regla de arquitectura del
   proyecto: "nunca duplicar informacion/logica").
   ====================================================================== */

import {
  loadAll, buildIndices, clean, firstOf, whatsappLink,
  lineaLabel, catalogFor, buildKitViewModel,
} from "./core.js";
import {
  DocWriter, newDoc, drawFooters, ensureJsPDF,
  PAGE_W, PAGE_H, MARGIN, CONTENT_W, INK, MUTED, LINE, PANEL, ACCENT,
} from "./pdfgen.js";

/* ----------------------------------------------------------------------
   Copy fijo — Documento 06, seccion 16 ("Claude no debe improvisar la
   narrativa principal"). Texto palabra por palabra tal como esta en el
   documento fuente.
   -------------------------------------------------------------------- */
const COPY = {
  brand: "Blueprint",
  coverTitle: "Soluciones Energéticas Inteligentes",
  coverSubtitle: "Equipos, asesoría y acompañamiento para tomar una mejor decisión energética.",
  coverClosing: "Tu energía. Tu independencia.",
  valueTitle: "Comprar energía no debería significar comprar incertidumbre.",
  valueBody: "Elegir los equipos es solo una parte del proceso. Una operación también puede requerir validar configuraciones, negociar condiciones, coordinar documentación, organizar la logística y mantener visibilidad sobre la carga. Nuestro trabajo es acompañarte para que puedas tomar decisiones con más información y gestionar cada etapa con mayor claridad.",
  valueEmphasis: "No se trata solo de saber qué comprar. Se trata de saber qué está pasando con tu operación.",
  servicesTitle: "Acompañamiento comercial de principio a fin",
  confianzaTitle: "Más claridad en cada etapa",
  procesoTitle: "De tu necesidad a una solución coordinada",
  kitsTitle: "Encuentra el nivel de respaldo que necesitas",
  kitsSubtext: "Cada solución responde a una necesidad diferente. Compara capacidades, aplicaciones y componentes antes de decidir.",
  ctaFinalTitle: "Tu solución comienza con una buena evaluación.",
  ctaFinalBody: "Cuéntanos qué necesitas mantener funcionando, cuál es tu contexto de uso y qué nivel de respaldo esperas. Te ayudamos a identificar una configuración adecuada y a entender el alcance de la operación antes de tomar una decisión.",
  ctaFinalButton: "Solicitar evaluación",
  kitCtaText: "Solicita una configuración para tu necesidad",
  priceReplacement: "Cotización según configuración, volumen, ruta y alcance",
  priceAux: "El valor final se confirma para cada operación según configuración, disponibilidad, volumen, origen de suministro, logística vigente y servicios contratados.",
  providersNote: "Trabajamos con alternativas de suministro internacionales y regionales según configuración, disponibilidad, costo y ruta logística.",
  scopeNote: "El alcance final de cada operación se confirma en la cotización y condiciones comerciales correspondientes.",
};

/* Pasos "Que hacemos por ti" (Doc 06 seccion 3). El titulo es una
   etiqueta estructural (no cambia); el cuerpo se resuelve primero desde
   CONTENT_BLOCKS/SERVICIOS_COMERCIALES (para que pueda evolucionar
   desde el Excel sin tocar codigo, seccion 15) y cae a este texto
   aprobado si el bloque todavia no existe en el Excel. */
const SERVICE_STEPS = [
  { title: "Diagnóstico y configuración", blockId: "SERVICE-DIAG-ES",
    fallback: "Analizamos la necesidad y ayudamos a seleccionar una configuración coherente con el consumo, las cargas prioritarias y el nivel de respaldo esperado." },
  { title: "Negociación con proveedores", blockId: "SERVICE-SOURCING-ES",
    fallback: "Gestionamos cotizaciones y condiciones directamente con proveedores y fabricantes disponibles en nuestros mercados de suministro." },
  { title: "Revisión de la oferta", blockId: "SERVICE-VALIDACION-ES",
    fallback: "Revisamos configuración, componentes, cantidades, precios y condiciones comerciales antes de avanzar con la operación." },
  { title: "Coordinación de compra y documentación", blockId: "SERVICE-DOCS-ES",
    fallback: "Acompañamos la preparación de la orden, la documentación comercial y los datos necesarios para coordinar la operación." },
  { title: "Coordinación logística internacional", blockId: "SERVICE-LOGISTICA-ES",
    fallback: "Coordinamos la solución logística correspondiente al alcance contratado, incluyendo origen, embarque y transporte internacional hasta el punto acordado." },
  { title: "Seguimiento de la carga", blockId: "SERVICE-TRACKING-ES",
    fallback: "Damos seguimiento a los hitos disponibles de la operación y mantenemos visibilidad sobre los actores logísticos involucrados." },
  { title: "Gestión de incidencias", blockId: "SERVICE-INCIDENTES-ES",
    fallback: "Si surge una desviación comercial, documental o logística, acompañamos su revisión y coordinación dentro del alcance contratado." },
  { title: "Servicios adicionales en destino", blockId: "SERVICE-DESTINO-ES",
    fallback: "Cuando el proyecto lo requiere, pueden coordinarse servicios adicionales como nacionalización, despacho, transporte local, instalación o puesta en marcha." },
];

const SCOPE_BASE = [
  "Diagnóstico inicial",
  "Selección y configuración de solución",
  "Búsqueda y comparación de alternativas de suministro",
  "Negociación comercial",
  "Validación de componentes y cantidades",
  "Coordinación documental",
  "Coordinación logística internacional",
  "Seguimiento de hitos disponibles del embarque",
  "Acompañamiento ante incidencias dentro del alcance contratado",
];
const SCOPE_ADDITIONAL = [
  "Nacionalización",
  "Despacho aduanal",
  "Transporte en destino",
  "Levantamiento técnico presencial",
  "Instalación",
  "Puesta en marcha",
  "Mantenimiento o servicios posventa adicionales cuando correspondan",
];

const CONFIANZA_IDEAS = [
  ["Decisión informada", "La recomendación debe responder a una necesidad real, no solamente a la potencia de un equipo."],
  ["Configuración visible", "El cliente puede conocer qué incluye la solución y qué función cumple cada componente principal."],
  ["Condiciones claras", "El alcance comercial, los servicios incluidos y los servicios adicionales deben quedar definidos antes de avanzar."],
  ["Trazabilidad", "La operación se acompaña mediante los hitos y documentos disponibles durante el proceso."],
  ["Múltiples alternativas de suministro", "La solución puede evaluarse con proveedores y orígenes diferentes según disponibilidad, configuración, costo y logística."],
  ["Un punto de coordinación", "El cliente dispone de acompañamiento durante las etapas contratadas, reduciendo la necesidad de gestionar cada actor por separado."],
];

const PROCESO_STEPS = [
  ["Cuéntanos qué necesitas", "Identificamos cargas prioritarias, contexto de uso y nivel de respaldo esperado."],
  ["Diseñamos la solución", "Seleccionamos una configuración adecuada entre las alternativas disponibles."],
  ["Cotizamos y negociamos", "Revisamos disponibilidad, componentes, condiciones y alternativas de suministro."],
  ["Coordinamos la compra", "Organizamos la información comercial y documental necesaria para avanzar."],
  ["Coordinamos y seguimos la logística", "Damos seguimiento a los hitos disponibles hasta el punto establecido en el alcance contratado."],
  ["Te acompañamos hasta el cierre del alcance", "La operación se mantiene coordinada hasta completar las etapas contratadas."],
];

/* Orden comercial de familias (Doc 06 seccion 7) y una frase honesta de
   que problema resuelve cada una — restatement corto del fallback ya
   aprobado en la seccion 13, nunca una promesa nueva. */
const FAMILY_ORDER = ["Respaldo", "Continuidad", "Autonomia", "Operacion Critica", "Portatil"];
const FAMILY_PROBLEM = {
  Respaldo: "Para cuando la red falla y necesitas mantener lo esencial funcionando.",
  Continuidad: "Para aprovechar mejor la energía disponible y reducir las interrupciones.",
  Autonomia: "Para depender menos de una red eléctrica inestable.",
  "Operacion Critica": "Para negocios que no pueden permitirse detener su operación.",
  Portatil: "Para energía que se mueve con vos, sin instalación fija.",
};

/* Fallback comercial por Linea (Doc 06 seccion 13) — se usa solo cuando
   ni el catalogo del kit ni el contenido heredado por Linea desde el
   Excel (LINEAS_COMERCIALES, ya resuelto por buildKitViewModel) traen
   un valor valido. Ultima red de seguridad, nunca la primera fuente. */
const FALLBACK_BY_LINEA = {
  Respaldo: {
    description: "Mantén lo esencial funcionando cuando la red falla: refrigeración, iluminación y conectividad, sin complicarte.",
    benefits: "Respaldo para cargas esenciales. Configuración sencilla. Solución ampliable según la necesidad. Mayor tranquilidad durante interrupciones de la red.",
  },
  Continuidad: {
    description: "Combina generación solar, almacenamiento y respaldo para aprovechar mejor la energía disponible y reducir interrupciones.",
    benefits: "Respaldo ante cortes. Aprovechamiento de energía solar. Monitoreo cuando el equipo lo permite. Solución adaptable a hogar o pequeño comercio.",
  },
  Autonomia: {
    description: "Genera y almacena tu propia energía para reducir la dependencia de una red inestable.",
    benefits: "Mayor independencia energética. Respaldo prolongado según configuración. Ideal para ubicaciones con suministro irregular. Posibilidad de ampliar la solución.",
  },
  "Operacion Critica": {
    description: "Diseñado para negocios que necesitan continuar operando cuando la red falla.",
    benefits: "Mayor continuidad operativa. Capacidad para cargas comerciales según configuración. Monitoreo remoto cuando el equipo lo permite. Solución preparada para crecer.",
  },
  Portatil: {
    description: "Energía lista para usar, sin instalación fija y fácil de mover según la necesidad.",
    benefits: "Cero instalación fija. Uso flexible. Respaldo inmediato para equipos compatibles. Alternativa práctica para necesidades móviles o de menor escala.",
  },
};

const AUTONOMY_MICROTEXT = "La autonomía real depende del consumo, simultaneidad de cargas, estado de batería, generación disponible y condiciones de uso.";

const DISCLAIMER_LINES = [
  "La información de este catálogo es comercial y orientativa. La configuración final, disponibilidad de componentes, marcas, modelos, garantías, autonomía estimada, condiciones logísticas, tiempos de tránsito y alcance de servicios se confirman en la cotización y documentación correspondiente a cada operación.",
  "Los componentes pueden variar según disponibilidad del proveedor al momento de la compra, manteniendo la configuración y criterios técnicos acordados.",
  "Los tiempos logísticos son estimados y pueden variar por ruta, transportista, disponibilidad, documentación, condiciones operativas y otros factores externos.",
];

/* Categorias de componente que se muestran con foto (Doc 06 seccion 12:
   "Mostrar miniaturas para componentes principales"). El resto se lista
   como texto con cantidad — nunca se omite el dato, solo la fotografia. */
const FEATURED_CATEGORIES = new Set([
  "Panel Solar", "Inversor", "Bateria", "Estacion Portatil", "Cargador EV", "Cargador Solar Plegable",
]);

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
   1. DATA — carga y resolucion (Doc 06 seccion 24.3)
   -------------------------------------------------------------------- */

/** Carga los JSON publicados y arma los indices — mismo mecanismo que
 *  usa el resto del sitio (core.js), asi PUB-06 nunca es una segunda
 *  fuente de verdad. */
export async function loadCatalogData() {
  const data = await loadAll();
  const idx = buildIndices(data);
  return { idx, data };
}

/** Kits activos, agrupados por familia comercial en el orden del
 *  Documento 06 (seccion 7), cada grupo ordenado por potencia de
 *  inversor (una aproximacion honesta a "Lite / estandar / Plus" sin
 *  inventar una jerarquia que el Excel no define explicitamente).
 *
 *  Gate de publicacion comercial (Doc 06 v1.1, seccion 5.1): si el
 *  Excel llega a agregar `Estado_Publicacion` y/o `Pricing_Validado`
 *  (resultado del Pricing Engine privado, 07_COTIZADOR), este filtro
 *  los respeta automaticamente. Mientras esos campos no existan en
 *  kits.json (hoy no existen), la condicion no hace nada — nunca se
 *  crea una segunda fuente manual en JavaScript para simularlos. */
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

/** Registro de catalogo priorizado por mercado — reusa catalogFor()
 *  (core.js), la misma logica que ya usa toda la web. */
export function resolveCatalogRecord(idx, kitId, market) {
  return catalogFor(idx, kitId, market);
}

/** Copy comercial de un kit para PUB-06: reusa el View Model unico del
 *  sitio (buildKitViewModel, core.js — Documento 07) y solo agrega la
 *  ultima red de respaldo de texto (Doc 06 seccion 13) para el caso
 *  extremo en que ni el kit ni su Linea traigan descripcion/beneficios
 *  todavia. Nunca es una segunda fuente de datos: es una capa de
 *  presentacion sobre el mismo View Model que usa la Ficha de Kit. */
export function resolveCommercialCopy(idx, kitId, market) {
  const vm = buildKitViewModel(idx, kitId, { market });
  if (!vm) return null;
  const fb = FALLBACK_BY_LINEA[vm.linea] || null;
  const description = firstOf(vm.description, fb && fb.description);
  const beneficiosText = firstOf(vm.beneficios, fb && fb.benefits);
  const benefits = beneficiosText
    ? beneficiosText.split(".").map((s) => s.trim()).filter(Boolean)
    : [];
  return { vm, description, benefits };
}

/* ----------------------------------------------------------------------
   2. LAYOUT — helpers propios de PUB-06 (grillas que DocWriter no trae
      porque la ficha por-kit no las necesita).
   -------------------------------------------------------------------- */

/** Bloque de dos columnas con vinetas — unico requerimiento explicito
 *  de grilla del Documento 06 (seccion 9: "Crear un bloque visual de
 *  dos columnas"). */
function twoColumnBullets(w, leftTitle, leftItems, rightTitle, rightItems) {
  const { doc } = w;
  const gap = 20;
  const colW = (CONTENT_W - gap) / 2;
  const lineH = 12.5;

  function measure(items, width) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    let h = 0;
    items.forEach((it) => { h += doc.splitTextToSize(it, width - 14).length * lineH + 3; });
    return h;
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

/** Grilla compacta de "ideas" (titulo corto + una linea de texto), 2
 *  columnas — usada en la seccion de confianza (Doc 06 seccion 10). */
function ideaGrid(w, pairs, cols = 2) {
  const { doc } = w;
  const gap = 16;
  const colW = (CONTENT_W - gap * (cols - 1)) / cols;
  const lineH = 11.5;

  function cellHeight(desc) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    const lines = doc.splitTextToSize(desc, colW - 4);
    return 16 + lines.length * lineH;
  }

  for (let i = 0; i < pairs.length; i += cols) {
    const rowPairs = pairs.slice(i, i + cols);
    const rowH = Math.max(...rowPairs.map(([, d]) => cellHeight(d))) + 10;
    w.ensure(rowH);
    rowPairs.forEach(([title, desc], ci) => {
      const x = MARGIN + ci * (colW + gap);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(title, x, w.y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.setTextColor(...MUTED);
      const lines = doc.splitTextToSize(desc, colW - 4);
      doc.text(lines, x, w.y + 13);
    });
    w.y += rowH;
  }
}

/** Pasos numerados en secuencia (Doc 06 seccion 11) — un circulo con el
 *  numero, titulo y una linea de texto por paso. */
function numberedSteps(w, steps) {
  const { doc } = w;
  steps.forEach(([title, desc], i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    const descLines = doc.splitTextToSize(desc, CONTENT_W - 34);
    const h = Math.max(24, 16 + descLines.length * 12.5);
    w.ensure(h);
    doc.setFillColor(...INK);
    doc.circle(MARGIN + 8, w.y + 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), MARGIN + 8, w.y + 5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(title, MARGIN + 24, w.y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    doc.setTextColor(...MUTED);
    doc.text(descLines, MARGIN + 24, w.y + 17);
    w.y += h + 6;
  });
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
  return "assets/img/scene-industrial.jpg"; // asset real del sitio, no generico de banco
}

async function buildCoverPage(w, idx, market, families, generatedAt) {
  const { doc } = w;
  doc.setFillColor(...ACCENT);
  doc.circle(MARGIN + 6, MARGIN - 2, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(COPY.brand, MARGIN + 18, MARGIN + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("CATÁLOGO COMERCIAL DINÁMICO", PAGE_W - MARGIN, MARGIN - 4, { align: "right" });
  w.y = MARGIN + 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);
  doc.setTextColor(...INK);
  const titleLines = doc.splitTextToSize(COPY.coverTitle, CONTENT_W);
  doc.text(titleLines, MARGIN, w.y);
  w.y += titleLines.length * 32 + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...MUTED);
  const subLines = doc.splitTextToSize(COPY.coverSubtitle, CONTENT_W - 40);
  doc.text(subLines, MARGIN, w.y);
  w.y += subLines.length * 17 + 18;

  const coverImg = pickCoverImage(idx, market, families);
  await w.image(coverImg, CONTENT_W, 300);

  w.gap(6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text(COPY.coverClosing, MARGIN, w.y);
  w.y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Catálogo comercial · Información actualizada al ${fechaLarga(generatedAt)}`, MARGIN, w.y);
}

function buildValuePage(w) {
  doc_h1(w, COPY.valueTitle);
  w.p(COPY.valueBody, { size: 11, color: INK, gap: 16 });

  w.ensure(50);
  const { doc } = w;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(2.4);
  doc.line(MARGIN, w.y, MARGIN, w.y + 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(COPY.valueEmphasis, CONTENT_W - 24);
  doc.text(lines, MARGIN + 16, w.y + 14);
  w.y += Math.max(44, lines.length * 17 + 14);

  w.gap(14);
  w.h2("Cómo te acompañamos");
  const flow = ["Necesidad", "Solución", "Compra", "Logística", "Seguimiento", "Destino"];
  const { doc: d2 } = w;
  d2.setFont("helvetica", "bold");
  d2.setFontSize(9.5);
  const gap = 8;
  const cellW = (CONTENT_W - gap * (flow.length - 1)) / flow.length;
  w.ensure(30);
  flow.forEach((step, i) => {
    const x = MARGIN + i * (cellW + gap);
    d2.setFillColor(...PANEL);
    d2.setDrawColor(...LINE);
    d2.roundedRect(x, w.y, cellW, 22, 4, 4, "FD");
    d2.setTextColor(...INK);
    d2.text(step, x + cellW / 2, w.y + 14, { align: "center" });
  });
  w.y += 34;
}

function doc_h1(w, text) {
  w.ensure(34);
  w.doc.setFont("helvetica", "bold");
  w.doc.setFontSize(19);
  w.doc.setTextColor(...INK);
  const lines = w.doc.splitTextToSize(text, CONTENT_W);
  w.doc.text(lines, MARGIN, w.y);
  w.y += lines.length * 23 + 10;
}

function buildServicesPage(w, idx) {
  w.h1(COPY.servicesTitle);
  const { doc } = w;
  SERVICE_STEPS.forEach((step, i) => {
    // El bloque se busca por Block_ID especifico (no por Block_Group
    // generico via resolveContentBlock, ya que el grupo
    // SERVICIOS_COMERCIALES trae 8 textos distintos) — ver
    // resolveServiceText() mas abajo.
    const body = resolveServiceText(idx, step.blockId) || step.fallback;
    const h = 14 + doc.splitTextToSize(body, CONTENT_W - 4).length * 12;
    w.ensure(h + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...ACCENT);
    doc.text(`${String(i + 1).padStart(2, "0")}`, MARGIN, w.y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(step.title, MARGIN + 22, w.y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(body, CONTENT_W - 22);
    doc.text(lines, MARGIN + 22, w.y + 13);
    w.y += Math.max(h, 13 + lines.length * 12) + 8;
  });
}

/** Busca el texto de un servicio por Block_ID exacto dentro del grupo
 *  SERVICIOS_COMERCIALES (content_blocks.json). Se prioriza espanol; si
 *  el bloque todavia no existe en el Excel (ver seccion 15 del
 *  Documento 06 — pendiente hasta que se publique CONTENT_BLOCKS), esta
 *  funcion devuelve null y el llamador cae al texto aprobado en codigo. */
function resolveServiceText(idx, blockId) {
  const rows = (idx.contentBlocks || []).filter((b) => b.Block_ID === blockId);
  if (!rows.length) return null;
  const es = rows.find((r) => r.Idioma === "Español" || r.Idioma === "Espanol");
  return clean((es || rows[0]).Texto);
}

function buildScopePage(w) {
  w.h2("Alcance del acompañamiento");
  twoColumnBullets(w, "Podemos acompañarte en:", SCOPE_BASE, "También pueden cotizarse por separado:", SCOPE_ADDITIONAL);
  w.p(COPY.providersNote, { size: 8.5, color: MUTED, gap: 4 });
  w.p(COPY.scopeNote, { size: 8.5, color: MUTED, gap: 2 });
}

function buildConfianzaPage(w) {
  w.h2(COPY.confianzaTitle);
  ideaGrid(w, CONFIANZA_IDEAS, 2);
}

function buildProcesoPage(w) {
  w.h2(COPY.procesoTitle);
  numberedSteps(w, PROCESO_STEPS);
}

/** Tarjeta compacta de un kit dentro de su familia (Doc 06 seccion 12).
 *  Nunca dibuja precio (seccion 21) — en su lugar, el texto fijo de
 *  reemplazo (COPY.priceReplacement). */
async function buildKitBlock(w, idx, kit, market, config) {
  const { doc } = w;
  const copy = resolveCommercialCopy(idx, kit.Kit_ID, market);
  if (!copy) return;
  const { vm, description, benefits } = copy;

  w.ensure(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.setTextColor(...INK);
  doc.text(vm.name, MARGIN, w.y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(vm.id, PAGE_W - MARGIN, w.y, { align: "right" });
  w.y += 16;

  const specParts = [
    vm.potenciaPanelKw > 0 ? `${vm.potenciaPanelKw} kW panel` : null,
    vm.potenciaInversorKw > 0 ? `${vm.potenciaInversorKw} kW inversor` : null,
    vm.bateriaKwh > 0 ? `${vm.bateriaKwh} kWh batería` : null,
  ].filter(Boolean);
  if (specParts.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...ACCENT);
    doc.text(specParts.join("  ·  "), MARGIN, w.y);
    w.y += 14;
  }

  if (vm.image) {
    await w.image(vm.image, CONTENT_W, 130);
  }

  if (description) w.p(description, { size: 9.5, color: INK, gap: 6 });

  if (vm.feed.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.7);
    doc.setTextColor(...MUTED);
    w.ensure(12);
    doc.text("QUÉ PUEDE ALIMENTAR", MARGIN, w.y);
    w.y += 12;
    w.bullets(vm.feed);
  }

  if (vm.autonomia) {
    w.p(`Autonomía aproximada: ${vm.autonomia}`, { size: 9, bold: true, color: INK, gap: 2 });
    w.p(AUTONOMY_MICROTEXT, { size: 7.6, color: MUTED, gap: 6 });
  }

  if (benefits.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.7);
    doc.setTextColor(...MUTED);
    w.ensure(12);
    doc.text("BENEFICIOS", MARGIN, w.y);
    w.y += 12;
    w.bullets(benefits);
  }

  const featured = vm.included.filter((c) => FEATURED_CATEGORIES.has(c.Categoria));
  const rest = vm.included.filter((c) => !FEATURED_CATEGORIES.has(c.Categoria));
  if (featured.length || rest.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.7);
    doc.setTextColor(...MUTED);
    w.ensure(12);
    doc.text("QUÉ INCLUYE", MARGIN, w.y);
    w.y += 12;
    if (featured.length) await w.componentList(featured);
    if (rest.length) {
      w.bullets(rest.map((c) => `${c.Cantidad || 1}× ${c.Descripcion || c.SKU}`));
    }
  }

  const warrantyText = firstOf(vm.garantiaComercial, vm.warrantyYears ? `Hasta ${vm.warrantyYears} años según componente.` : null);
  if (warrantyText) w.p(`Garantía: ${warrantyText}`, { size: 8, color: MUTED, gap: 4 });

  // CTA del kit (Doc 06 seccion 12/32): nunca precio — texto de
  // reemplazo fijo. Cuando hay WhatsApp configurado, el boton es un
  // link real que conserva Kit_ID + Nombre_Comercial en el mensaje
  // precargado, para que el flujo de cotizacion (07_COTIZADOR, fuente
  // privada) pueda resolver el precio vigente sin que PUB-06 lo calcule.
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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text(COPY.priceReplacement, PAGE_W - MARGIN - 10, w.y + 14, { align: "right" });
  w.y += 30;

  w.rule();
}

async function buildKitFamilyPages(w, idx, families, market, config) {
  w.h1(COPY.kitsTitle);
  w.p(COPY.kitsSubtext, { size: 10.5, color: MUTED, gap: 12 });

  for (const group of families) {
    w.ensure(30);
    w.doc.setFillColor(...PANEL);
    w.doc.roundedRect(MARGIN, w.y, CONTENT_W, 34, 5, 5, "F");
    w.doc.setFont("helvetica", "bold");
    w.doc.setFontSize(13);
    w.doc.setTextColor(...INK);
    w.doc.text(lineaLabel(group.linea) || group.linea, MARGIN + 12, w.y + 15);
    w.doc.setFont("helvetica", "normal");
    w.doc.setFontSize(8.5);
    w.doc.setTextColor(...MUTED);
    w.doc.text(FAMILY_PROBLEM[group.linea] || "", MARGIN + 12, w.y + 27);
    w.y += 44;

    for (const kit of group.kits) {
      await buildKitBlock(w, idx, kit, market, config);
    }
  }
}

function buildFinalCtaPage(w, config) {
  w.doc.addPage();
  w.y = MARGIN;
  w.h1(COPY.ctaFinalTitle);
  w.p(COPY.ctaFinalBody, { size: 11, color: INK, gap: 18 });

  const whatsapp = firstOf(config.WhatsApp_Ventas);
  w.ensure(40);
  w.doc.setFillColor(...ACCENT);
  w.doc.roundedRect(MARGIN, w.y, 200, 32, 5, 5, "F");
  w.doc.setFont("helvetica", "bold");
  w.doc.setFontSize(11);
  w.doc.setTextColor(5, 46, 18);
  if (whatsapp) {
    w.doc.textWithLink(COPY.ctaFinalButton, MARGIN + 16, w.y + 20,
      { url: whatsappLink(whatsapp, "Hola. Vi el catálogo comercial de Blueprint y quiero evaluar una solución energética para mi necesidad.") });
  } else {
    w.doc.text(COPY.ctaFinalButton, MARGIN + 16, w.y + 20);
  }
  w.y += 48;

  if (whatsapp) {
    w.p(`WhatsApp: ${whatsapp}`, { size: 9, color: MUTED, gap: 12 });
  }
  // Texto auxiliar de precios (Doc 06 v1.1, seccion 21): reemplaza
  // cualquier cifra impresa, sin exponer nada del Pricing Engine.
  w.p(COPY.priceAux, { size: 8, color: MUTED, gap: 20 });

  w.rule();
  w.doc.setFont("helvetica", "normal");
  w.doc.setFontSize(7.6);
  w.doc.setTextColor(...MUTED);
  DISCLAIMER_LINES.forEach((line) => {
    const lines = w.doc.splitTextToSize(line, CONTENT_W);
    w.ensure(lines.length * 10 + 4);
    w.doc.text(lines, MARGIN, w.y);
    w.y += lines.length * 10 + 6;
  });
}

/* ----------------------------------------------------------------------
   4. ORQUESTACION
   -------------------------------------------------------------------- */

/** Arma el documento completo (sin descargarlo) — separado de
 *  generateCommercialCatalog() para poder probarlo en Node/jsdom sin
 *  necesidad de un navegador real (mismo patron que pdfgen.js). */
export async function buildCommercialCatalog({ idx, data, market, language = "Español" } = {}) {
  const config = (data && data.config) || {};
  const resolvedMarket = market || config.Mercado_Default || null;
  const families = resolveActiveKits(idx);
  const generatedAt = new Date();

  const doc = newDoc();
  const w = new DocWriter(doc);

  await buildCoverPage(w, idx, resolvedMarket, families, generatedAt);

  doc.addPage(); w.y = MARGIN;
  buildValuePage(w);

  doc.addPage(); w.y = MARGIN;
  buildServicesPage(w, idx);
  buildScopePage(w);
  buildConfianzaPage(w);
  buildProcesoPage(w);

  doc.addPage(); w.y = MARGIN;
  await buildKitFamilyPages(w, idx, families, resolvedMarket, config);

  buildFinalCtaPage(w, config);

  drawFooters(doc, { brand: COPY.brand, whatsapp: firstOf(config.WhatsApp_Ventas), contactName: firstOf(config.Contacto_Nombre) });

  const filename = resolvedMarket
    ? `Blueprint_Catalogo_Comercial_ES_${slugFile(resolvedMarket)}_${fechaISO(generatedAt)}.pdf`
    : `Blueprint_Catalogo_Comercial_ES_${fechaISO(generatedAt)}.pdf`;

  return { doc, filename, market: resolvedMarket, kitCount: families.reduce((n, g) => n + g.kits.length, 0) };
}

/** API publica (Doc 06 seccion 24.2): genera y descarga el catalogo.
 *  Carga sus propios datos (loadCatalogData) para ser un modulo
 *  autonomo, reusable desde cualquier pantalla del sitio sin depender
 *  de que el router ya haya cargado `ctx`. */
export async function generateCommercialCatalog({ market, language = "Español", download = true } = {}) {
  ensureJsPDF();
  const { idx, data } = await loadCatalogData();
  const result = await buildCommercialCatalog({ idx, data, market, language });
  if (download) result.doc.save(result.filename);
  return result;
}

/* ----------------------------------------------------------------------
   5. UI — estados del boton de descarga (Doc 06 seccion 27).
   -------------------------------------------------------------------- */

/** Conecta un boton "Descargar catálogo comercial" a los 4 estados que
 *  pide el Documento 06: normal -> preparando -> exito (toast) / error
 *  (mensaje, boton nunca queda bloqueado). Se usa tanto en el CTA
 *  principal de la seccion Kits como en el CTA secundario del footer —
 *  una sola implementacion, dos botones (nunca un segundo modulo de
 *  navegacion, seccion 4.3). */
export function attachCatalogButton(el, { market } = {}) {
  if (!el || el.dataset.catalogWired) return;
  el.dataset.catalogWired = "1";
  const normalLabel = el.innerHTML;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    if (el.dataset.busy === "1") return; // evita doble clic (seccion 4.4)
    el.dataset.busy = "1";
    el.setAttribute("aria-busy", "true");
    el.textContent = "Preparando catálogo…";
    try {
      // `market` puede ser un valor fijo o una funcion — el CTA de la
      // seccion Kits pasa una funcion (() => state.market) porque el
      // mercado activo puede cambiar despues de pintar el boton (tabs
      // de mercado), sin que la pantalla vuelva a renderizarse entera.
      const resolvedMarket = typeof market === "function" ? market() : market;
      await generateCommercialCatalog({ market: resolvedMarket });
      showCatalogToast("Catálogo listo.");
    } catch (err) {
      console.error("No se pudo generar el catálogo comercial (PUB-06):", err);
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
