/* ======================================================================
   BLUEPRINT VIEWER 2.0 — core.js
   ----------------------------------------------------------------------
   Capa de datos y utilidades compartidas. Lee /data/*.json, generados
   por scripts/export_to_json.py, SIN modificar su estructura.

   Regla de oro heredada del exportador: si un dato no esta o vino roto
   ("(bloque no encontrado)" es el texto que deja un cruce INDEX/MATCH
   fallido en Excel), la interfaz lo trata como ausente y cae a un campo
   real alternativo o a un estado vacio explicito. Nunca se inventa
   contenido comercial para rellenar un hueco.
   ====================================================================== */

export const DATA_FILES = [
  "products", "kits", "kit_components", "media", "showcase",
  "catalogs", "content_blocks", "comparador", "biblioteca_tecnica",
  "config", "bom", "sellers",
];

/** ---------------------------------------------------------------------
 *  Etiquetas de enums para mostrar (nunca para comparar).
 *  ---------------------------------------------------------------------
 *  Linea, Categoria y Tipo_Sistema son valores que vienen del Excel SIN
 *  tildes a proposito (asi se guardaron desde el inicio del proyecto) y
 *  se usan en todo el codigo como clave de comparacion exacta
 *  (`kit.Linea === "Autonomia"`, `c.Categoria === "Bateria"`,
 *  `kit.Tipo_Sistema === "Hibrido"`, iconos, filtros, puntaje del
 *  diagnostico). Agregarles tilde en el dato origen rompe silenciosamente
 *  esas comparaciones en todo el sitio. Estas funciones NO tocan el dato:
 *  solo lo traducen a su forma correcta en español para mostrarlo al
 *  usuario. Cualquier vista que muestre uno de estos valores crudo debe
 *  pasar por aca en vez de imprimirlo directo. */
const LINEA_LABELS = {
  Autonomia: "Autonomía",
  "Operacion Critica": "Operación Crítica",
  Portatil: "Portátil",
};
export function lineaLabel(linea) {
  return LINEA_LABELS[linea] || linea || "";
}

const CATEGORIA_LABELS = {
  Bateria: "Batería",
};
export function categoriaLabel(categoria) {
  return CATEGORIA_LABELS[categoria] || categoria || "";
}

const TIPO_SISTEMA_LABELS = {
  Hibrido: "Híbrido",
  Portatil: "Portátil",
};
export function tipoSistemaLabel(tipo) {
  return TIPO_SISTEMA_LABELS[tipo] || tipo || "";
}

/** Carga los 11 JSON en paralelo. Si alguno falta, la app sigue viva
 *  con ese dataset en null (cada vista decide como degradar). */
export async function loadAll() {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      try {
        const res = await fetch(`data/${name}.json`);
        if (!res.ok) throw new Error(res.status);
        return [name, await res.json()];
      } catch (err) {
        console.warn(`No se pudo cargar data/${name}.json`, err);
        return [name, null];
      }
    })
  );
  return Object.fromEntries(entries);
}

/** Normaliza valores rotos o vacios (ver "Regla de oro" arriba). */
export function clean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "(bloque no encontrado)") return null;
    return t;
  }
  return v;
}

/** Primer valor no vacio de una lista de candidatos (fallback en cadena). */
export function firstOf(...candidates) {
  for (const c of candidates) {
    const v = clean(c);
    if (v !== null) return v;
  }
  return null;
}

export function fmtUSD(n) {
  if (typeof n !== "number") return null;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtNum(n, decimals = 1) {
  if (typeof n !== "number") return "—";
  return Number(n.toFixed(decimals)).toString();
}

export function waDigits(raw) {
  return (raw || "").replace(/[^\d]/g, "");
}

export function whatsappLink(number, text) {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}

export function slug(text) {
  return (text || "item")
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ruta de imagen tal cual viene del JSON (ya es relativa, ver README:
 *  media_blueprint/SKU/archivo.jpg, sin "/" inicial). null si no hay dato. */
export function img(path) {
  return clean(path);
}

/* ---------------------------------------------------------------------
   Indices en memoria: evitan recorrer arrays completos en cada render.
   --------------------------------------------------------------------- */
export function buildIndices(data) {
  const products = data.products || [];
  const kits = data.kits || [];
  const media = data.media || [];
  const catalogs = data.catalogs || [];
  const showcase = data.showcase || [];
  const biblioteca = data.biblioteca_tecnica || [];
  const kitComponents = data.kit_components || {};
  const contentBlocks = data.content_blocks || [];
  const sellers = data.sellers || [];
  const config = data.config || {};

  const productsBySku = new Map(products.map((p) => [p.SKU, p]));
  const mediaBySku = new Map(media.map((m) => [m.SKU, m]));
  const showcaseBySku = new Map(showcase.map((s) => [s.SKU, s]));
  const bibliotecaBySku = new Map(biblioteca.map((b) => [b.SKU, b]));
  const kitsById = new Map(kits.map((k) => [k.Kit_ID, k]));
  const sellersById = new Map(sellers.map((s) => [s.seller_id, s]));

  const catalogsByKit = new Map();
  for (const c of catalogs) {
    if (!c.Kit_ID) continue;
    if (!catalogsByKit.has(c.Kit_ID)) catalogsByKit.set(c.Kit_ID, []);
    catalogsByKit.get(c.Kit_ID).push(c);
  }

  const contentBlocksByGroup = new Map();
  for (const b of contentBlocks) {
    if (!b.Block_Group) continue;
    if (!contentBlocksByGroup.has(b.Block_Group)) contentBlocksByGroup.set(b.Block_Group, []);
    contentBlocksByGroup.get(b.Block_Group).push(b);
  }

  return {
    products, kits, media, catalogs, showcase, biblioteca, contentBlocks, sellers, config,
    kitComponents,
    productsBySku, mediaBySku, showcaseBySku, bibliotecaBySku,
    kitsById, catalogsByKit, contentBlocksByGroup, sellersById,
  };
}

/** Interruptor unico de precios (SYSTEM_CONFIG!Mostrar_Precios, categoria
 *  "Precios"). "No" explicito los oculta en todo el sitio (tarjetas,
 *  ficha, cotizacion, ficha comercial PDF); cualquier otro valor -- o si
 *  el parametro todavia no existe en el Excel -- los muestra, para que
 *  instalaciones viejas sin este campo sigan funcionando igual que
 *  siempre. Nunca toca Precio_Sugerido_Reventa_USD: el dato real sigue
 *  intacto, solo cambia si se imprime o no. */
export function pricesEnabled(idx) {
  const raw = (idx && idx.config && idx.config.Mostrar_Precios) || "";
  return String(raw).trim().toLowerCase() !== "no";
}

/** ---------------------------------------------------------------------
 *  Vendedor activo (Documento 06 V2, seccion 10 — Personalizacion por
 *  vendedor). Un seller_id valido y activo hace que PUB-06 V2 muestre su
 *  contacto (nombre/WhatsApp) en vez del contacto corporativo, y que el
 *  QR final apunte a su WhatsApp -- asi un vendedor que comparte el
 *  catalogo con un prospecto no pierde la atribucion del lead.
 *
 *  Regla dura de seguridad (seccion 10.5): `sellerId` viene de un
 *  parametro de URL, nunca se confia a ciegas. Solo se acepta si existe
 *  una fila con ese seller_id EXACTO en sellers.json (15_VENDEDORES,
 *  ya filtrado a activos por el exportador) -- cualquier otro valor
 *  cae a null y la vista usa el fallback corporativo (config.json). */
export function sellerFor(idx, sellerId) {
  if (!sellerId) return null;
  const s = idx.sellersById.get(sellerId);
  return s || null;
}

/** Catalogo comercial de un kit para un mercado dado (o el primero
 *  disponible si el mercado pedido no tiene fila propia). */
export function catalogFor(idx, kitId, market) {
  const rows = idx.catalogsByKit.get(kitId) || [];
  if (!rows.length) return null;
  const forMarket = rows.filter((r) => r.Mercado === market);
  const pool = forMarket.length ? forMarket : rows;
  return [...pool].sort((a, b) => (a.Orden || 999) - (b.Orden || 999))[0];
}

export function marketsFrom(catalogs) {
  return [...new Set((catalogs || []).map((c) => c.Mercado).filter(Boolean))];
}

/** ---------------------------------------------------------------------
 *  Imagen propia del kit — NUNCA la de un componente.
 *  ---------------------------------------------------------------------
 *  Fuente unica: catalogs.json -> Imagen_Principal. Es el unico campo
 *  del contrato pensado para representar al KIT como producto
 *  comercial (ver README del exportador).
 *
 *  Regla dura: esta funcion jamas cae en Imagen_Panel / Imagen_Inversor
 *  / Imagen_Bateria ni en la foto del primer componente del BOM. Esos
 *  campos son honestos para mostrar "que trae el kit" (una galeria de
 *  piezas), pero no son una fotografia del kit en si. Usarlos como
 *  imagen principal hace que kits distintos que comparten el mismo
 *  panel o inversor se vean identicos entre si — ese fue el bug
 *  reportado ("todos los kits muestran la misma imagen").
 *
 *  Estrategia de fallback (documentada, no silenciosa): si el kit no
 *  tiene Imagen_Principal asignada en el Excel, esta funcion devuelve
 *  null. La vista (mediaImage() en views.js, o el generador de PDF)
 *  debe entonces mostrar un estado "Imagen pendiente" explicito —
 *  nunca inventar ni tomar prestada una imagen que no pertenece al kit. */
export function kitImage(catalog) {
  return catalog ? clean(catalog.Imagen_Principal) : null;
}

/** ---------------------------------------------------------------------
 *  Estrategia de imagen del kit (simplificada — Plano 03, retiro del mosaico).
 *  ---------------------------------------------------------------------
 *  Nivel 1 — foto propia: catalogs.Imagen_Principal (Hero Product, ver
 *  Documento 06), si el Excel la tiene asignada. Es la unica fuente que
 *  representa al kit como producto (ver kitImage() arriba).
 *
 *  Nivel 2 — nada: si todavia no existe la foto Hero del kit, se
 *  devuelve mosaic vacio y la vista cae al placeholder "Imagen
 *  pendiente" — nunca una imagen que no le pertenece al kit.
 *
 *  Antes existia un Nivel intermedio que armaba una grilla con las
 *  fotos de producto de panel/inversor/bateria (tomadas de catalogs.json
 *  / media.json por SKU) cuando faltaba la foto Hero. Se retiro por dos
 *  problemas reales detectados en el sitio publicado: (1) muchos kits
 *  comparten el mismo SKU de panel/inversor, asi que la misma foto de
 *  producto se repetia identica en varios kits distintos, dando una
 *  sensacion "plantillera"; y (2) esas fotos de producto no estan
 *  pensadas para recortarse (object-fit: cover) dentro de una grilla, lo
 *  que en la ficha de kit (contenedor grande, sin alto de fila
 *  definido para el grid interno) producia una caja gigante desbordada
 *  fuera de pantalla. Mientras un kit no tenga su propia foto Hero, es
 *  preferible el placeholder honesto "Imagen pendiente" a un mosaico
 *  roto o repetido.
 *
 *  Esta funcion nunca usa la imagen del primer componente del BOM en
 *  solitario como si fuera la foto del kit (esa fue la causa del bug
 *  original: "todos los kits muestran la misma imagen"). */
export function kitVisual(catalog) {
  const image = kitImage(catalog);
  if (image) return { image, mosaic: [] };
  return { image: null, mosaic: [] };
}

/** ---------------------------------------------------------------------
 *  Hero Scene / Hero Film (Documento 05B — Cinematic Experience System).
 *  ---------------------------------------------------------------------
 *  Hero Scene: imagen fija que responde "que consigue el cliente" (el
 *  kit en una situacion real de uso) — distinta de Hero Product
 *  (kitImage/kitVisual arriba), que responde "que compra el cliente".
 *  Hero Film: version cinematografica de la misma escena (video corto,
 *  sin sonido, loop), generada kit por kit segun el guion de
 *  `Blueprint_OS_Prompts_Hero_Film.docx`. Hero Scene funciona como Hero
 *  Poster: mientras un kit no tenga Hero Film todavia, se muestra sola
 *  como imagen fija.
 *
 *  Esta funcion solo resuelve los datos (capa de datos de core.js); el
 *  markup video/imagen lo arma Hero Engine
 *  (assets/js/engines/hero-engine.js -- renderKitHero()), que es quien
 *  llama a esta funcion. Ver ese archivo para la regla de arquitectura
 *  "Engines" (2026-08-05).
 *
 *  Orden de la Ficha del kit (Documento 06, seccion 9.2): Hero Scene
 *  primero (seccion narrativa), Hero Product despues (mostrar la
 *  solucion) — ver kitMedia() en views.js para ese segundo bloque, que
 *  no cambia. Sin Hero Scene propia -> null; la vista omite la seccion
 *  narrativa entera en vez de inventar o repetir otra imagen. */
export function kitScene(catalog) {
  if (!catalog) return { scene: null, film: null };
  return { scene: clean(catalog.Imagen_Hero_Scene), film: clean(catalog.Video_Hero_Film) };
}

/** Componentes NO opcionales de un kit (lo que siempre viene incluido). */
export function includedComponents(idx, kitId) {
  return (idx.kitComponents[kitId] || []).filter((c) => !c.Opcional);
}

/** Componentes opcionales de un kit = ampliaciones reales, no inventadas. */
export function optionalComponents(idx, kitId) {
  return (idx.kitComponents[kitId] || []).filter((c) => c.Opcional);
}

/** Garantia real del kit: la mayor garantia entre sus componentes
 *  incluidos (dato calculado, no un campo de marketing roto). */
export function kitWarrantyYears(idx, kitId) {
  const included = includedComponents(idx, kitId);
  const years = included.map((c) => c.Garantia_Anios).filter((n) => typeof n === "number");
  return years.length ? Math.max(...years) : null;
}

/** ---------------------------------------------------------------------
 *  Insignias comerciales reales del kit (Documento 03 — Tarjetas
 *  Inteligentes: "no inferir estos atributos desde nombres ambiguos").
 *  ---------------------------------------------------------------------
 *  Cada insignia sale de un dato real y explicito:
 *  - Tipo de sistema: campo Tipo_Sistema de kits.json.
 *  - WiFi / Monitoreo remoto / Paralelizable / Litio: texto curado de
 *    showcase.json (Nombre_Comercial, Caracteristicas_Principales,
 *    Beneficios) de los componentes REALMENTE incluidos en el kit —
 *    nunca adivinado del nombre del SKU.
 *  - Bateria incluida: Bateria_kWh > 0 en kits.json.
 *  - Expandible: el kit tiene componentes opcionales reales en
 *    kit_components.json (ampliaciones de verdad, no decorativas).
 *  Si ningun dato respalda una insignia, simplemente no aparece. */
export function kitBadges(idx, kitId, kit) {
  const included = includedComponents(idx, kitId);
  const optional = optionalComponents(idx, kitId);
  const badges = [];

  if (kit.Tipo_Sistema === "Hibrido") badges.push("Híbrido");
  else if (kit.Tipo_Sistema === "Off-Grid") badges.push("Off-Grid");
  else if (kit.Tipo_Sistema === "Portatil") badges.push("Portátil");

  const showcaseTexts = included
    .map((c) => idx.showcaseBySku.get(c.SKU))
    .filter(Boolean)
    .map((s) => `${s.Nombre_Comercial || ""} ${s.Caracteristicas_Principales || ""} ${s.Beneficios || ""}`.toLowerCase());
  const anyIncludes = (kw) => showcaseTexts.some((t) => t.includes(kw));

  if (anyIncludes("wifi")) badges.push("WiFi incluido");
  if (anyIncludes("monitoreo")) badges.push("Monitoreo remoto");
  if (anyIncludes("paraleliz")) badges.push("Paralelizable");
  if (anyIncludes("litio")) badges.push("Batería de litio");
  if (typeof kit.Bateria_kWh === "number" && kit.Bateria_kWh > 0) badges.push("Batería incluida");
  if (optional.length > 0) badges.push("Expandible");

  return badges;
}

/* ---------------------------------------------------------------------
   content_blocks.json — bloques reutilizables de texto aprobado
   (Ideal_Para, Que_Puede_Alimentar, Garantia_Comercial, Disclaimer,
   Llamado_a_la_Accion...). Sirven como red de respaldo REAL cuando
   catalogs.json trae el campo vacio o roto ("(bloque no encontrado)",
   ya neutralizado por clean()) — nunca para inventar texto nuevo, solo
   para resolver contenido que ya existe aprobado en otro lugar del
   sistema. Si tampoco hay bloque, se devuelve null y la vista debe
   ocultar el elemento (ver Documento 07, Plano 03).
   --------------------------------------------------------------------- */
export function resolveContentBlock(idx, group, lang = "Español") {
  if (!group) return null;
  const rows = idx.contentBlocksByGroup.get(group) || [];
  if (!rows.length) return null;
  const forLang = rows.find((r) => r.Idioma === lang);
  return clean((forLang || rows[0]).Texto);
}

/** NOTA: Descripcion_Corta y Beneficios_Comerciales por Linea ya se
 *  resuelven del lado del Excel (hoja LINEAS_COMERCIALES, con
 *  Promesa_Valor + Descripcion_Comercial + Beneficio_01..05 por Linea,
 *  heredados por formula en las columnas "(auto)" de CATALOGO_MASTER).
 *  No se duplica ese mecanismo aca con content_blocks.json — en cuanto
 *  el exportador incluya esos campos en catalogs.json, buildKitViewModel()
 *  los va a leer directo (ver mas abajo). Pendiente: actualizar
 *  export_to_json.py para que sepa leer el nuevo esquema de
 *  CATALOGO_MASTER/LINEAS_COMERCIALES — hoy sigue pensado para el
 *  esquema anterior (Mod_7.xlsx). */

/** ---------------------------------------------------------------------
 *  Smart Kit View Model (Documento 07 — Data Binding & Smart Rendering).
 *  ---------------------------------------------------------------------
 *  Punto unico de combinacion de datos por kit: kits.json (identidad) +
 *  catalogs.json via catalogFor() (contenido editorial del mercado) +
 *  content_blocks.json (respaldo real cuando el catalogo no trae el
 *  dato) + kit_components.json (piezas incluidas/opcionales) +
 *  kitVisual() (imagen o mosaico honesto). Las vistas (kitCard,
 *  renderKitDetail, etc.) consumen este objeto en vez de combinar JSON
 *  directamente en el template — asi la jerarquia de fuentes vive en un
 *  solo lugar, documentada, y no se repite ni se contradice entre
 *  pantallas. Nunca inventa un valor: si ninguna fuente lo tiene, el
 *  campo queda en null y la vista decide como degradar. */
export function buildKitViewModel(idx, kitId, { market, lang = "Español" } = {}) {
  const kit = idx.kitsById.get(kitId);
  if (!kit) return null;

  const catalog = catalogFor(idx, kitId, market);
  const included = includedComponents(idx, kitId);
  const optional = optionalComponents(idx, kitId);
  const visual = kitVisual(catalog);

  const name = firstOf(catalog && catalog.Nombre_Comercial, kit.Nombre_Comercial);
  const title = firstOf(catalog && catalog.Titulo, name);

  // Promesa_Valor / Descripcion_Comercial / Beneficio_01..05: contenido
  // por Linea que vive en la hoja LINEAS_COMERCIALES del Excel, heredado
  // por formula en las columnas "(auto)" de CATALOGO_MASTER. AUN NO
  // llega a catalogs.json — el exportador todavia no conoce el nuevo
  // esquema (CATALOGO_MASTER / LINEAS_COMERCIALES). Los nombres de campo
  // de aca abajo son el nombre esperado una vez actualizado el
  // exportador (a confirmar contra su salida real, no inventar
  // contenido si no llegan). Mientras tanto estas 4 lineas devuelven
  // null/[] y todo sigue funcionando con el fallback de siempre.
  const promesaValor = clean(catalog && catalog.Promesa_Valor);
  const descripcionComercial = clean(catalog && catalog.Descripcion_Comercial);
  const beneficiosList = [1, 2, 3, 4, 5]
    .map((n) => catalog && catalog[`Beneficio_0${n}`])
    .map(clean)
    .filter(Boolean);

  // Descripcion_Corta / Beneficios_Comerciales: primero el texto propio
  // del kit si el Excel lo trae para un caso puntual, despues el
  // contenido por Linea (Descripcion_Comercial / Beneficio_01..05) —
  // nunca texto fabricado por el codigo (decision de la propietaria,
  // Plano 03: esto se redacta por Linea, no por kit).
  const description = firstOf(catalog && catalog.Descripcion_Corta, descripcionComercial, catalog && catalog.Subtitulo);
  const subtitle = firstOf(catalog && catalog.Subtitulo, promesaValor, description, kit.Cliente_Objetivo);
  const idealPara = firstOf(catalog && catalog.Ideal_Para, kit.Cliente_Objetivo);
  const feedText = firstOf(catalog && catalog.Que_Puede_Alimentar, kit.Aplicaciones);
  const feed = feedText ? feedText.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const beneficiosRaw = clean(catalog && catalog.Beneficios_Comerciales);
  const beneficios = firstOf(beneficiosRaw, beneficiosList.length ? beneficiosList.join(" ") : null);
  const warrantyYears = kitWarrantyYears(idx, kitId);
  // Garantia_Comercial casi nunca esta cargada por kit todavia — cae al
  // bloque generico GARANTIA_ESTANDAR (texto real, aprobado, el mismo
  // que ya existe en content_blocks.json) en vez de mostrar el campo
  // vacio o el marcador roto del Excel.
  const garantiaComercial = firstOf(
    catalog && catalog.Garantia_Comercial,
    resolveContentBlock(idx, "GARANTIA_ESTANDAR", lang)
  );
  const price = pricesEnabled(idx) ? fmtUSD(kit.Precio_Sugerido_Reventa_USD) : null;

  return {
    id: kit.Kit_ID,
    kit, catalog,
    market: (catalog && catalog.Mercado) || market || null,
    name, title, subtitle, description, idealPara, feed, beneficios,
    promesaValor, beneficiosList,
    badges: kitBadges(idx, kitId, kit),
    linea: kit.Linea || null,
    tipoSistema: kit.Tipo_Sistema || null,
    potenciaPanelKw: typeof kit.Potencia_Panel_kW === "number" ? kit.Potencia_Panel_kW : null,
    potenciaInversorKw: typeof kit.Potencia_Inversor_kW === "number" ? kit.Potencia_Inversor_kW : null,
    bateriaKwh: typeof kit.Bateria_kWh === "number" ? kit.Bateria_kWh : null,
    autonomia: clean(kit.Autonomia_Aprox),
    warrantyYears, garantiaComercial,
    price, currency: "USD",
    image: visual.image, mosaic: visual.mosaic,
    included, optional,
  };
}

/* ---------------------------------------------------------------------
   Router hash-based: compatible con GitHub Pages (sin backend, sin
   configuracion de servidor). Formato: #/ruta/param

   Nota: el reveal-on-scroll (antes vivia aca como initScrollReveal) se
   mudo a assets/js/engines/animation-engine.js -- es movimiento, no
   dato ni ruteo, y ahora comparte una sola prefersReducedMotion() con
   el resto del sitio (regla de arquitectura "Engines", 2026-08-05).
   --------------------------------------------------------------------- */
/** `runRender` envuelve cada render de ruta (navegar y pintar). Por
 *  defecto solo ejecuta la funcion tal cual; app.js pasa una version
 *  que ademas usa la View Transitions API del navegador para que
 *  cambiar de pantalla se sienta como una continuacion y no como un
 *  corte (Documento 05: "el usuario nunca debe sentir que cambia de
 *  pagina"). Mantenerlo opcional aca deja el router testeable sin DOM
 *  real (jsdom no siempre implementa startViewTransition). */
/** Parametros de query dentro del hash (`#/kits?market=CU&seller=CARLOS01`).
 *  El router de abajo corta todo lo que sigue al "?" para resolver la
 *  ruta, asi que hasta ahora esos parametros se leian pero se tiraban.
 *  Cualquier vista (o PUB-06 V2, Documento 06 seccion 10) puede llamar
 *  esto para leer `seller`/`market` sin duplicar el parseo. */
export function hashQuery() {
  const hash = location.hash.replace(/^#/, "");
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return {};
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  return Object.fromEntries(params.entries());
}

export function initRouter(routes, fallback, runRender = (fn) => fn()) {
  function currentPath() {
    const hash = location.hash.replace(/^#/, "") || "/";
    return hash.split("?")[0];
  }
  function resolve() {
    const path = currentPath();
    const segments = path.split("/").filter(Boolean);
    for (const route of routes) {
      const match = route.match(segments);
      if (match) {
        runRender(() => { window.scrollTo(0, 0); route.handler(match); });
        return;
      }
    }
    runRender(fallback);
  }
  window.addEventListener("hashchange", resolve);
  window.addEventListener("DOMContentLoaded", resolve);
  return resolve;
}

/** Helper para declarar una ruta: route(["kit", ":id"], (params) => {...}) */
export function makeRoute(pattern, handler) {
  const parts = pattern;
  return {
    handler,
    match(segments) {
      if (segments.length !== parts.length) return null;
      const params = {};
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
        else if (parts[i] !== segments[i]) return null;
      }
      return params;
    },
  };
}

/** Estado de UI compartido entre vistas (mercado activo, seleccion del
 *  comparador). No se persiste: vive solo mientras dura la sesion. */
export const state = {
  market: null,
  compareKits: [],
  compareComponents: {},
};
